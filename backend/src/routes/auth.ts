import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { pool } from '../setup_db.js';
import { signSessionToken, SESSION_COOKIE_OPTIONS } from '../middleware/sessionAuth.js';

export const authRouter = Router();

const RegisterSchema = z.object({
    email: z.string().email({ message: 'Invalid email address' }),
    password: z.string().min(8, { message: 'Password must be at least 8 characters' }),
});

const LoginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
});

// POST /api/v1/auth/register
authRouter.post('/register', async (req: Request, res: Response) => {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) {
        const firstError = parsed.error.errors[0];
        return res.status(400).json({ error: firstError.message, field: firstError.path[0] });
    }

    const { email, password } = parsed.data;

    try {
        const passwordHash = await bcrypt.hash(password, 12);
        const apiKey = randomBytes(32).toString('hex'); // 64 hex chars

        const result = await pool.query<{ id: string }>(
            `INSERT INTO tenants (email, password_hash, api_key)
             VALUES ($1, $2, $3)
             RETURNING id`,
            [email, passwordHash, apiKey]
        );

        const tenantId = result.rows[0].id;
        return res.status(201).json({ tenantId, apiKey, message: 'Registration successful' });
    } catch (err: unknown) {
        const pgErr = err as { code?: string };
        if (pgErr.code === '23505') {
            return res.status(409).json({ error: 'Email already registered' });
        }
        console.error('Register error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/v1/auth/login
authRouter.post('/login', async (req: Request, res: Response) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    const { email, password } = parsed.data;

    try {
        const result = await pool.query<{ id: string; password_hash: string; onboarding_step: number }>(
            'SELECT id, password_hash, onboarding_step FROM tenants WHERE email = $1',
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const tenant = result.rows[0];
        const valid = await bcrypt.compare(password, tenant.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const token = signSessionToken(tenant.id);
        res.cookie('aegis_session', token, SESSION_COOKIE_OPTIONS);

        return res.status(200).json({
            tenantId: tenant.id,
            email,
            onboardingStep: tenant.onboarding_step,
        });
    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/v1/auth/logout
authRouter.post('/logout', (_req: Request, res: Response) => {
    res.clearCookie('aegis_session', { path: '/' });
    return res.status(200).json({ message: 'Logged out successfully' });
});
