import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    family: 4
});

async function setupCloudDatabase() {
    console.log("🚀 Connecting to Cloud Database...");

    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS system_metrics (
                id SERIAL PRIMARY KEY,
                cpu_usage FLOAT NOT NULL,
                memory_usage FLOAT NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("✅ Table 'system_metrics' built successfully.");

        await pool.query(`
            CREATE TABLE IF NOT EXISTS incidents (
                id SERIAL PRIMARY KEY,
                probe_id VARCHAR(50) NOT NULL,
                severity VARCHAR(50) NOT NULL,
                status VARCHAR(50) NOT NULL,
                pr_url VARCHAR(255)
            );
        `);
        console.log("✅ Table 'incidents' built successfully.");

        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                api_key VARCHAR(255) UNIQUE NOT NULL,
                crashes_fixed INT DEFAULT 0,
                is_premium BOOLEAN DEFAULT FALSE
            );
        `);
        console.log("✅ Table 'users' built successfully.");

        await pool.query(`
            INSERT INTO users (email, api_key) 
            VALUES ('admin@aegis.com', 'aegis_live_999xxxx')
            ON CONFLICT (email) DO NOTHING;
        `);
        console.log("✅ Default Admin user created with API Key: aegis_live_999xxxx");

        console.log("🎉 Cloud Database Migration Complete! Aegis is ready for the cloud.");

    } catch (err) {
        console.error("❌ FATAL ERROR: Could not build tables.", err);
    } finally {
        await pool.end();
    }
}

setupCloudDatabase();