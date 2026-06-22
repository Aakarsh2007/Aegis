import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const LOCAL_MODE_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const LOCAL_MODE_API_KEY = 'local_mode_default_key_aegis_dev_0000';

export async function setupDatabase(): Promise<void> {
    console.log('🚀 Running Aegis database migration...');

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // ── Tenants ──────────────────────────────────────────────────────
        await client.query(`
            CREATE TABLE IF NOT EXISTS tenants (
                id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                email           VARCHAR(255) UNIQUE NOT NULL,
                password_hash   VARCHAR(255) NOT NULL,
                api_key         VARCHAR(255) UNIQUE NOT NULL,
                github_repo     VARCHAR(255),
                github_token    TEXT,
                gemini_key      TEXT,
                webhook_url     VARCHAR(255),
                onboarding_step SMALLINT DEFAULT 1,
                created_at      TIMESTAMPTZ DEFAULT NOW(),
                updated_at      TIMESTAMPTZ DEFAULT NOW()
            );
        `);
        console.log("✅ Table 'tenants' ready.");

        // ── Probes ───────────────────────────────────────────────────────
        await client.query(`
            CREATE TABLE IF NOT EXISTS probes (
                id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                probe_id    VARCHAR(100) NOT NULL,
                last_seen   TIMESTAMPTZ,
                status      VARCHAR(20) DEFAULT 'offline',
                created_at  TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(tenant_id, probe_id)
            );
        `);
        console.log("✅ Table 'probes' ready.");

        // ── System metrics ───────────────────────────────────────────────
        await client.query(`
            CREATE TABLE IF NOT EXISTS system_metrics (
                id              BIGSERIAL PRIMARY KEY,
                tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                probe_id        VARCHAR(100) NOT NULL,
                cpu_usage       FLOAT NOT NULL,
                memory_usage    FLOAT NOT NULL,
                timestamp       TIMESTAMPTZ DEFAULT NOW()
            );
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_metrics_tenant_time
                ON system_metrics(tenant_id, timestamp DESC);
        `);
        console.log("✅ Table 'system_metrics' ready.");

        // ── Incidents ────────────────────────────────────────────────────
        await client.query(`
            CREATE TABLE IF NOT EXISTS incidents (
                id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                probe_id        VARCHAR(100) NOT NULL,
                severity        VARCHAR(50) NOT NULL DEFAULT 'Critical',
                status          VARCHAR(20) NOT NULL DEFAULT 'Open',
                issue_type      VARCHAR(100),
                stack_trace     TEXT,
                ai_reasoning    TEXT,
                pr_url          VARCHAR(500),
                error_message   TEXT,
                created_at      TIMESTAMPTZ DEFAULT NOW(),
                updated_at      TIMESTAMPTZ DEFAULT NOW()
            );
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_incidents_tenant_status
                ON incidents(tenant_id, status);
        `);
        console.log("✅ Table 'incidents' ready.");

        // ── Incident timeline ────────────────────────────────────────────
        await client.query(`
            CREATE TABLE IF NOT EXISTS incident_timeline (
                id              BIGSERIAL PRIMARY KEY,
                incident_id     UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
                from_status     VARCHAR(20),
                to_status       VARCHAR(20) NOT NULL,
                note            TEXT,
                occurred_at     TIMESTAMPTZ DEFAULT NOW()
            );
        `);
        console.log("✅ Table 'incident_timeline' ready.");

        // ── LOCAL_MODE seed tenant ────────────────────────────────────────
        if (process.env.LOCAL_MODE === 'true') {
            await client.query(`
                INSERT INTO tenants (id, email, password_hash, api_key, onboarding_step)
                VALUES ($1, 'local@aegis.dev', '$2b$12$localmodehashnoop000000000000000000000000000000000000', $2, 5)
                ON CONFLICT (id) DO NOTHING;
            `, [LOCAL_MODE_TENANT_ID, LOCAL_MODE_API_KEY]);
            console.log('✅ LOCAL_MODE default tenant seeded.');
        }

        await client.query('COMMIT');
        console.log('🎉 Database migration complete.');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Migration failed, rolling back:', err);
        throw err;
    } finally {
        client.release();
    }
}

export async function runRetentionCleanup(): Promise<void> {
    try {
        const result = await pool.query(
            `DELETE FROM system_metrics WHERE timestamp < NOW() - INTERVAL '7 days'`
        );
        if ((result.rowCount ?? 0) > 0) {
            console.log(`🧹 Retention cleanup: removed ${result.rowCount} old metric rows.`);
        }
    } catch (err) {
        console.error('Retention cleanup error:', err);
    }
}

export { pool, LOCAL_MODE_TENANT_ID, LOCAL_MODE_API_KEY };

// Run directly when called as a script
if (process.argv[1] && process.argv[1].endsWith('setup_db.ts')) {
    setupDatabase()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}
