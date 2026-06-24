import { NextRequest, NextResponse } from "next/server";
import { validateProbeApiKey } from "@/lib/probe-auth";
import { ProbeHealthSchema } from "@/lib/validations";
import { db } from "@/lib/db";
import { probes } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  const authResult = await validateProbeApiKey(authHeader);
  if (!authResult) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = ProbeHealthSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0].message },
      { status: 400 }
    );
  }

  const { probe_id, status, hostname, version } = parsed.data;
  const { userId } = authResult;

  try {
    const existing = await db
      .select({ id: probes.id })
      .from(probes)
      .where(and(eq(probes.userId, userId), eq(probes.probeId, probe_id)))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(probes)
        .set({
          lastSeen: new Date(),
          status,
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
        status,
      });
    }

    return NextResponse.json({ message: "Heartbeat recorded" });
  } catch (err) {
    console.error("[Probe Health] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
