import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

interface JwtPayload {
    sub: string;
    type: string;
    iat: number;
    exp: number;
}

export function sessionAuth(req: Request, res: Response, next: NextFunction): void {
    const token = req.cookies?.aegis_session;

    if (!token) {
        res.status(401).json({ error: 'Not authenticated. Please log in.' });
        return;
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
        console.error('JWT_SECRET environment variable is not set');
        res.status(500).json({ error: 'Server configuration error' });
        return;
    }

    try {
        const payload = jwt.verify(token, secret) as JwtPayload;

        if (payload.type !== 'session') {
            res.status(401).json({ error: 'Invalid token type' });
            return;
        }

        req.tenantId = payload.sub;
        next();
    } catch (err) {
        if (err instanceof jwt.TokenExpiredError) {
            res.status(401).json({ error: 'Session expired. Please log in again.' });
        } else {
            res.status(401).json({ error: 'Invalid session token.' });
        }
    }
}

export function signSessionToken(tenantId: string): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET not set');

    return jwt.sign(
        { sub: tenantId, type: 'session' },
        secret,
        { expiresIn: '24h', algorithm: 'HS256' }
    );
}

export const SESSION_COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    maxAge: 86400 * 1000, // 24h in ms
    path: '/',
};
