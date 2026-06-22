# Design Document: Aegis Cloud Platform

## Overview

Aegis Cloud Platform transforms the existing single-tenant, localhost-only Aegis SRE engine into a multi-tenant SaaS product. Engineering teams register, obtain an API key, install the C++ probe on their Linux servers, and immediately benefit from autonomous crash detection, AI-powered root-cause analysis, and automated GitHub PR remediation — all visible through a Next.js 15 dashboard.

The platform is composed of four services:

- **C++ Probe** — Lightweight Linux daemon that ships telemetry and crash logs to the Orchestrator
- **Node.js Orchestrator** — TypeScript/Express backend that ingests telemetry, persists data, manages incidents, and dispatches to the AI Agent
- **Python AI Agent** — FastAPI service that uses Gemini + GitHub API to generate and submit patches
- **Next.js Dashboard** — TypeScript/React frontend with App Router, serves the tenant UI

All inter-service communication is HTTP/REST. PostgreSQL is the single source of truth.

---

## Architecture

```mermaid
graph TB
    subgraph "Tenant Infrastructure"
        PROBE["C++ Probe\n(Linux Server)\nCPU/RAM telemetry\nLog tailing"]
    end

    subgraph "Aegis Cloud Platform (Docker)"
        ORCH["Node.js Orchestrator\n:3000\nAuth · Ingestion · Incidents\nThreshold Engine"]
        AGENT["Python AI Agent\n:8000\nGemini · GitHub\nPatch Generation"]
        DASH["Next.js Dashboard\n:3001\nApp Router · shadcn/ui\nRecharts"]
        DB[("PostgreSQL\n:5432\ntenants · probes\nmetrics · incidents")]
    end

    subgraph "External Services"
        GEMINI["Google Gemini API\ngemini-2.5-flash"]
        GITHUB["GitHub API\nFetch file · Create PR"]
    end

    PROBE -- "POST /metrics\nAuthorization: Bearer <api_key>" --> ORCH
    PROBE -- "POST /health\n(heartbeat every 30s)" --> ORCH
    ORCH -- "SELECT/INSERT/UPDATE\n(parameterized)" --> DB
    ORCH -- "POST /remediate\n(per-tenant creds)" --> AGENT
    DASH -- "REST API calls\n(session cookie auth)" --> ORCH
    AGENT -- "generateContent()" --> GEMINI
    AGENT -- "get_contents() · create_pull()" --> GITHUB
```

### Request Flow: Normal Telemetry

```
Probe → POST /metrics (Bearer token)
  → Orchestrator validates API key → resolves tenant_id
  → INSERT system_metrics (tenant_id, probe_id, cpu, memory, ts)
  → check thresholds
    → if no spike: 200 OK
    → if spike + no open incident:
        INSERT incidents (tenant_id, probe_id, status=Open)
        POST /remediate to AI Agent (async, non-blocking)
          → AI Agent: Gemini extracts filename
          → fetches file from GitHub (tenant token)
          → Gemini generates patch
          → creates branch + PR
          → returns { pr_url }
        UPDATE incidents SET status=Resolved, pr_url=...
    → if spike + open incident already: update latest values only
```

---

## Components and Interfaces

### C++ Probe

Responsibilities:
- Read `/proc/stat` every 2 seconds to compute CPU utilisation
- Read `/proc/meminfo` every 2 seconds to compute memory utilisation
- Tail a configurable log file for crash output
- Send `POST /metrics` with Bearer token to the Orchestrator
- Send `POST /health` heartbeat every 30 seconds (no payload, just keep-alive)
- Support `--dry-run` mode (print to stdout, no HTTP)
- All configuration via CLI flags or environment variables

CLI Interface:

```
./aegis-probe \
  --endpoint  http://<orchestrator-host>:3000   \  # default: http://localhost:3000
  --api-key   <tenant_api_key>                  \  # default: "" (LOCAL_MODE)
  --log-file  /var/log/app/error.log            \  # default: real_server_error.log
  --probe-id  web-server-prod-1                 \  # default: hostname
  --interval  2                                 \  # seconds, default: 2
  --dry-run                                        # print to stdout, no HTTP
```

Environment variable equivalents: `AEGIS_ENDPOINT`, `AEGIS_API_KEY`, `AEGIS_LOG_FILE`, `AEGIS_PROBE_ID`, `AEGIS_INTERVAL`.

