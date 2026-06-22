import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { systemMetrics, incidents, probes } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { headers } from "next/headers";

export async function GET(): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    const [metricsRows, incidentsRows, probesRows] = await Promise.all([
      db
        .select()
        .from(systemMetrics)
        .where(eq(systemMetrics.userId, userId))
        .orderBy(desc(systemMetrics.timestamp))
        .limit(20),

      db
        .select()
        .from(incidents)
        .where(eq(incidents.userId, userId))
        .orderBy(desc(incidents.createdAt))
        .limit(5),

      db
        .select()
        .from(probes)
        .where(eq(probes.userId, userId)),
    ]);

    // Return metrics in chronological order (oldest first for chart)
    const metrics = [...metricsRows].reverse();

    const latestCpu = metrics.at(-1)?.cpuUsage ?? 0;
    const latestMem = metrics.at(-1)?.memoryUsage ?? 0;
    const openIncidents = incidentsRows.filter(
      (i) => i.status === "open" || i.status === "analyzing"
    ).length;
    const probesOnline = probesRows.filter((p) => p.status === "online").length;

    return NextResponse.json({
      metrics,
      incidents: incidentsRows,
      probes: probesRows,
      stats: {
        latestCpu,
        latestMem,
        openIncidents,
        probesOnline,
        totalProbes: probesRows.length,
      },
    });
  } catch (err) {
    console.error("[Dashboard] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
