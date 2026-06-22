import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { pool } from '../setup_db.js';
import { sessionAuth } from '../middleware/sessionAuth.js';
import { encryptOptional } from '../crypto.js';

export const dashboardRouter = Router();

// All dashboard routes require session auth
dashboardRouter.use(sessionAuth);

// GET /api/v1/dashboard
dashboardRouter.get('/', async (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    try {
        const [metricsResult, incidentsResult, probesResult] = await Promise.all([
            pool.query(
                `SELECT probe_id, cpu_usage, memory_usage, timestamp
                 FROM system_metrics
                 WHERE tenant_id = $1
                 ORDER BY timestamp DESC
                 LIMIT 20`,
                [tenantId]
            ),
            pool.query(
                `SELECT id, probe_id, severity, status, issue_type, pr_url, error_message, created_at, updated_at
                 FROM incidents
                 WHERE tenant_id = $1
                 ORDER BY created_at DESC
                 LIMIT 5`,
                [tenantId]
            ),
            pool.query(
                `SELECT probe_id, status, last_seen
                 FROM probes
                 WHERE tenant_id = $1`,
                [tenantId]
            ),
        ]);

        return res.json({
            metrics: metricsResult.rows.reverse(),
            incidents: incidentsResult.rows,
            probes: probesResult.rows,
        });
    } catch (err) {
        console.error('Dashboard error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/v1/incidents/:id
dashboardRouter.get('/incidents/:id', async (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    const { id } = req.params;

    try {
        const [incidentResult, timelineResult] = await Promise.all([
            pool.query(
                `SELECT * FROM incidents WHERE id = $1 AND tenant_id = $2`,
                [id, tenantId]
            ),
            pool.query(
                `SELECT from_status, to_status, note, occurred_at
                 FROM incident_timeline
                 WHERE incident_id = $1
                 ORDER BY occurred_at ASC`,
                [id]
            ),
        ]);

        if (incidentResult.rows.length === 0) {
            return res.status(404).json({ error: 'Incident not found' });
        }

        return res.json({
            incident: incidentResult.rows[0],
            timeline: timelineResult.rows,
        });
    } catch (err) {
        console.error('Incident detail error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/v1/settings
dashboardRouter.get('/settings', async (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    try {
        const result = await pool.query<{
            email: string;
            api_key: string;
            github_repo: string | null;
            github_token: string | null;
            gemini_key: string | null;
            webhook_url: string | null;
            onboarding_step: number;
        }>(
            `SELECT email, api_key, github_repo, github_token, gemini_key, webhook_url, onboarding_step
             FROM tenants WHERE id = $1`,
            [tenantId]
        );

        if (result.rows.length === 0) return res.status(404).json({ error: 'Tenant not found' });

        const t = result.rows[0];
        return res.json({
            email: t.email,
            apiKey: t.api_key,
            githubRepo: t.github_repo,
            githubTokenSet: !!t.github_token,
            geminiKeySet: !!t.gemini_key,
            webhookUrl: t.webhook_url,
            onboardingStep: t.onboarding_step,
        });
    } catch (err) {
        console.error('Settings GET error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

const SettingsUpdateSchema = z.object({
    githubRepo: z.string().max(255).optional(),
    githubToken: z.string().optional(),
    geminiKey: z.string().optional(),
    webhookUrl: z.string().url().optional().or(z.literal('')),
});

// PATCH /api/v1/settings
dashboardRouter.patch('/settings', async (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    const parsed = SettingsUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0].message });
    }

    const { githubRepo, githubToken, geminiKey, webhookUrl } = parsed.data;

    try {
        const updates: string[] = [];
        const values: unknown[] = [];
        let idx = 1;

        if (githubRepo !== undefined) { updates.push(`github_repo = $${idx++}`); values.push(githubRepo); }
        if (githubToken !== undefined) { updates.push(`github_token = $${idx++}`); values.push(encryptOptional(githubToken)); }
        if (geminiKey !== undefined) { updates.push(`gemini_key = $${idx++}`); values.push(encryptOptional(geminiKey)); }
        if (webhookUrl !== undefined) { updates.push(`webhook_url = $${idx++}`); values.push(webhookUrl || null); }

        if (updates.length === 0) return res.json({ message: 'No changes' });

        updates.push(`updated_at = NOW()`);
        values.push(tenantId);

        await pool.query(
            `UPDATE tenants SET ${updates.join(', ')} WHERE id = $${idx}`,
            values
        );

        return res.json({ message: 'Settings updated' });
    } catch (err) {
        console.error('Settings PATCH error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/v1/settings/rotate-key
dashboardRouter.post('/settings/rotate-key', async (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    try {
        const newApiKey = randomBytes(32).toString('hex');
        await pool.query(
            `UPDATE tenants SET api_key = $1, updated_at = NOW() WHERE id = $2`,
            [newApiKey, tenantId]
        );
        return res.json({ apiKey: newApiKey, message: 'API key rotated. Update your Probe configuration.' });
    } catch (err) {
        console.error('Rotate key error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/v1/onboarding
dashboardRouter.get('/onboarding', async (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    try {
        const result = await pool.query<{ api_key: string; onboarding_step: number }>(
            'SELECT api_key, onboarding_step FROM tenants WHERE id = $1',
            [tenantId]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Tenant not found' });

        const { api_key, onboarding_step } = result.rows[0];
        const orchestratorUrl = process.env.ORCHESTRATOR_URL ?? 'http://localhost:3000';

        const installCommand = [
            `export AEGIS_API_KEY="${api_key}"`,
            `export AEGIS_ENDPOINT="${orchestratorUrl}"`,
            `g++ main.cpp -o aegis-probe -pthread -std=c++17`,
            `./aegis-probe --api-key "$AEGIS_API_KEY" --endpoint "$AEGIS_ENDPOINT" --log-file /var/log/app.log`,
        ].join(' && \\\n  ');

        return res.json({ step: onboarding_step, apiKey: api_key, installCommand });
    } catch (err) {
        console.error('Onboarding GET error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/v1/onboarding/complete
dashboardRouter.post('/onboarding/complete', async (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    try {
        await pool.query(
            `UPDATE tenants SET onboarding_step = 5, updated_at = NOW() WHERE id = $1`,
            [tenantId]
        );
        return res.json({ message: 'Onboarding complete' });
    } catch (err) {
        console.error('Onboarding complete error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
