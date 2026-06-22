# Implementation Plan: Aegis Cloud Platform

## Overview

Transform the existing single-tenant localhost Aegis SRE engine into a multi-tenant SaaS platform. Implementation proceeds in six phases: infrastructure and database, Node.js orchestrator, Python AI agent, Next.js frontend, Docker wiring, and property-based tests.

## Tasks

- [x] 1. Database migration script
  - [x] 1.1 Rewrite `backend/src/setup_db.ts` to implement the full multi-tenant schema
    - Drop old single-tenant tables and create `tenants`, `probes`, `system_metrics` (with `tenant_id` FK), `incidents` (with `tenant_id` FK, all status values, `ai_reasoning`, `error_message`), and `incident_timeline`
    - All statements use `CREATE TABLE IF NOT EXISTS`; add indexes `idx_metrics_tenant_time` and `idx_incidents_tenant_status`
    - Seed a `LOCAL_MODE` default tenant with a fixed UUID and known API key when `LOCAL_MODE=true`
    - _Requirements: 9.1, 9.2, 9.3, 9.5_

  - [x] 1.2 Add metrics retention cleanup function
    - Export a `runRetentionCleanup()` function that executes `DELETE FROM system_metrics WHERE timestamp < NOW() - INTERVAL '7 days'`
    - Call it on a `setInterval` of 6 hours from the main server entry point
    - _Requirements: 9.5_

- [x] 2. Node.js Orchestrator — core infrastructure
  - [x] 2.1 Install and configure dependencies
    - Add to `backend/package.json`: `bcryptjs`, `jsonwebtoken`, `zod`, `helmet`, `express-rate-limit`, `cookie-parser`, `cors`, `dotenv`, `pg`; dev deps: `@types/*`, `fast-check`, `jest`, `ts-jest`
    - Update `backend/tsconfig.json` to target `ES2020`, enable `strict`, set `outDir: dist`
    - _Requirements: 10.1, 10.2, 10.3_

  - [x] 2.2 Create TypeScript type definitions
    - Create `backend/src/types.ts` with interfaces: `Tenant`, `Probe`, `SystemMetric`, `Incident`, `IncidentTimeline` matching the design document shapes
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 2.3 Create AES-256-GCM encryption utility
    - Create `backend/src/crypto.ts` with `encrypt(plaintext: string): string` and `decrypt(ciphertext: string): string`
    - Format: `iv_hex:tag_hex:ciphertext_hex`; key sourced from `FIELD_ENCRYPTION_KEY` env var
    - _Requirements: 10.6_

  - [ ]* 2.4 Write property test for encryption round-trip (Property 17)
    - **Property 17: Credential Encryption Round-Trip**
    - **Validates: Requirements 10.6**
    - Use `fc.string({ minLength: 1 })` → encrypt → assert ciphertext ≠ plaintext → decrypt → assert equals original

  - [x] 2.5 Create probe authentication middleware
    - Create `backend/src/middleware/probeAuth.ts`: parse `Authorization: Bearer <token>`, reject missing/malformed with 401, query `SELECT id FROM tenants WHERE api_key = $1`, reject unknown key with 403, attach `req.tenantId`
    - Skip auth when `LOCAL_MODE=true`, assign to seeded default tenant UUID
    - _Requirements: 2.1, 2.2, 2.3, 8.1, 8.2_

  - [ ]* 2.6 Write property tests for probe auth middleware (Properties 3, 4)
    - **Property 3: Malformed Authorization Rejected with 401**
    - **Property 4: Unrecognized API Key Rejected with 403**
    - **Validates: Requirements 2.2, 2.3**

  - [x] 2.7 Create JWT session middleware
    - Create `backend/src/middleware/sessionAuth.ts`: read `aegis_session` cookie, verify HS256 JWT with `JWT_SECRET`, attach `req.tenantId`, return 401 on missing/expired/tampered token
    - _Requirements: 10.4, 10.5_

  - [x] 2.8 Apply global security middleware
    - In `backend/src/index.ts`: apply `helmet()`, configure `cors` with `ALLOWED_ORIGIN` env var and `credentials: true`, apply `cookie-parser`, apply `express-rate-limit` (60 req/min per IP/key) on `/api/v1/metrics`
    - _Requirements: 10.1, 10.2, 10.3_

  - [ ]* 2.9 Write property test for security headers (Property 15)
    - **Property 15: Security Headers Present on All Responses**
    - **Validates: Requirements 10.2**

  - [ ]* 2.10 Write property test for rate limiting (Property 16)
    - **Property 16: Rate Limit Enforced Per API Key**
    - **Validates: Requirements 10.3**

