import { db } from "@/lib/db";
import { incidents, incidentEvents, systemMetrics } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { remediateIncident } from "@/lib/remediation";
import { after } from "next/server";

const CPU_THRESHOLD = parseFloat(process.env.CPU_THRESHOLD ?? "80");
const MEM_THRESHOLD = parseFloat(process.env.MEM_THRESHOLD ?? "90");

export async function evaluateThresholds(
  userId: string,
  probeId: string,
  cpu: number,
  memory: number,
  stackTrace?: string
): Promise<string | null> {
  const cpuBreach = cpu > CPU_THRESHOLD;
  const memBreach = memory > MEM_THRESHOLD;
  const hasStackTrace = !!stackTrace && stackTrace.length > 5;

  if (!cpuBreach && !memBreach && !hasStackTrace) return null;

  // Determine issue type
  let issueType: string;
  if (hasStackTrace) {
    issueType = "Crash Detected";
  } else if (cpuBreach && memBreach) {
    issueType = `CRITICAL: CPU (${cpu.toFixed(1)}%) and Memory (${memory.toFixed(1)}%) Spike`;
  } else if (cpuBreach) {
    issueType = `High CPU Spike (${cpu.toFixed(1)}%)`;
  } else {
    issueType = `Severe Memory Leak (${memory.toFixed(1)}%)`;
  }

  // Check for existing open/analyzing incident
  const existing = await db
    .select({ id: incidents.id })
    .from(incidents)
    .where(
      and(
        eq(incidents.userId, userId),
        eq(incidents.probeId, probeId),
        inArray(incidents.status, ["open", "analyzing"])
      )
    )
    .limit(1);

  if (existing.length > 0) {
    return existing[0].id;
  }

  const severity =
    (cpuBreach && memBreach) || hasStackTrace ? "critical" : "warning";

  // Create new incident
  const [incident] = await db
    .insert(incidents)
    .values({
      userId,
      probeId,
      severity,
      status: "open",
      title: issueType,
      issueType,
      stackTrace: stackTrace ?? null,
    })
    .returning({ id: incidents.id });

  const incidentId = incident.id;

  // Log the initial event
  await db.insert(incidentEvents).values({
    incidentId,
    eventType: "status_change",
    fromStatus: null,
    toStatus: "open",
    message: "Incident detected by Aegis probe",
  });

  // Update to analyzing
  await db
    .update(incidents)
    .set({ status: "analyzing", updatedAt: new Date() })
    .where(eq(incidents.id, incidentId));

  await db.insert(incidentEvents).values({
    incidentId,
    eventType: "status_change",
    fromStatus: "open",
    toStatus: "analyzing",
    message: "AI remediation dispatched",
  });

  // Background remediation proposal and execution
  after(() => {
    remediateIncident({
      incidentId,
      userId,
      probeId,
      cpu,
      memory,
      issueType,
      stackTrace,
    }).catch((err) =>
      console.error(`[Remediation Proposal] Unhandled error for incident ${incidentId}:`, err)
    );
  });

  return incidentId;
}

export async function getRecentMetrics(userId: string, limit = 20) {
  const metrics = await db
    .select()
    .from(systemMetrics)
    .where(eq(systemMetrics.userId, userId))
    .orderBy(systemMetrics.timestamp)
    .limit(limit);

  return metrics;
}
