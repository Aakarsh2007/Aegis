import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { incidents, incidentEvents, remediations } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { headers } from "next/headers";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const userId = session.user.id;

  try {
    const [incidentRows, eventsRows, remediationRows] = await Promise.all([
      db
        .select()
        .from(incidents)
        .where(and(eq(incidents.id, id), eq(incidents.userId, userId)))
        .limit(1),

      db
        .select()
        .from(incidentEvents)
        .where(eq(incidentEvents.incidentId, id))
        .orderBy(asc(incidentEvents.createdAt)),

      db
        .select()
        .from(remediations)
        .where(eq(remediations.incidentId, id))
        .limit(1),
    ]);

    if (incidentRows.length === 0) {
      return NextResponse.json({ error: "Incident not found" }, { status: 404 });
    }

    return NextResponse.json({
      incident: incidentRows[0],
      events: eventsRows,
      remediation: remediationRows[0] ?? null,
    });
  } catch (err) {
    console.error("[Incident Detail] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
