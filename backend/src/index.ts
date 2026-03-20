import express from 'express';
import type { Request, Response } from 'express';
import pool from './db';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

app.get('/', (req: Request, res: Response) => {
    res.send('Aegis Command Center is online.');
});

app.post('/metrics', async (req: Request, res: Response) => {
    const { cpu, memory } = req.body;
    const probeId = process.env.PROBE_ID;

    if (cpu === undefined || memory === undefined) {
        return res.status(400).send({ error: "Missing cpu or memory data" });
    }

    try {
        const insertQuery = `
            INSERT INTO system_metrics (probe_id, cpu_usage, memory_usage)
            VALUES ($1, $2, $3)
            RETURNING id, timestamp;
        `;
        
        const result = await pool.query(insertQuery, [probeId, cpu, memory]);
        
        console.log(`✅ Metric Saved [ID: ${result.rows[0].id}] | CPU: ${cpu}% | RAM: ${memory}%`);
        
        res.status(200).send({ message: "Metrics securely stored." });
    } catch (error) {
        console.error("❌ Database Error:", error);
        res.status(500).send({ error: "Failed to save metrics" });
    }
});

app.listen(PORT, () => {
    console.log(`[Aegis] Orchestrator is listening on port ${PORT}`);
});