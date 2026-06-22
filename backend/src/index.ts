import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

import { setupDatabase, runRetentionCleanup } from './setup_db.js';
import { authRouter } from './routes/auth.js';
import { metricsRouter } from './routes/metrics.js';
import { dashboardRouter } from './routes/dashboard.js';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT ?? '3000', 10);

// ── Security middleware ──────────────────────────────────────────────────────
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:'],
        },
    },
    hsts: process.env.NODE_ENV === 'production'
        ? { maxAge: 31536000, includeSubDomains: true }
        : false,
}));

const allowedOrigin = process.env.ALLOWED_ORIGIN ?? 'http://localhost:3001';
app.use(cors({
    origin: allowedOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));

// ── Rate limiting on metrics ingest ─────────────────────────────────────────
const metricsLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        const auth = req.headers.authorization ?? '';
        const match = auth.match(/^Bearer\s+([a-f0-9]+)$/i);
        return match ? match[1] : req.ip ?? 'unknown';
    },
    message: { error: 'Rate limit exceeded. Max 60 requests per minute per API key.' },
});

// ── Routes ───────────────────────────────────────────────────────────────────
app.get('/', (_req, res) => {
    res.json({ service: 'Aegis Orchestrator', version: '2.0.0', status: 'online' });
});

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/metrics', metricsLimiter, metricsRouter);
app.use('/api/v1/health', metricsRouter); // health heartbeat uses same router
app.use('/api/v1', dashboardRouter);

// ── Start server ─────────────────────────────────────────────────────────────
async function start() {
    try {
        await setupDatabase();

        app.listen(PORT, () => {
            console.log(`🛡️  Aegis Orchestrator running on port ${PORT}`);
            console.log(`   Mode: ${process.env.LOCAL_MODE === 'true' ? '⚙️  LOCAL' : '☁️  CLOUD'}`);
        });

        // Retention cleanup every 6 hours
        setInterval(runRetentionCleanup, 6 * 60 * 60 * 1000);
    } catch (err) {
        console.error('Failed to start Aegis:', err);
        process.exit(1);
    }
}

start();
