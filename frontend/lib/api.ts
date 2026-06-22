const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error ?? 'Request failed');
  }

  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  register: (email: string, password: string) =>
    request<{ tenantId: string; apiKey: string; message: string }>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  login: (email: string, password: string) =>
    request<{ tenantId: string; email: string; onboardingStep: number }>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  logout: () =>
    request<{ message: string }>('/api/v1/auth/logout', { method: 'POST' }),
};

// ─── Dashboard ────────────────────────────────────────────────────────────────
export interface MetricPoint {
  probe_id: string;
  cpu_usage: number;
  memory_usage: number;
  timestamp: string;
}

export interface Incident {
  id: string;
  probe_id: string;
  severity: 'Critical' | 'Warning';
  status: 'Open' | 'Analyzing' | 'Resolved' | 'Failed';
  issue_type?: string;
  pr_url?: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface ProbeStatus {
  probe_id: string;
  status: 'online' | 'offline';
  last_seen?: string;
}

export interface DashboardData {
  metrics: MetricPoint[];
  incidents: Incident[];
  probes: ProbeStatus[];
}

export const dashboardApi = {
  get: () => request<DashboardData>('/api/v1/dashboard'),

  getIncident: (id: string) =>
    request<{
      incident: Incident & { stack_trace?: string; ai_reasoning?: string };
      timeline: Array<{ from_status?: string; to_status: string; note?: string; occurred_at: string }>;
    }>(`/api/v1/incidents/${id}`),
};

// ─── Settings ─────────────────────────────────────────────────────────────────
export interface Settings {
  email: string;
  apiKey: string;
  githubRepo?: string;
  githubTokenSet: boolean;
  geminiKeySet: boolean;
  webhookUrl?: string;
  onboardingStep: number;
}

export const settingsApi = {
  get: () => request<Settings>('/api/v1/settings'),

  update: (data: {
    githubRepo?: string;
    githubToken?: string;
    geminiKey?: string;
    webhookUrl?: string;
  }) => request<{ message: string }>('/api/v1/settings', { method: 'PATCH', body: JSON.stringify(data) }),

  rotateKey: () =>
    request<{ apiKey: string; message: string }>('/api/v1/settings/rotate-key', { method: 'POST' }),
};

// ─── Onboarding ───────────────────────────────────────────────────────────────
export interface OnboardingData {
  step: number;
  apiKey: string;
  installCommand: string;
}

export const onboardingApi = {
  get: () => request<OnboardingData>('/api/v1/onboarding'),
  complete: () => request<{ message: string }>('/api/v1/onboarding/complete', { method: 'POST' }),
};