- [x] 3. Node.js Orchestrator — auth routes
  - [x] 3.1 Implement `POST /api/v1/auth/register`
    - Validate body with zod (`email`, `password` required); return 400 on missing field
    - `bcrypt.hash(password, 12)`, generate API key via `crypto.randomBytes(32).toString('hex')`
    - `INSERT INTO tenants`; return 409 on duplicate email; return 201 with `{ tenantId, apiKey }`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [ ]* 3.2 Write property test for API key uniqueness and length (Property 1)
    - **Property 1: API Key Uniqueness and Length**
    - **Validates: Requirements 1.2**
    - Use `fc.tuple(fc.emailAddress(), fc.string({ minLength: 8 }))` → register twice → assert keys ≥ 64 hex chars and not equal

  - [x] 3.3 Implement `POST /api/v1/auth/login`
    - Validate body with zod; look up tenant by email; `bcrypt.compare`; sign JWT `{ sub: tenantId, type: 'session' }` with 24h expiry; set `aegis_session` cookie: `HttpOnly; Secure; SameSite=Strict; Max-Age=86400`
    - _Requirements: 10.4, 10.5_

  - [x] 3.4 Implement `POST /api/v1/auth/logout`
    - Clear `aegis_session` cookie; return 200
    - _Requirements: 10.4_

  - [x] 3.5 Implement `POST /api/v1/settings/rotate-key`
    - Protected by `sessionAuth` middleware; generate new API key; `UPDATE tenants SET api_key = $1 WHERE id = $2`; return 200 with new key
    - _Requirements: 1.6_

  - [ ]* 3.6 Write property test for API key rotation (Property 2)
    - **Property 2: API Key Rotation Invalidates Old Key**
    - **Validates: Requirements 1.6**
    - Register → rotate → assert old key returns 403 on POST /api/v1/metrics; new key returns 200

- [x] 4. Node.js Orchestrator — telemetry and incident logic
  - [x] 4.1 Implement threshold engine and incident deduplication
    - Create `backend/src/incidents.ts` with `evaluateThresholds(tenantId, probeId, cpu, memory, stackTrace)`:
      - Read `CPU_THRESHOLD` and `MEM_THRESHOLD` from env (defaults 80, 90)
      - If breach: `SELECT id FROM incidents WHERE tenant_id=$1 AND probe_id=$2 AND status IN ('Open','Analyzing')`
      - If none: `INSERT incident (status=Open)` + `INSERT incident_timeline (to=Open)` + update to `Analyzing` + `INSERT incident_timeline (to=Analyzing)` + call `dispatchRemediation` async (non-blocking)
      - If existing: no new insert
    - _Requirements: 4.2, 4.3, 4.4, 4.5_

  - [ ]* 4.2 Write property test for incident idempotency (Property 7)
    - **Property 7: Threshold Breach Creates Exactly One Incident (Idempotency)**
    - **Validates: Requirements 4.2, 4.3, 4.4, 4.5**
    - `fc.integer({ min: 1, max: 20 })` repetitions of above-threshold payloads → count open incidents → assert exactly 1

  - [x] 4.3 Implement `POST /api/v1/metrics`
    - Apply `probeAuth` middleware; validate body with zod (`probe_id` string, `cpu` number 0–100, `memory` number 0–100, `stack_trace` optional string)
    - Upsert probe record in `probes` table; `INSERT INTO system_metrics (tenant_id, probe_id, cpu_usage, memory_usage)`
    - Call `evaluateThresholds`; return 200 with `{ message, incidentId }`
    - _Requirements: 2.1, 2.4, 4.1_

  - [ ]* 4.4 Write property test for metrics persistence with tenant tag (Property 5)
    - **Property 5: Metrics Persisted with Correct Tenant Tag**
    - **Validates: Requirements 2.4, 4.1, 9.2**

  - [x] 4.5 Implement `POST /api/v1/health`
    - Apply `probeAuth` middleware; validate body with zod; upsert `probes` row (`last_seen = NOW()`, `status = 'online'`); return 200
    - _Requirements: 4.1_

  - [x] 4.6 Implement `dispatchRemediation` function
    - Create `backend/src/remediation.ts`; fetch tenant row, decrypt `github_token` and `gemini_key`; `POST /remediate` to `AI_AGENT_URL` with full per-tenant payload
    - On success response with `pr_url`: `UPDATE incidents SET status='Resolved', pr_url=$1` + `INSERT incident_timeline (to=Resolved)` + fire webhook if `webhook_url` set
    - On error response or network failure: `UPDATE incidents SET status='Failed', error_message=$1` + `INSERT incident_timeline (to=Failed)`
    - _Requirements: 4.6, 4.7, 5.6_

  - [ ]* 4.7 Write property test for AI remediation outcome updating incident status (Property 8)
    - **Property 8: AI Remediation Outcome Updates Incident Status**
    - **Validates: Requirements 4.6, 4.7**
    - Mock AI Agent with random `pr_url` or error → assert correct incident status transition and timeline entry