Payload shapes:

```json
// POST /metrics
{
  "probe_id": "web-server-prod-1",
  "cpu": 84.2,
  "memory": 61.5,
  "stack_trace": ""
}

// POST /health  (heartbeat)
{
  "probe_id": "web-server-prod-1",
  "status": "online",
  "timestamp": 1720000000
}
```

### Node.js Orchestrator

Responsibilities:
- Tenant registration, login, API key issuance and rotation
- JWT session token issuance for dashboard users
- Metrics ingestion with tenant isolation
- Probe health heartbeat recording
- Incident lifecycle management
- Dispatching remediation requests to the AI Agent
- Serving the dashboard API
- Security middleware (rate limiting, response headers, input validation)

### Python AI Agent

Responsibilities:
- Accept per-tenant GitHub credentials in the request payload (not global env vars)
- Extract the faulty filename from the stack trace using Gemini
- Fetch the file from the tenant's GitHub repository
- Generate a corrected file using Gemini (strip markdown fences)
- Create a branch named `aegis-fix-{incident_id}-{unix_timestamp}`
- Open a Pull Request and return the PR URL
- Return structured error responses on any step failure

### Next.js Dashboard

Responsibilities:
- Login / Registration pages
- Multi-step Onboarding Flow
- Main dashboard: telemetry chart + incident feed (poll every 2s)
- Settings page: GitHub token, GitHub repo, Gemini key, API key rotation, webhook URL
- Incident detail view: full stack trace, AI reasoning, PR diff link
- Dark/light mode toggle
- Responsive from 375px to 1920px

---

## Data Models

### PostgreSQL Schema

```sql
-- Tenants (formerly "users")
CREATE TABLE IF NOT EXISTS tenants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,           -- bcrypt, work factor >= 12
    api_key         VARCHAR(255) UNIQUE NOT NULL,    -- 32+ bytes, hex-encoded
    github_repo     VARCHAR(255),
    github_token    TEXT,                            -- AES-256 encrypted at rest
    gemini_key      TEXT,                            -- AES-256 encrypted at rest
    webhook_url     VARCHAR(255),                    -- optional, for notifications
    onboarding_step SMALLINT DEFAULT 1,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Probes (one tenant can have many)
CREATE TABLE IF NOT EXISTS probes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    probe_id        VARCHAR(100) NOT NULL,           -- human label, e.g. "web-server-1"
    last_seen       TIMESTAMPTZ,
    status          VARCHAR(20) DEFAULT 'offline',  -- 'online' | 'offline'
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, probe_id)
);

-- Telemetry metrics
CREATE TABLE IF NOT EXISTS system_metrics (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    probe_id        VARCHAR(100) NOT NULL,
    cpu_usage       FLOAT NOT NULL,
    memory_usage    FLOAT NOT NULL,
    timestamp       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_metrics_tenant_time
    ON system_metrics(tenant_id, timestamp DESC);

-- Incidents
CREATE TABLE IF NOT EXISTS incidents (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    probe_id            VARCHAR(100) NOT NULL,
    severity            VARCHAR(50) NOT NULL,         -- 'Critical' | 'Warning'
    status              VARCHAR(20) NOT NULL DEFAULT 'Open',
    -- status values: Open | Analyzing | Resolved | Failed
    issue_type          VARCHAR(100),
    stack_trace         TEXT,
    ai_reasoning        TEXT,                         -- Gemini explanation (future)
    pr_url              VARCHAR(500),
    error_message       TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Incident timeline (state transitions)
CREATE TABLE IF NOT EXISTS incident_timeline (
    id              BIGSERIAL PRIMARY KEY,
    incident_id     UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    from_status     VARCHAR(20),
    to_status       VARCHAR(20) NOT NULL,
    note            TEXT,
    occurred_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incidents_tenant_status
    ON incidents(tenant_id, status);
```

**Metrics retention**: A scheduled job (or PostgreSQL `pg_cron` / application-level interval) deletes `system_metrics` rows older than 7 days. Incidents are retained forever.

```sql
DELETE FROM system_metrics WHERE timestamp < NOW() - INTERVAL '7 days';
```

### TypeScript Types (Orchestrator)

