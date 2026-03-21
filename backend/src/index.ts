import express from 'express';
import type { Request, Response } from 'express';
import pool from './db';
import dotenv from 'dotenv';
import cors from 'cors';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req: Request, res: Response) => {
    res.send('Aegis Command Center is online.');
});

app.post('/metrics', async (req: Request, res: Response) => {
    const { cpu, memory, stack_trace } = req.body;
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

        console.log(`Metric [ID: ${metricId}] | CPU: ${cpu}% | RAM: ${memory}%`);

        const CPU_THRESHOLD = 80.0;
        const MEM_THRESHOLD = 90.0;

        if (cpu > CPU_THRESHOLD || memory > MEM_THRESHOLD) {
            let spikeReason = "";
            if (cpu > CPU_THRESHOLD && memory > MEM_THRESHOLD) spikeReason = "CRITICAL: CPU and Memory Spike";
            else if (cpu > CPU_THRESHOLD) spikeReason = `High CPU Spike (${cpu}%)`;
            else spikeReason = `Severe Memory Leak (${memory}%)`;

            console.log(`WARNING: ${spikeReason} detected on Probe ${probeId}`);

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

                console.log(`NEW INCIDENT CREATED [ID: ${incidentId}]`);

                try {
                    const aiResponse = await fetch('http://localhost:8000/remediate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            incident_id: incidentId,
                            probe_id: probeId,
                            cpu_usage: cpu,
                            memory_usage: memory,
                            issue_type: spikeReason,
                            stack_trace: stack_trace || "No stack trace provided."
                        })
                    });

                    const aiData = await aiResponse.json();
                    console.log(`AI Agent:`, aiData.message);

                    if (aiData.pr_url) {
                        await pool.query(
                            `UPDATE incidents SET pr_url = $1, status = 'Resolved' WHERE id = $2`,
                            [aiData.pr_url, incidentId]
                        );
                        console.log(`PR saved for Incident ${incidentId}`);
                    }

                } catch (webhookError) {
                    console.error(`AI Agent failed`, webhookError);
                }

            } else {
                console.log(`Incident already open [ID: ${existingIncident.rows[0].id}]`);
            }
        }

        res.status(200).send({ message: "Metrics processed." });
    } catch (error) {
        console.error("Database Error:", error);
        res.status(500).send({ error: "Failed to process metrics" });
    }
});

app.get('/api/dashboard', async (req: Request, res: Response) => {
    try {
        const metricsQuery = `
            SELECT cpu_usage, memory_usage, timestamp 
            FROM system_metrics 
            ORDER BY timestamp DESC 
            LIMIT 20;
        `;
        const metricsData = await pool.query(metricsQuery);

        const incidentsQuery = `
            SELECT id, severity, status, pr_url 
            FROM incidents 
            ORDER BY id DESC 
            LIMIT 5;
        `;
        const incidentsData = await pool.query(incidentsQuery);

        res.json({
            status: "success",
            metrics: metricsData.rows.reverse(),
            incidents: incidentsData.rows
        });

    } catch (err) {
        console.error("Dashboard Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.listen(PORT, () => {
    console.log(`Aegis running on port ${PORT}`);
});