- [x] 5. Checkpoint — core backend tests pass
  - Ensure all unit and property tests in `backend/` pass. Ask the user if any questions arise.

- [x] 6. Node.js Orchestrator — dashboard and settings routes
  - [x] 6.1 Implement `GET /api/v1/dashboard`
    - Apply `sessionAuth`; query last 20 `system_metrics` for tenant ordered by `timestamp ASC`; query last 5 `incidents` ordered by `created_at DESC`; query all `probes` for tenant; return combined JSON
    - _Requirements: 6.3, 6.4_

  - [ ]* 6.2 Write property test for dashboard bounded data sets (Property 11)
    - **Property 11: Dashboard Returns Bounded Data Sets**
    - **Validates: Requirements 6.3, 6.4**

  - [ ]* 6.3 Write property test for tenant data isolation (Property 6)
    - **Property 6: Tenant Data Isolation**
    - **Validates: Requirements 2.5, 9.4**
    - Two tenants, insert metrics as A, query dashboard as B → assert zero results from A

  - [x] 6.4 Implement `GET /api/v1/incidents/:id`
    - Apply `sessionAuth`; query `incidents WHERE id=$1 AND tenant_id=$2`; query `incident_timeline WHERE incident_id=$1`; return combined JSON; 404 if not found
    - _Requirements: 9.4_

  - [x] 6.5 Implement `GET /api/v1/settings` and `PATCH /api/v1/settings`
    - GET: return tenant fields; never return raw `github_token` or `gemini_key` — return booleans `githubTokenSet`, `geminiKeySet`
    - PATCH: validate body with zod (all fields optional); encrypt `githubToken`/`geminiKey` before saving; `UPDATE tenants SET ... WHERE id = $1`
    - _Requirements: 1.7, 10.6_

  - [x] 6.6 Implement `GET /api/v1/onboarding` and `POST /api/v1/onboarding/complete`
    - GET: return `{ step, apiKey, installCommand }` where `installCommand` is pre-filled with tenant's API key and `ORCHESTRATOR_URL` env var
    - POST: `UPDATE tenants SET onboarding_step = 5 WHERE id = $1`
    - _Requirements: 3.6, 7.4_

  - [ ]* 6.7 Write property test for install command containing tenant credentials (Property 14)
    - **Property 14: Install Command Contains Tenant Credentials**
    - **Validates: Requirements 3.6, 7.4**