```typescript
interface Tenant {
  id: string;
  email: string;
  apiKey: string;
  githubRepo?: string;
  githubToken?: string;   // decrypted in-memory only
  geminiKey?: string;     // decrypted in-memory only
  webhookUrl?: string;
  onboardingStep: number;
  createdAt: Date;
}

interface Probe {
  id: string;
  tenantId: string;
  probeId: string;
  lastSeen?: Date;
  status: 'online' | 'offline';
}

interface SystemMetric {
  id: number;
  tenantId: string;
  probeId: string;
  cpuUsage: number;
  memoryUsage: number;
  timestamp: Date;
}

interface Incident {
  id: string;
  tenantId: string;
  probeId: string;
  severity: 'Critical' | 'Warning';
  status: 'Open' | 'Analyzing' | 'Resolved' | 'Failed';
  issueType?: string;
  stackTrace?: string;
  prUrl?: string;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

---

## API Design

All Orchestrator API routes are prefixed `/api/v1`.

### Auth Routes (no auth required)

#### POST /api/v1/auth/register

```
Request:
{
  "email": "user@example.com",
  "password": "s3cureP@ss"
}

Response 201:
{
  "tenantId": "uuid",
  "apiKey": "ae3f...64hex_chars",
  "message": "Registration successful"
}

Response 400: { "error": "Missing field: email" }
Response 409: { "error": "Email already registered" }
```

#### POST /api/v1/auth/login

```
Request:
{ "email": "user@example.com", "password": "s3cureP@ss" }

Response 200:
{ "tenantId": "uuid", "email": "..." }
Sets cookie: aegis_session=<jwt>; HttpOnly; Secure; SameSite=Strict; Max-Age=86400
```

#### POST /api/v1/auth/logout

Clears `aegis_session` cookie. Returns 200.

### Probe-facing Routes (Bearer token auth: `Authorization: Bearer <api_key>`)

#### POST /api/v1/metrics

```
Request:
{
  "probe_id": "web-server-1",
  "cpu": 84.2,
  "memory": 61.5,
  "stack_trace": "Traceback ..."   // optional
}

Response 200: { "message": "Metrics processed", "incidentId": null | "uuid" }
Response 400: { "error": "Missing cpu or memory" }
Response 401: { "error": "Missing or malformed Authorization header" }
Response 403: { "error": "Invalid API key" }
Response 429: { "error": "Rate limit exceeded" }
```

#### POST /api/v1/health

```
Request:
{
  "probe_id": "web-server-1",
  "status": "online",
  "timestamp": 1720000000
}

