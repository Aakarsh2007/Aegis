import { NextRequest, NextResponse } from "next/server";
import { validateProbeApiKey } from "@/lib/probe-auth";
import { ProbeHealthSchema } from "@/lib/validations";
import { db } from "@/lib/db";
import { probes } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  const auth = await validateProbeApiKey(authHeader);

  if (!auth) {
    return NextResponse.json(
      { error: "Invalid or missing API key", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const { userId } = auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body", code: "BAD_REQUEST" },
      { status: 400 }
    );
  }

  const parsed = ProbeHealthSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0].message, code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const { probe_id, status, hostname, version } = parsed.data;

  try {
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
          status: status,
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
        status: status,
      });
    }

    return NextResponse.json({ message: "Heartbeat processed" });
  } catch (err) {
    console.error("[Health Webhook] Error:", err);
    return NextResponse.json(
      { error: "Failed to process heartbeat", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
