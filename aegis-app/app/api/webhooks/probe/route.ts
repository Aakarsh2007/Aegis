import { NextRequest, NextResponse } from "next/server";
import { validateProbeApiKey } from "@/lib/probe-auth";
import { ProbeMetricsSchema } from "@/lib/validations";
import { db } from "@/lib/db";
import { probes, systemMetrics } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { evaluateThresholds } from "@/lib/incidents";

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Validate API key
  const authHeader = request.headers.get("authorization");
  const auth = await validateProbeApiKey(authHeader);

  if (!auth) {
    return NextResponse.json(
      { error: "Invalid or missing API key", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const { userId } = auth;

  // Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body", code: "BAD_REQUEST" },
      { status: 400 }
    );
  }

  const parsed = ProbeMetricsSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0];
    return NextResponse.json(
      {
        error: `Invalid field: ${firstError.path.join(".")} — ${firstError.message}`,
        code: "VALIDATION_ERROR",
      },
      { status: 400 }
    );
  }

  const { probe_id, cpu, memory, disk, stack_trace, hostname, version } =
    parsed.data;

  try {
    // Upsert probe record
    const existingProbe = await db
      .select({ id: probes.id })
      .from(probes)
      .where(and(eq(probes.userId, userId), eq(probes.probeId, probe_id)))
      .limit(1);

    if (existingProbe.length > 0) {
      await db
        .update(probes)
        .set({
          lastSeen: new Date(),
          status: "online",
          ...(hostname ? { hostname } : {}),
          ...(version ? { version } : {}),
        })
        .where(and(eq(probes.userId, userId), eq(probes.probeId, probe_id)));
    } else {
      await db.insert(probes).values({
        userId,
        probeId: probe_id,
        name: probe_id,
        hostname: hostname ?? null,
        version: version ?? null,
        lastSeen: new Date(),
        status: "online",
      });
    }

    // Insert metric
    await db.insert(systemMetrics).values({
      userId,
      probeId: probe_id,
      cpuUsage: cpu,
      memoryUsage: memory,
      diskUsage: disk ?? null,
      timestamp: new Date(),
    });

    // Evaluate thresholds (async incident creation)
    const incidentId = await evaluateThresholds(
      userId,
      probe_id,
      cpu,
      memory,
      stack_trace
    );

    return NextResponse.json(
      { message: "Metrics processed", incidentId: incidentId ?? null },
      { status: 200 }
    );
  } catch (err) {
    console.error("[Probe Webhook] Error:", err);
    return NextResponse.json(
      { error: "Failed to process metrics", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