Response 200: { "message": "Heartbeat recorded" }
```

### Dashboard Routes (JWT cookie auth)

#### GET /api/v1/dashboard

```
Response 200:
{
  "metrics": [
    { "probeId": "...", "cpuUsage": 45.2, "memoryUsage": 62.1, "timestamp": "..." },
    ...  // last 20 per probe, or last 20 overall
  ],
  "incidents": [
    {
      "id": "uuid",
      "probeId": "...",
      "severity": "Critical",
      "status": "Resolved",
      "issueType": "High CPU Spike (84.2%)",
      "prUrl": "https://github.com/...",
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "probes": [
    { "probeId": "web-server-1", "status": "online", "lastSeen": "..." }
  ]
}
```

#### GET /api/v1/incidents/:id

```
Response 200:
{
  "incident": { ...full Incident object... },
  "timeline": [
    { "fromStatus": null, "toStatus": "Open", "note": "Incident created", "occurredAt": "..." },
    { "fromStatus": "Open", "toStatus": "Analyzing", "occurredAt": "..." },
    { "fromStatus": "Analyzing", "toStatus": "Resolved", "occurredAt": "..." }
  ]
}
```

#### GET /api/v1/settings

```
Response 200:
{
  "email": "user@example.com",
  "githubRepo": "org/repo",
  "githubTokenSet": true,       // boolean, never return raw token
  "geminiKeySet": false,
  "webhookUrl": "https://...",
  "apiKey": "ae3f...64"
}
```

#### PATCH /api/v1/settings

```
Request (any subset of fields):
{
  "githubRepo": "org/new-repo",
  "githubToken": "ghp_...",
  "geminiKey": "AIza...",
  "webhookUrl": "https://hooks.example.com/aegis"
}

Response 200: { "message": "Settings updated" }
```

#### POST /api/v1/settings/rotate-key

```
Response 200:
{
  "apiKey": "new_64_hex_chars",
  "message": "API key rotated. Update your Probe configuration."
}
```

#### GET /api/v1/onboarding

```
Response 200:
{
  "step": 2,
  "apiKey": "ae3f...",
  "installCommand": "AEGIS_API_KEY=ae3f... AEGIS_ENDPOINT=https://api.aegis.io ./aegis-probe --log-file /var/log/app.log"
}
```

#### POST /api/v1/onboarding/complete

Marks onboarding as done. Response 200.

### AI Agent Routes (internal, Orchestrator → Agent)

#### POST /remediate

```
Request:
{
  "incident_id": "uuid",
  "tenant_id": "uuid",
  "probe_id": "web-server-1",
  "cpu_usage": 84.2,
  "memory_usage": 61.5,
  "issue_type": "High CPU Spike (84.2%)",
  "stack_trace": "Traceback ...",
  "github_token": "ghp_...",         // decrypted from DB, per-tenant
  "github_repo": "org/repo",
  "gemini_key": "AIza..."            // per-tenant, falls back to global env
}

Response 200 (success):
{
  "status": "success",
  "pr_url": "https://github.com/org/repo/pull/42",
  "branch": "aegis-fix-{incident_id}-{timestamp}",
  "target_file": "buggy_service.py"
}

Response 200 (failure, structured):
{
  "status": "error",
  "failed_step": "gemini_extraction" | "github_fetch" | "gemini_patch" | "github_pr",
  "message": "Human-readable error description"
}
```

---

## Auth Flow (JWT)

```
1. User submits POST /api/v1/auth/login (email + password)
2. Orchestrator:
   a. Looks up tenant by email
   b. bcrypt.compare(password, password_hash)
   c. On match: sign JWT { sub: tenant_id, iat, exp: iat+86400 } with HS256
   d. Set-Cookie: aegis_session=<jwt>; HttpOnly; Secure; SameSite=Strict; Max-Age=86400
3. Browser stores cookie automatically (HttpOnly = not accessible to JS)
4. All subsequent dashboard requests include the cookie automatically
5. Orchestrator auth middleware:
   a. Reads aegis_session cookie
   b. Verifies JWT signature and expiry
   c. Attaches req.tenantId = jwt.sub
   d. All DB queries parameterized with req.tenantId
6. Logout: clear cookie + (optionally) server-side denylist for the token

Probe auth:
1. Probe includes: Authorization: Bearer <api_key>
2. Orchestrator middleware:
   a. Parses Bearer token from header
   b. SELECT id FROM tenants WHERE api_key = $1
   c. On miss: 401 or 403 per spec
   d. Attaches req.tenantId
```

JWT payload:

```json
{
  "sub": "tenant-uuid",
  "iat": 1720000000,
  "exp": 1720086400,
  "type": "session"
}
```

---

## Data Flow: Incident Lifecycle

```mermaid
sequenceDiagram
    participant P as C++ Probe
    participant O as Orchestrator
    participant DB as PostgreSQL
    participant A as AI Agent
    participant G as GitHub API
    participant GEM as Gemini API

    P->>O: POST /api/v1/metrics {cpu, memory, stack_trace}
    O->>DB: INSERT system_metrics (tenant_id, ...)
    O->>DB: SELECT open incidents WHERE tenant_id + probe_id
    DB-->>O: no open incident
    O->>DB: INSERT incident (status=Open)
    O->>DB: INSERT incident_timeline (to=Open)
    O->>DB: UPDATE incident status=Analyzing
    O->>DB: INSERT incident_timeline (to=Analyzing)
    O-->>P: 200 OK {incidentId}

    O->>A: POST /remediate (async, per-tenant creds)
    A->>GEM: extract filename from stack trace
    GEM-->>A: "buggy_service.py"
    A->>G: fetch file content
    G-->>A: raw source code
    A->>GEM: generate patch
    GEM-->>A: corrected source
    A->>G: create branch + commit + PR
    G-->>A: PR URL
    A-->>O: {status:success, pr_url}

    O->>DB: UPDATE incident (status=Resolved, pr_url)
    O->>DB: INSERT incident_timeline (to=Resolved)
    O->>O: fire webhook (if configured)
```

---

## Frontend Route Structure (Next.js 15 App Router)

```
app/
├── (auth)/
│   ├── login/
│   │   └── page.tsx           # Email + password login form
│   └── register/
│       └── page.tsx           # Email + password register form
├── (app)/
│   ├── layout.tsx             # Shell: nav, dark/light toggle, auth guard
│   ├── dashboard/
│   │   └── page.tsx           # Telemetry chart + incident feed
│   ├── incidents/
│   │   └── [id]/
│   │       └── page.tsx       # Full incident detail: trace + timeline + PR
│   ├── settings/
│   │   └── page.tsx           # GitHub token/repo, Gemini key, API key rotation
│   └── onboarding/
│       └── page.tsx           # 4-step wizard
├── layout.tsx                 # Root layout: ThemeProvider
└── page.tsx                   # Redirect → /dashboard or /login
```

**Route Guards**: `(app)/layout.tsx` reads the JWT cookie server-side (Next.js middleware or `cookies()` from `next/headers`). If absent or expired, it redirects to `/login`.

**Component Overview**:

- `TelemetryChart` — Recharts `LineChart` for CPU and RAM, two datasets, auto-scales to last 20 points per probe
- `IncidentFeed` — Scrollable list of incident cards; card shows status badge, issue type, "VIEW PATCH" link when resolved, pulsing indicator when Analyzing
- `StatusBadge` — Global "SECURE / CRITICAL" pill in the nav bar
- `ProbeStatusList` — Shows each probe as online/offline dot with last-seen time
- `OnboardingWizard` — 4-step wizard with step indicators; Step 3 renders a `<code>` block with the install command; Step 4 polls `/api/v1/dashboard` for first heartbeat
- `SettingsForm` — Controlled form for GitHub/Gemini credentials; token fields show `••••••••` with reveal toggle; API key rotation button with confirmation dialog
- `ThemeToggle` — Persists preference in `localStorage` and syncs with Tailwind dark class

---

## Docker / Deployment Architecture

```yaml
# docker-compose.yml (abridged structure)
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: aegis
      POSTGRES_USER: aegis
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports: ["5432:5432"]

  orchestrator:
    build: ./backend
    depends_on: [postgres]
    environment:
      DATABASE_URL: postgres://aegis:${DB_PASSWORD}@postgres:5432/aegis
      JWT_SECRET: ${JWT_SECRET}
      FIELD_ENCRYPTION_KEY: ${FIELD_ENCRYPTION_KEY}   # 32-byte AES-256 key
      AI_AGENT_URL: http://ai-agent:8000
      CPU_THRESHOLD: 80
      MEM_THRESHOLD: 90
      LOCAL_MODE: false
    ports: ["3000:3000"]

  ai-agent:
    build: ./ai_agent
    environment:
      GEMINI_API_KEY: ${GEMINI_API_KEY}   # fallback global key
    ports: ["8000:8000"]

  dashboard:
    build: ./frontend
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:3000
    ports: ["3001:3000"]

volumes:
  pgdata:
```

**Startup**: The `orchestrator` service runs `setup_db.ts` (via `ts-node`) as an entrypoint before starting the Express server, so tables are created idempotently on every start.

**Railway / Render deployment**: Each service can be deployed as a separate web service. PostgreSQL is provisioned as an add-on. Environment variables are set in the dashboard. The `docker-compose.yml` is used for local development only.

---

## Security Design Decisions

### 1. API Key Storage and Generation

API keys are generated with `crypto.randomBytes(32).toString('hex')` (64 hex chars). They are stored as-is (not hashed) in the `tenants.api_key` column because the Orchestrator needs to look them up by value. The column has a `UNIQUE` index. The `tenants` table is never exposed to tenants directly.

Rationale: Hashing API keys (like passwords) would require a separate lookup table or timing-safe comparison against every row. Since the key is already a 256-bit random value, the security margin is equivalent to a hash — brute-force is infeasible.

### 2. Password Storage

bcrypt with work factor 12. Never stored or logged in plaintext.

### 3. Sensitive Field Encryption

`github_token` and `gemini_key` are encrypted at rest in PostgreSQL using AES-256-GCM. The Node.js Orchestrator uses `crypto.createCipheriv('aes-256-gcm', FIELD_ENCRYPTION_KEY, iv)`. The IV is stored alongside the ciphertext (format: `iv_hex:tag_hex:ciphertext_hex`). Decryption happens only in the handler that dispatches to the AI Agent.

### 4. JWT Session Tokens

Signed with HS256 using a 256-bit secret from `JWT_SECRET` env var. Stored exclusively in an `HttpOnly; Secure; SameSite=Strict` cookie. Expiry: 24 hours. The dashboard JavaScript layer never reads the JWT.

### 5. Parameterized Queries

All SQL queries in the Orchestrator use `pg` driver parameterized statements (`$1, $2, ...`). No string interpolation into SQL.

### 6. Rate Limiting

`express-rate-limit` applied to `POST /api/v1/metrics` at 60 req/min per API key. Uses an in-memory store for local mode; a Redis-backed store (`rate-limit-redis`) for production.

### 7. HTTP Security Headers

Applied via `helmet` middleware on all Orchestrator responses:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security: max-age=31536000` (production only)
- `Content-Security-Policy`: restrictive policy

### 8. LOCAL_MODE

When `LOCAL_MODE=true`, the Bearer token middleware is bypassed and all requests are assigned to a seeded default tenant. This is explicitly disabled in production by ensuring `LOCAL_MODE` is unset or `false`.

### 9. CORS

The Orchestrator allows CORS only from the dashboard's origin (`ALLOWED_ORIGIN` env var). Credentials mode is enabled for cookie transport.

### 10. Input Validation

All inbound JSON bodies are validated with `zod` schemas before processing. Unknown fields are stripped. Validated types are passed to DB queries.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Property-based testing is appropriate here because the Orchestrator's auth layer, tenant isolation logic, incident state machine, and encryption utilities are all pure or near-pure functions whose correctness must hold across an unbounded input space. The AI Agent's output sanitization and branch naming are pure string transformations that are ideally validated with many random inputs.

**PBT library choices:**
- Node.js (Orchestrator): `fast-check`
- Python (AI Agent): `hypothesis`

Each property test runs a minimum of 100 iterations.

---

### Property 1: API Key Uniqueness and Length

*For any* two distinct valid registration requests, the API keys returned SHALL each be at least 64 hexadecimal characters long, and the two keys SHALL NOT be equal to each other.

**Validates: Requirements 1.2**

---

### Property 2: API Key Rotation Invalidates Old Key

*For any* registered tenant, after calling the rotate-key endpoint, the old API key SHALL be rejected with HTTP 403 on subsequent authenticated requests, and the new API key SHALL be accepted with HTTP 200.

**Validates: Requirements 1.6**

---

### Property 3: Malformed Authorization Rejected with 401

*For any* string that is not a well-formed `Bearer <64-hex-char>` token (including empty strings, missing `Bearer` prefix, truncated keys, and arbitrary random byte sequences), a `POST /api/v1/metrics` request carrying that string in the `Authorization` header SHALL return HTTP 401.

**Validates: Requirements 2.2**

---

### Property 4: Unrecognized API Key Rejected with 403

*For any* well-formed 64-character hex string that does not correspond to any registered tenant's API key, a `POST /api/v1/metrics` request using that string as a Bearer token SHALL return HTTP 403.

**Validates: Requirements 2.3**

---

### Property 5: Metrics Persisted with Correct Tenant Tag

*For any* authenticated tenant and any valid metric payload `{cpu, memory, probe_id}`, after `POST /api/v1/metrics` succeeds, the newly inserted row in `system_metrics` SHALL have `tenant_id` equal to the authenticated tenant's ID, and `timestamp` SHALL be a valid UTC timestamp.

**Validates: Requirements 2.4, 4.1, 9.2**

---

### Property 6: Tenant Data Isolation

*For any* two distinct tenants A and B, if tenant A inserts any number of metrics and incidents, then calling `GET /api/v1/dashboard` authenticated as tenant B SHALL return zero metrics and zero incidents belonging to tenant A.

**Validates: Requirements 2.5, 9.4**

---

### Property 7: Threshold Breach Creates Exactly One Incident (Idempotency)

*For any* tenant and probe, if N consecutive metric payloads (N ≥ 1) each have `cpu_usage` or `memory_usage` above the configured threshold, the system SHALL create exactly one Incident with status `Open` or `Analyzing` for that (tenant, probe) pair — regardless of N. Sending further above-threshold metrics while an open incident exists SHALL NOT create duplicate incidents.

**Validates: Requirements 4.2, 4.3, 4.4, 4.5**

---

### Property 8: AI Remediation Outcome Updates Incident Status

*For any* incident in the `Analyzing` state, after the Orchestrator receives a response from the AI Agent:
- If the response contains a `pr_url`, the incident status SHALL be updated to `Resolved` and `incidents.pr_url` SHALL equal the returned URL.
- If the response contains an error, the incident status SHALL be updated to `Failed` and `incidents.error_message` SHALL be non-null.

In both cases, an `incident_timeline` row SHALL be inserted recording the transition.

**Validates: Requirements 4.6, 4.7**

---

### Property 9: Gemini Output Markdown Fence Sanitization

*For any* string returned by Gemini that begins with a markdown code fence (e.g., ` ```python `, ` ``` `, or any ` ``` ` variant), after applying the sanitization function the result SHALL NOT start or end with ` ``` `, and the raw source code content SHALL be preserved unchanged.

**Validates: Requirements 5.3, 5.7**

---

### Property 10: Branch Name Format

*For any* incident UUID and any Unix timestamp integer, the generated branch name SHALL match the pattern `aegis-fix-{incident_id}-{unix_timestamp}` and SHALL contain no characters invalid in a Git branch name (no spaces, `~`, `^`, `:`, `?`, `*`, `[`, `\`).

**Validates: Requirements 5.4**

---

### Property 11: Dashboard Returns Bounded Data Sets

*For any* tenant with N ≥ 20 metrics and M ≥ 5 incidents, `GET /api/v1/dashboard` SHALL return exactly 20 metrics ordered by `timestamp ASC` and exactly 5 incidents ordered by `created_at DESC`.

**Validates: Requirements 6.3, 6.4**

---

### Property 12: Incident Status Label Correctness

*For any* list of incidents, the computed dashboard status label SHALL be `CRITICAL` if and only if the list contains at least one incident with status `Open` or `Analyzing`; otherwise it SHALL be `SECURE`. This holds for any list length including the empty list.

**Validates: Requirements 6.8**

---

### Property 13: Resolved Incident Renders PR Link

*For any* incident object with `status = "Resolved"` and a non-null `prUrl`, the rendered `IncidentCard` component's output SHALL contain an anchor element whose `href` attribute equals the `prUrl` value.

**Validates: Requirements 6.6**

---

### Property 14: Install Command Contains Tenant Credentials

*For any* tenant with API key K and any platform Orchestrator URL U, the rendered onboarding install command string SHALL contain K as a substring and U as a substring.

**Validates: Requirements 3.6, 7.4**

---

### Property 15: Security Headers Present on All Responses

*For any* request to any Orchestrator API endpoint (authenticated or unauthenticated, success or error response), the HTTP response SHALL contain the headers `X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY`.

**Validates: Requirements 10.2**

---

### Property 16: Rate Limit Enforced Per API Key

*For any* API key, if more than 60 `POST /api/v1/metrics` requests are sent within a 60-second window, all requests beyond the 60th SHALL receive HTTP 429. The counter SHALL reset independently per API key (requests from a different key in the same window SHALL NOT count toward this limit).

**Validates: Requirements 10.3**

---

### Property 17: Credential Encryption Round-Trip

*For any* non-empty string S representing a GitHub token or Gemini key, encrypting S with AES-256-GCM using the `FIELD_ENCRYPTION_KEY` SHALL produce a ciphertext that is not equal to S, and decrypting that ciphertext with the same key SHALL produce a value equal to S.

**Validates: Requirements 10.6**

---

## Error Handling

### Orchestrator

| Scenario | Behaviour |
|---|---|
| Missing/malformed JSON body | 400 with field-level error from zod |
| Auth middleware failure | 401 or 403 before any DB access |
| DB connection failure on metrics ingest | 500, log full error server-side, return generic message to client |
| AI Agent unreachable | Update incident to `Failed`, log error, return 200 to probe (don't block probe) |
| AI Agent returns error JSON | Update incident to `Failed` with `error_message` populated |
| Duplicate registration email | 409 with descriptive message |
| Rate limit exceeded | 429 with `Retry-After` header |
| JWT expired or tampered | 401 on dashboard routes, redirect to `/login` |

The orchestrator never propagates raw DB error messages or stack traces to API responses. Internal errors are logged with a correlation ID; the client receives only the correlation ID for support purposes.

### AI Agent

Each pipeline step is wrapped in a `try/except`. On failure, the agent returns:

```json
{
  "status": "error",
  "failed_step": "gemini_extraction | github_fetch | gemini_patch | github_pr",
  "message": "<human-readable description>"
}
```

No unhandled exceptions are allowed to propagate to FastAPI's default 500 handler. The agent does not retry internally; retry logic is the Orchestrator's responsibility.

### C++ Probe

- On HTTP connection failure: print to stderr, sleep `interval` seconds, retry indefinitely
- On `/proc/stat` or `/proc/meminfo` unreadable: print warning to stderr, send metric with `cpu=0.0` and `memory=0.0` to avoid silent data loss
- On log file unreadable (not found): create the file and continue (matches existing behaviour)
- On `--dry-run`: all errors print to stdout only

---

## Testing Strategy

### Unit Tests

Use Jest (Node.js / Orchestrator) and pytest (Python / AI Agent).

Focus areas:
- Auth middleware: valid token, expired token, missing header, wrong scheme
- Threshold engine: boundary values at exactly 80% and 90%, just below, just above
- Incident deduplication logic: existing open incident → no new insert
- Encryption utilities: encrypt/decrypt functions with known vectors
- AI Agent sanitizer: code fence removal edge cases (no fence, one fence, both fences, nested backticks)
- Branch name generator: format correctness
- Dashboard status label: all combinations of incident statuses

Avoid: testing PostgreSQL driver behaviour, Gemini API responses, GitHub API responses.

### Property-Based Tests

**Node.js (fast-check):**

Each test tagged: `// Feature: aegis-cloud-platform, Property N: <property_text>`

- Property 1: `fc.tuple(fc.emailAddress(), fc.string({ minLength: 8 }))` → register → assert key length and uniqueness
- Property 2: Register → rotate → assert old key 403, new key 200
- Property 3: `fc.oneof(fc.string(), fc.constant(''), fc.constant('Basic xyz'))` for Authorization header → assert 401
- Property 4: `fc.hexaString({ minLength: 64, maxLength: 64 })` (filtered to exclude real keys) → assert 403
- Property 5: `fc.record({ cpu: fc.float({min:0,max:100}), memory: fc.float({min:0,max:100}), probe_id: fc.string() })` → POST → query DB → assert tenant_id match
- Property 6: Two tenants, insert metrics as A, query as B → assert empty result
- Property 7: `fc.integer({min:1,max:20})` repetitions of above-threshold payloads → count open incidents → assert exactly 1
- Property 8: Mock AI Agent with random pr_url or error → assert correct incident status transition
- Property 11: `fc.integer({min:20,max:100})` metrics, call dashboard → assert length 20
- Property 12: `fc.array(fc.constantFrom('Open','Analyzing','Resolved','Failed'))` → computeStatus → assert CRITICAL iff includes Open/Analyzing
- Property 13: `fc.webUrl()` as pr_url → render IncidentCard → assert href present
- Property 14: `fc.hexaString({minLength:64,maxLength:64})`, `fc.webUrl()` → renderInstallCommand → assert substrings
- Property 15: Random endpoint selection → assert header presence
- Property 16: Rapid 61 requests → count 429 responses → assert ≥ 1
- Property 17: `fc.string({minLength:1})` as token → encrypt → assert ciphertext ≠ plaintext → decrypt → assert equals original

**Python (hypothesis):**

- Property 9 (sanitizer): `@given(st.text())` with strategy that prepends/appends code fences → assert no fence prefix/suffix in result
- Property 10 (branch name): `@given(st.uuids(), st.integers(min_value=0))` → assert branch name matches regex

### Integration Tests

Run with Docker Compose (all services up):

- Full incident lifecycle: probe → orchestrator → AI Agent (mocked) → assert incident Resolved
- Multi-tenant isolation: two tenants, independent data flows, no cross-contamination
- Metrics retention: insert old rows, run cleanup job, assert deleted; recent rows remain
- Probe heartbeat: probe sends `/health`, dashboard shows probe as `online`

### Smoke Tests

- `docker-compose up`: all services start, Postgres tables exist
- bcrypt work factor: read stored hash, verify `$2b$12$` prefix
- Security headers: curl any endpoint, grep for required headers
- LOCAL_MODE: set flag, POST /metrics without auth, verify 200 and assignment to default tenant
