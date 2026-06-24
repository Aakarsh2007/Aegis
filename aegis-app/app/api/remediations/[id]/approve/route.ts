import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { executeRemediation } from "@/lib/remediation";
import { headers } from "next/headers";

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
    const result = await executeRemediation(id, userId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.errorMessage ?? "Failed to apply remediation patch" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      message: "Patch applied — PR opened successfully",
      prUrl: result.prUrl,
      prNumber: result.prNumber,
      branchName: result.branchName,
    });
  } catch (err) {
    console.error("[Remediation Approve] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
