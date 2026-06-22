import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { pool } from '../setup_db.js';
import { probeAuth } from '../middleware/probeAuth.js';
import { evaluateThresholds } from '../incidents.js';

export const metricsRouter = Router();

const MetricsSchema = z.object({
    probe_id: z.string().min(1).max(100),
    cpu: z.number().min(0).max(100),
    memory: z.number().min(0).max(100),
    stack_trace: z.string().optional(),
});

const HealthSchema = z.object({
    probe_id: z.string().min(1).max(100),
    status: z.enum(['online', 'offline']).default('online'),
    timestamp: z.number().int().optional(),
});

// POST /api/v1/metrics
metricsRouter.post('/', probeAuth, async (req: Request, res: Response) => {
    const parsed = MetricsSchema.safeParse(req.body);
    if (!parsed.success) {
        const firstError = parsed.error.errors[0];
        return res.status(400).json({ error: `Invalid field: ${firstError.path.join('.')} — ${firstError.message}` });
    }

    const { probe_id, cpu, memory, stack_trace } = parsed.data;
    const tenantId = req.tenantId!;

    try {
        // Upsert probe record
        await pool.query(
            `INSERT INTO probes (tenant_id, probe_id, last_seen, status)
             VALUES ($1, $2, NOW(), 'online')
             ON CONFLICT (tenant_id, probe_id) DO UPDATE
             SET last_seen = NOW(), status = 'online'`,
            [tenantId, probe_id]
        );

        // Insert metric
        await pool.query(
            `INSERT INTO system_metrics (tenant_id, probe_id, cpu_usage, memory_usage)
             VALUES ($1, $2, $3, $4)`,
            [tenantId, probe_id, cpu, memory]
        );

        // Evaluate thresholds
        const incidentId = await evaluateThresholds(tenantId, probe_id, cpu, memory, stack_trace);

        return res.status(200).json({ message: 'Metrics processed', incidentId: incidentId ?? null });
    } catch (err) {
        console.error('Metrics error:', err);
        return res.status(500).json({ error: 'Failed to process metrics' });
    }
});

// POST /api/v1/health
metricsRouter.post('/health', probeAuth, async (req: Request, res: Response) => {
    const parsed = HealthSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid health payload' });
    }

    const { probe_id, status } = parsed.data;
    const tenantId = req.tenantId!;

    try {
        await pool.query(
            `INSERT INTO probes (tenant_id, probe_id, last_seen, status)
             VALUES ($1, $2, NOW(), $3)
             ON CONFLICT (tenant_id, probe_id) DO UPDATE
             SET last_seen = NOW(), status = $3`,
            [tenantId, probe_id, status]
        );

        return res.status(200).json({ message: 'Heartbeat recorded' });
    } catch (err) {
        console.error('Health error:', err);
        return res.status(500).json({ error: 'Failed to record heartbeat' });
    }
});
