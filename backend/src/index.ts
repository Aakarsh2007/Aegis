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
            RETURNING id;
        `;
        const metricResult = await pool.query(insertQuery, [probeId, cpu, memory]);
        const metricId = metricResult.rows[0].id;

        console.log(`✅ Metric [ID: ${metricId}] | CPU: ${cpu}% | RAM: ${memory}%`);

        const CPU_THRESHOLD = 80.0;

        if (cpu > CPU_THRESHOLD) {
            console.log(`⚠️ WARNING: High CPU detected (${cpu}%) on Probe ${probeId}`);

            const checkIncidentQuery = `
                SELECT id FROM incidents 
                WHERE probe_id = $1 AND status = 'Open'
            `;
            const existingIncident = await pool.query(checkIncidentQuery, [probeId]);

            if (existingIncident.rows.length === 0) {
                const createIncidentQuery = `
                    INSERT INTO incidents (probe_id, severity, status)
                    VALUES ($1, 'Critical', 'Open')
                    RETURNING id;
                `;
                const newIncident = await pool.query(createIncidentQuery, [probeId]);
                const incidentId = newIncident.rows[0].id;

                console.log(`🚨🔥 NEW INCIDENT CREATED [ID: ${incidentId}] 🔥🚨`);

                console.log(`📞 Paging AI Agent on Port 8000...`);
                try {
                    const aiResponse = await fetch('http://localhost:8000/remediate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            incident_id: incidentId,
                            probe_id: probeId,
                            cpu_usage: cpu
                        })
                    });

                    const aiData = await aiResponse.json();
                    console.log(`🤖 AI Agent Acknowledged:`, aiData.message);
                } catch (webhookError) {
                    console.error(`❌ Failed to reach AI Agent. Is Python running?`, webhookError);
                }

            } else {
                console.log(`⏳ Incident already open [ID: ${existingIncident.rows[0].id}]. AI is working...`);
            }
        }

        res.status(200).send({ message: "Metrics processed." });
    } catch (error) {
        console.error("❌ Database Error:", error);
        res.status(500).send({ error: "Failed to process metrics" });
    }
});

app.listen(PORT, () => {
    console.log(`[Aegis] Orchestrator is listening on port ${PORT}`);
});