- [x] 7. Python AI Agent refactor
  - [x] 7.1 Refactor `ai_agent/main.py` to accept per-tenant credentials from request payload
    - Remove global `github_token`, `github_repo_name`, `gemini_key` env var lookups at module level
    - Extract `github_token`, `github_repo`, `gemini_key` from request payload; fall back to global `GEMINI_API_KEY` env var if tenant key absent
    - _Requirements: 5.6_

  - [x] 7.2 Implement structured per-step error responses
    - Wrap each pipeline step (gemini extraction, github fetch, gemini patch, github PR) in individual `try/except` blocks
    - Return `{ "status": "error", "failed_step": "<step>", "message": "<description>" }` on any failure; no unhandled exceptions
    - _Requirements: 5.5_

  - [x] 7.3 Implement Gemini output sanitization function
    - Create `sanitize_gemini_output(text: str) -> str` in `ai_agent/main.py`
    - Strip leading/trailing markdown code fences (any language tag variant); preserve inner content unchanged
    - _Requirements: 5.7_

  - [ ]* 7.4 Write hypothesis property test for sanitization (Property 9)
    - **Property 9: Gemini Output Markdown Fence Sanitization**
    - **Validates: Requirements 5.3, 5.7**
    - `@given(st.text())` with strategy prepending/appending code fences → assert no fence prefix/suffix in result

  - [x] 7.5 Implement branch naming with incident ID
    - Change branch name format to `aegis-fix-{incident_id}-{unix_timestamp}`
    - Accept `incident_id` from request payload
    - _Requirements: 5.4_

  - [ ]* 7.6 Write hypothesis property test for branch name format (Property 10)
    - **Property 10: Branch Name Format**
    - **Validates: Requirements 5.4**
    - `@given(st.uuids(), st.integers(min_value=0))` → assert branch matches `aegis-fix-{uuid}-{int}` regex and contains no Git-invalid characters

  - [x] 7.7 Update `/remediate` response shape for success
    - Return `{ "status": "success", "pr_url": "...", "branch": "...", "target_file": "..." }` on success
    - _Requirements: 5.5_

  - [x] 7.8 Update `ai_agent/requirements.txt`
    - Add `hypothesis` for property tests; pin all existing deps to exact versions
    - _Requirements: 5.5_

- [x] 8. Checkpoint — AI agent tests pass
  - Ensure all `pytest` and hypothesis tests in `ai_agent/` pass. Ask the user if any questions arise.

- [x] 9. C++ Probe refactor
  - [x] 9.1 Add CLI flag and environment variable parsing to `main.cpp`
    - Parse `--endpoint`, `--api-key`, `--log-file`, `--probe-id`, `--interval`, `--dry-run` from `argv`
    - Fall back to env vars `AEGIS_ENDPOINT`, `AEGIS_API_KEY`, `AEGIS_LOG_FILE`, `AEGIS_PROBE_ID`, `AEGIS_INTERVAL`
    - Default: endpoint=`http://localhost:3000`, probe-id=hostname, interval=2, log-file=`real_server_error.log`
    - _Requirements: 3.2, 3.4, 3.5, 3.6, 2.6, 2.7_

  - [x] 9.2 Add Bearer token Authorization header to all HTTP requests
    - Update `httplib::Client` calls to include `Authorization: Bearer <api_key>` header on `POST /api/v1/metrics` and `POST /api/v1/health`
    - _Requirements: 2.1_

  - [x] 9.3 Update metric payload to use `/api/v1/metrics` and add `probe_id` field
    - Change endpoint path from `/metrics` to `/api/v1/metrics`
    - Include `probe_id` in JSON payload
    - _Requirements: 2.1, 4.1_

  - [x] 9.4 Implement `--dry-run` mode
    - When `--dry-run` flag is set, print the JSON payload to stdout instead of making HTTP calls; all errors also go to stdout
    - _Requirements: 3.4_

  - [x] 9.5 Implement heartbeat `POST /api/v1/health` every 30 seconds
    - Use a separate counter or timestamp to fire a health request every 30 seconds alongside the normal metrics loop
    - Payload: `{ "probe_id": "...", "status": "online", "timestamp": <unix_int> }`
    - _Requirements: 4.1_

  - [x] 9.6 Improve error handling and stderr logging
    - On HTTP connection failure: print to `stderr`, sleep `interval` seconds, continue loop (do not exit)
    - On `/proc/stat` or `/proc/meminfo` unreadable: print warning to `stderr`, send cpu=0.0/memory=0.0
    - _Requirements: 3.5_

