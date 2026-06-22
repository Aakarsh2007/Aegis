import { pool } from './setup_db.js';
import { dispatchRemediation } from './remediation.js';

const CPU_THRESHOLD = parseFloat(process.env.CPU_THRESHOLD ?? '80');
const MEM_THRESHOLD = parseFloat(process.env.MEM_THRESHOLD ?? '90');

export async function evaluateThresholds(
    tenantId: string,
    probeId: string,
    cpu: number,
    memory: number,
    stackTrace?: string
): Promise<string | null> {
    const cpuBreach = cpu > CPU_THRESHOLD;
    const memBreach = memory > MEM_THRESHOLD;

    if (!cpuBreach && !memBreach && !stackTrace) return null;

    let issueType = '';
    if (stackTrace && stackTrace.length > 5) {
        issueType = 'Crash Detected';
    } else if (cpuBreach && memBreach) {
        issueType = `CRITICAL: CPU (${cpu.toFixed(1)}%) and Memory (${memory.toFixed(1)}%) Spike`;
    } else if (cpuBreach) {
        issueType = `High CPU Spike (${cpu.toFixed(1)}%)`;
    } else {
        issueType = `Severe Memory Leak (${memory.toFixed(1)}%)`;
    }

    // Check for existing open/analyzing incident
    const existing = await pool.query<{ id: string }>(
        `SELECT id FROM incidents
         WHERE tenant_id = $1 AND probe_id = $2 AND status IN ('Open', 'Analyzing')
         LIMIT 1`,
        [tenantId, probeId]
    );

    if (existing.rows.length > 0) {
        return existing.rows[0].id;
    }

    // Create new incident
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const severity = (cpuBreach && memBreach) || (stackTrace && stackTrace.length > 5)
            ? 'Critical'
            : 'Warning';

        const incidentResult = await client.query<{ id: string }>(
            `INSERT INTO incidents (tenant_id, probe_id, severity, status, issue_type, stack_trace)
             VALUES ($1, $2, $3, 'Open', $4, $5)
             RETURNING id`,
            [tenantId, probeId, severity, issueType, stackTrace ?? null]
        );
        const incidentId = incidentResult.rows[0].id;

        await client.query(
            `INSERT INTO incident_timeline (incident_id, from_status, to_status, note)
             VALUES ($1, NULL, 'Open', 'Incident detected by Aegis probe')`,
            [incidentId]
        );

        await client.query(
            `UPDATE incidents SET status = 'Analyzing', updated_at = NOW() WHERE id = $1`,
            [incidentId]
        );

        await client.query(
            `INSERT INTO incident_timeline (incident_id, from_status, to_status, note)
             VALUES ($1, 'Open', 'Analyzing', 'AI Agent dispatched')`,
            [incidentId]
        );

        await client.query('COMMIT');

        // Dispatch AI remediation async — don't block the probe response
        dispatchRemediation(tenantId, incidentId, probeId, cpu, memory, issueType, stackTrace).catch(
            (err) => console.error(`[Remediation] Unhandled error for incident ${incidentId}:`, err)
        );

        return incidentId;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}
