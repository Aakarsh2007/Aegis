export interface Tenant {
    id: string;
    email: string;
    passwordHash: string;
    apiKey: string;
    githubRepo?: string;
    githubToken?: string;   // decrypted in-memory only
    geminiKey?: string;     // decrypted in-memory only
    webhookUrl?: string;
    onboardingStep: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface Probe {
    id: string;
    tenantId: string;
    probeId: string;
    lastSeen?: Date;
    status: 'online' | 'offline';
    createdAt: Date;
}

export interface SystemMetric {
    id: number;
    tenantId: string;
    probeId: string;
    cpuUsage: number;
    memoryUsage: number;
    timestamp: Date;
}

export type IncidentStatus = 'Open' | 'Analyzing' | 'Resolved' | 'Failed';
export type IncidentSeverity = 'Critical' | 'Warning';

export interface Incident {
    id: string;
    tenantId: string;
    probeId: string;
    severity: IncidentSeverity;
    status: IncidentStatus;
    issueType?: string;
    stackTrace?: string;
    aiReasoning?: string;
    prUrl?: string;
    errorMessage?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface IncidentTimeline {
    id: number;
    incidentId: string;
    fromStatus?: string;
    toStatus: string;
    note?: string;
    occurredAt: Date;
}

// Express request augmentation
declare global {
    namespace Express {
        interface Request {
            tenantId?: string;
        }
    }
}