- [x] 10. Next.js 15 frontend scaffold
  - [x] 10.1 Initialize Next.js 15 project
    - Delete `frontend/index.html`; run `pnpm create next-app@latest frontend --typescript --tailwind --app --src-dir=no --import-alias="@/*"` equivalent by creating `frontend/package.json`, `frontend/next.config.ts`, `frontend/tsconfig.json`, `frontend/tailwind.config.ts`
    - Install shadcn/ui: add `frontend/components.json` and required dependencies (`shadcn/ui`, `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge`)
    - Install `recharts`, `js-cookie`, `@types/js-cookie`
    - _Requirements: 6.1_

  - [x] 10.2 Create root layout and theme provider
    - Create `frontend/app/layout.tsx`: root layout wrapping children in `ThemeProvider` (next-themes)
    - Create `frontend/app/page.tsx`: server component that redirects to `/dashboard` or `/login` based on session cookie presence
    - Create `frontend/components/ThemeToggle.tsx`: toggles `dark`/`light`, persists to `localStorage`
    - _Requirements: 6.1, 6.9_

  - [x] 10.3 Create API client utility
    - Create `frontend/lib/api.ts` with typed fetch wrappers for all orchestrator endpoints, using `NEXT_PUBLIC_API_URL` env var, `credentials: 'include'` for cookie transport
    - _Requirements: 6.2_

- [x] 11. Next.js frontend — auth pages
  - [x] 11.1 Create login page
    - Create `frontend/app/(auth)/login/page.tsx`: email + password form; on submit calls `POST /api/v1/auth/login`; on success redirects to `/dashboard` or `/onboarding` based on `onboarding_step`; shows inline error on failure
    - _Requirements: 6.2_

  - [x] 11.2 Create register page
    - Create `frontend/app/(auth)/register/page.tsx`: email + password form; on success redirects to `/onboarding`; shows inline error on 409/400
    - _Requirements: 1.1, 7.1_

- [x] 12. Next.js frontend — app shell and dashboard
  - [x] 12.1 Create app shell layout with auth guard
    - Create `frontend/app/(app)/layout.tsx`: reads `aegis_session` cookie server-side via `cookies()` from `next/headers`; redirects to `/login` if absent; renders nav bar with `StatusBadge` and `ThemeToggle`
    - _Requirements: 6.2_

  - [x] 12.2 Create `StatusBadge` component
    - Create `frontend/components/StatusBadge.tsx`: renders `SECURE` (green) or `CRITICAL` (red, pulsing) based on incidents prop
    - _Requirements: 6.8_

  - [ ]* 12.3 Write property test for status label correctness (Property 12)
    - **Property 12: Incident Status Label Correctness**
    - **Validates: Requirements 6.8**
    - `fc.array(fc.constantFrom('Open','Analyzing','Resolved','Failed'))` → `computeStatus()` → assert CRITICAL iff includes Open/Analyzing

  - [x] 12.4 Create `TelemetryChart` component
    - Create `frontend/components/TelemetryChart.tsx`: Recharts `LineChart` with two datasets (CPU cyan, RAM purple); accepts `metrics` array prop; auto-scales to last 20 points; accessible labels
    - _Requirements: 6.3_

  - [x] 12.5 Create `IncidentCard` and `IncidentFeed` components
    - Create `frontend/components/IncidentFeed.tsx` and `IncidentCard.tsx`
    - `IncidentCard`: shows status badge, issue type, probe ID, timestamp; renders "VIEW PATCH" anchor when `status=Resolved` and `prUrl` non-null; renders animated indicator when `status=Analyzing`
    - _Requirements: 6.4, 6.6, 6.7_

  - [ ]* 12.6 Write property test for resolved incident renders PR link (Property 13)
    - **Property 13: Resolved Incident Renders PR Link**
    - **Validates: Requirements 6.6**
    - `fc.webUrl()` as prUrl → render IncidentCard → assert anchor href equals prUrl

  - [x] 12.7 Create `ProbeStatusList` component
    - Create `frontend/components/ProbeStatusList.tsx`: renders each probe as online (green dot) / offline (grey dot) with `lastSeen` relative time
    - _Requirements: 6.3_

  - [x] 12.8 Implement dashboard page with 2-second polling
    - Create `frontend/app/(app)/dashboard/page.tsx`: client component; `useEffect` polling `GET /api/v1/dashboard` every 2 seconds; renders `TelemetryChart`, `IncidentFeed`, `ProbeStatusList`, `StatusBadge`
    - _Requirements: 6.3, 6.4, 6.5_

