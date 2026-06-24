import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { scanRepository } from "@/lib/repo-scanner";
import { headers } from "next/headers";

export const maxDuration = 60;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const userId = session.user.id;

  try {
    // Fire off scan async — return immediately so the UI doesn't time out
    // The scan runs in background and creates incidents as it finds issues
    const result = await scanRepository(userId, id);

    return NextResponse.json({
      message: result.success
        ? `Scan complete: ${result.issuesFound} issues found across ${result.filesScanned} files`
        : `Scan failed: ${result.errorMessage}`,
      ...result,
    }, { status: result.success ? 200 : 400 });
  } catch (err) {
    console.error("[Scan API] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
