import express from 'express';
import type { Request, Response } from 'express';

const app = express();
const PORT = 3000;

app.use(express.json());

app.get('/', (req: Request, res: Response) => {
    res.send('Aegis Command Center is online.');
});

app.post('/metrics', (req: Request, res: Response) => {
    const telemetryData = req.body; 
    
    console.log('🚨 Received Telemetry Data:', telemetryData);
    
    res.status(200).send({ message: "Data received safely" });
});

app.listen(PORT, () => {
    console.log(`[Aegis] Orchestrator is listening on port ${PORT}`);
});
