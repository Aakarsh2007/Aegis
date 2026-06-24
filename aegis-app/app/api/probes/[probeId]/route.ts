import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { probes } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ probeId: string }> }
): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { probeId } = await params;
  const userId = session.user.id;

  try {
    const result = await db
      .delete(probes)
      .where(and(eq(probes.id, probeId), eq(probes.userId, userId)))
      .returning({ id: probes.id });

    if (result.length === 0) {
      return NextResponse.json({ error: "Probe not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Probe deleted" });
  } catch (err) {
    console.error("[Delete Probe] Error:", err);
    return NextResponse.json({ error: "Failed to delete probe" }, { status: 500 });
  }
}
