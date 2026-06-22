import { pool } from './setup_db.js';
import { decryptOptional } from './crypto.js';

export async function dispatchRemediation(
    tenantId: string,
    incidentId: string,
    probeId: string,
    cpuUsage: number,
    memoryUsage: number,
    issueType: string,
    stackTrace?: string
): Promise<void> {
    const aiAgentUrl = process.env.AI_AGENT_URL ?? 'http://localhost:8000';

    try {
        // Fetch tenant credentials (encrypted at rest)
        const tenantResult = await pool.query<{
            github_token: string | null;
            github_repo: string | null;
            gemini_key: string | null;
            webhook_url: string | null;
        }>(
            'SELECT github_token, github_repo, gemini_key, webhook_url FROM tenants WHERE id = $1',
            [tenantId]
        );

        if (tenantResult.rows.length === 0) {
            throw new Error(`Tenant ${tenantId} not found`);
        }

        const tenant = tenantResult.rows[0];
        const githubToken = decryptOptional(tenant.github_token);
        const geminiKey = decryptOptional(tenant.gemini_key);

        const payload = {
            incident_id: incidentId,
            tenant_id: tenantId,
            probe_id: probeId,
            cpu_usage: cpuUsage,
            memory_usage: memoryUsage,
            issue_type: issueType,
            stack_trace: stackTrace ?? 'No stack trace provided.',
            github_token: githubToken,
            github_repo: tenant.github_repo,
            gemini_key: geminiKey,
        };

        console.log(`[Remediation] Dispatching to AI Agent for incident ${incidentId}`);

        const response = await fetch(`${aiAgentUrl}/remediate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(120_000), // 2 min timeout
        });

        const data = (await response.json()) as {
            status: string;
            pr_url?: string;
            message?: string;
            failed_step?: string;
        };

        if (data.status === 'success' && data.pr_url) {
            await pool.query(
                `UPDATE incidents SET status = 'Resolved', pr_url = $1, updated_at = NOW() WHERE id = $2`,
                [data.pr_url, incidentId]
            );
            await pool.query(
                `INSERT INTO incident_timeline (incident_id, from_status, to_status, note)
                 VALUES ($1, 'Analyzing', 'Resolved', $2)`,
                [incidentId, `PR created: ${data.pr_url}`]
            );
            console.log(`[Remediation] ✅ Incident ${incidentId} resolved. PR: ${data.pr_url}`);

            // Fire webhook if configured
            if (tenant.webhook_url) {
                fireWebhook(tenant.webhook_url, incidentId, data.pr_url).catch(console.error);
            }
        } else {
            const errMsg = data.message ?? `Failed at step: ${data.failed_step ?? 'unknown'}`;
            await markFailed(incidentId, errMsg);
        }
    } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[Remediation] ❌ Incident ${incidentId} failed: ${errMsg}`);
        await markFailed(incidentId, errMsg);
    }
}

async function markFailed(incidentId: string, errorMessage: string): Promise<void> {
    try {
        await pool.query(
            `UPDATE incidents SET status = 'Failed', error_message = $1, updated_at = NOW() WHERE id = $2`,
            [errorMessage, incidentId]
        );
        await pool.query(
            `INSERT INTO incident_timeline (incident_id, from_status, to_status, note)
             VALUES ($1, 'Analyzing', 'Failed', $2)`,
            [incidentId, errorMessage]
        );
    } catch (err) {
        console.error(`[Remediation] Could not update incident ${incidentId} to Failed:`, err);
    }
}

async function fireWebhook(url: string, incidentId: string, prUrl: string): Promise<void> {
    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'incident.resolved', incidentId, prUrl }),
        signal: AbortSignal.timeout(10_000),
    });
}