- [x] 13. Next.js frontend — incident detail, settings, onboarding
  - [x] 13.1 Create incident detail page
    - Create `frontend/app/(app)/incidents/[id]/page.tsx`: fetch `GET /api/v1/incidents/:id`; render full stack trace in `<pre>`, incident timeline, PR diff link if resolved
    - _Requirements: 6.4, 6.6_

  - [x] 13.2 Create `SettingsForm` component and settings page
    - Create `frontend/app/(app)/settings/page.tsx` and `frontend/components/SettingsForm.tsx`
    - Token fields show `••••••••` with reveal toggle; "Rotate API Key" button shows confirmation dialog before calling `POST /api/v1/settings/rotate-key`; on success shows new key in copyable input
    - _Requirements: 1.7, 1.6_

  - [x] 13.3 Create `OnboardingWizard` component and onboarding page
    - Create `frontend/app/(app)/onboarding/page.tsx` and `frontend/components/OnboardingWizard.tsx`
    - 4 steps: (1) display + copy API key with clipboard write + confirmation, (2) configure GitHub repo/token (calls `PATCH /api/v1/settings`), (3) render shell install command block pre-filled with API key and orchestrator URL, (4) poll `GET /api/v1/dashboard` every 2s for first heartbeat then show success
    - _Requirements: 1.7, 3.6, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [ ]* 13.4 Write property test for install command containing tenant credentials (Property 14) — frontend
    - **Property 14: Install Command Contains Tenant Credentials (frontend renderInstallCommand)**
    - **Validates: Requirements 3.6, 7.4**

- [x] 14. Docker Compose and environment configuration
  - [x] 14.1 Create `docker-compose.yml`
    - Services: `postgres` (postgres:16-alpine, pgdata volume), `orchestrator` (build ./backend, depends_on postgres), `ai-agent` (build ./ai_agent), `dashboard` (build ./frontend)
    - Wire environment variables: `DATABASE_URL`, `JWT_SECRET`, `FIELD_ENCRYPTION_KEY`, `AI_AGENT_URL`, `CPU_THRESHOLD`, `MEM_THRESHOLD`, `LOCAL_MODE`, `ALLOWED_ORIGIN`, `GEMINI_API_KEY`, `NEXT_PUBLIC_API_URL`
    - Expose ports: 5432, 3000, 8000, 3001
    - _Requirements: 8.4_

  - [x] 14.2 Create `backend/Dockerfile`
    - Multi-stage: `node:20-alpine` builder runs `npm ci` + `npm run build`; production stage copies `dist/` and runs `node dist/index.js`; entrypoint runs `setup_db` migration before server start
    - _Requirements: 8.4_

  - [x] 14.3 Create `ai_agent/Dockerfile`
    - `python:3.12-slim`; copy `requirements.txt`, `RUN pip install --no-cache-dir -r requirements.txt`; copy `main.py`; `CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]`
    - _Requirements: 8.4_

  - [x] 14.4 Create `frontend/Dockerfile`
    - Multi-stage Next.js build: `node:20-alpine` builder with `pnpm`; standalone output; production stage runs `node server.js`
    - _Requirements: 8.4_

  - [x] 14.5 Create `.env.example` at repo root
    - Document all required env vars: `DB_PASSWORD`, `JWT_SECRET`, `FIELD_ENCRYPTION_KEY`, `GEMINI_API_KEY`, `LOCAL_MODE`, `CPU_THRESHOLD`, `MEM_THRESHOLD`, `ALLOWED_ORIGIN`, `ORCHESTRATOR_URL`
    - _Requirements: 8.1, 8.4_

- [x] 15. Final checkpoint — full stack wiring
  - Verify `docker-compose up` starts all four services, Postgres tables exist, `GET /api/v1/dashboard` (with LOCAL_MODE) returns 200, and all automated tests pass. Ask the user if any questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Property tests use `fast-check` (Node.js) and `hypothesis` (Python) per the design document
- Each property task references the property number from the design document's "Correctness Properties" section
- Checkpoints at tasks 5, 8, and 15 ensure incremental validation before moving to the next phase
- LOCAL_MODE wiring must be verified before moving to cloud deployment
