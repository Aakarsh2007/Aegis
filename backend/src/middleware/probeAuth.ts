import type { Request, Response, NextFunction } from 'express';
import { pool, LOCAL_MODE_TENANT_ID } from '../setup_db.js';

const BEARER_REGEX = /^Bearer\s+([a-f0-9]{64})$/i;

export async function probeAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    // LOCAL_MODE: bypass auth, assign to default tenant
    if (process.env.LOCAL_MODE === 'true') {
        req.tenantId = LOCAL_MODE_TENANT_ID;
        next();
        return;
    }

    const authHeader = req.headers.authorization;

    // Missing or malformed header → 401
    if (!authHeader || !BEARER_REGEX.test(authHeader)) {
        res.status(401).json({ error: 'Missing or malformed Authorization header. Use: Authorization: Bearer <api_key>' });
        return;
    }

    const match = authHeader.match(BEARER_REGEX);
    const apiKey = match![1];

    try {
        const result = await pool.query<{ id: string }>(
            'SELECT id FROM tenants WHERE api_key = $1',
            [apiKey]
        );

        if (result.rows.length === 0) {
            // Valid format but unknown key → 403
            res.status(403).json({ error: 'Invalid API key' });
            return;
        }

        req.tenantId = result.rows[0].id;
        next();
    } catch (err) {
        console.error('Probe auth DB error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
}
