# Requirements Document

## Introduction

Aegis Cloud Platform transforms the existing single-tenant, localhost-only Aegis SRE engine into a globally deployable, multi-tenant SaaS product. Any engineering team on the internet can sign up, obtain an API key, install the lightweight C++ probe on their Linux servers, and immediately benefit from autonomous crash detection, AI-powered root-cause analysis, and automated GitHub PR remediation — all visualized through a production-grade Next.js 15 dashboard. The existing local development workflow is preserved so contributors can run the full stack on localhost without cloud dependencies.

---

## Glossary

- **Platform**: The Aegis Cloud Platform as a whole — the sum of all services described in this document.
- **Tenant**: An organization or individual user who has registered for the Platform and owns one or more Probes.
- **Probe**: The C++ edge daemon that reads Linux kernel telemetry (`/proc/stat`, `/proc/meminfo`) and tails crash logs on a Tenant's server, then ships telemetry to the Orchestrator.
- **Orchestrator**: The Node.js/TypeScript backend service that ingests telemetry, persists data, enforces thresholds, and dispatches remediation tasks.
- **AI Agent**: The Python/FastAPI service that uses Gemini to identify the faulty file from a stack trace, generate a patch, and open a GitHub Pull Request.
- **Dashboard**: The Next.js 15 + TypeScript frontend application that provides real-time telemetry visualization, incident management, and tenant self-service.
- **API Key**: A secret token issued to a Tenant upon registration, used to authenticate all Probe-to-Orchestrator and Dashboard-to-Orchestrator requests.
- **Incident**: A recorded event representing a detected anomaly (CPU spike, memory leak, or crash) on a specific Probe, with lifecycle states: `Open`, `Analyzing`, `Resolved`, `Failed`.
- **Tenant Context**: The database row-level scope identifying which Tenant owns a given resource (metric, incident, probe registration).
- **Onboarding Flow**: The sequence of UI screens that guides a newly registered Tenant from account creation through API key retrieval and Probe installation.
- **Local Mode**: A configuration of the Platform where all services bind to `localhost` without requiring cloud credentials, used for development and self-hosting.

---

## Requirements

### Requirement 1: Tenant Registration and API Key Issuance

**User Story:** As a new user, I want to create an account and receive an API key, so that I can authenticate my Probe and access my private dashboard.

#### Acceptance Criteria

1. THE Platform SHALL provide a registration endpoint that accepts an email address and password.
2. WHEN a Tenant submits a valid registration request, THE Orchestrator SHALL create a Tenant record, generate a cryptographically random API key of at least 32 bytes, and return it in the response body exactly once.
3. WHEN a registration request contains a duplicate email address, THE Orchestrator SHALL return HTTP 409 and a descriptive error message without creating a duplicate record.
4. WHEN a registration request is missing a required field, THE Orchestrator SHALL return HTTP 400 and identify the missing field.
5. THE Orchestrator SHALL store passwords as salted hashes using bcrypt with a work factor of at least 12; it SHALL NOT store plaintext passwords.
6. WHEN a Tenant requests API key rotation, THE Orchestrator SHALL invalidate the previous key and issue a new key within the same response.
7. THE Dashboard SHALL present the API key to the Tenant in a copyable input field during the Onboarding Flow and on the account settings page.

---

### Requirement 2: Probe Authentication and Multi-Tenancy

**User Story:** As a Tenant, I want my Probe to identify itself with my API key, so that the Platform isolates my telemetry from other Tenants' data.

#### Acceptance Criteria

1. THE Probe SHALL include the Tenant's API key as a Bearer token in the `Authorization` header of every HTTP request it sends to the Orchestrator.
2. WHEN the Orchestrator receives a `/metrics` request with a missing or malformed `Authorization` header, THE Orchestrator SHALL return HTTP 401 and reject the payload without writing any data.
3. WHEN the Orchestrator receives a `/metrics` request with an unrecognized API key, THE Orchestrator SHALL return HTTP 403 and reject the payload.
4. WHEN the Orchestrator authenticates a valid API key, THE Orchestrator SHALL resolve the corresponding Tenant identifier and tag all persisted metrics and incidents with that Tenant's identifier.
5. THE Orchestrator SHALL enforce row-level isolation such that a query for metrics or incidents belonging to Tenant A SHALL NOT return data belonging to Tenant B.
6. THE Probe SHALL accept the Orchestrator endpoint URL and API key as runtime configuration values (environment variable or config file) and SHALL NOT hardcode `localhost` or any specific URL.
7. WHERE the Probe is started without an explicit endpoint URL, THE Probe SHALL default to `http://localhost:3000` to preserve Local Mode operation.

---

### Requirement 3: Edge Probe Portability

**User Story:** As a Tenant's infrastructure engineer, I want to run the C++ probe on any standard Linux machine, so that I can monitor any server regardless of where it runs.

#### Acceptance Criteria

1. THE Probe SHALL read CPU telemetry exclusively from `/proc/stat` and memory telemetry exclusively from `/proc/meminfo`, preserving compatibility with any Linux kernel 3.10 or later.
2. THE Probe SHALL accept a target log file path as a runtime parameter and SHALL NOT hardcode `real_server_error.log`.
3. THE Probe SHALL compile and run on any x86-64 or ARM64 Linux distribution using only a C++17 compiler and the `pthread` library, with no additional runtime dependencies beyond `httplib.h`.
4. THE Probe SHALL support a `--dry-run` flag that causes it to print telemetry to stdout instead of sending HTTP requests, enabling local testing without a running Orchestrator.
5. WHEN the Orchestrator endpoint is unreachable, THE Probe SHALL log a human-readable error to stderr, wait the configured polling interval, and retry without exiting.
6. THE Dashboard Onboarding Flow SHALL display a copy-paste shell command that pre-fills the Tenant's API key and the Platform's Orchestrator URL for compiling and launching the Probe.

---

### Requirement 4: Telemetry Ingestion and Incident Lifecycle

**User Story:** As a Tenant, I want the Platform to automatically detect anomalies in my servers' telemetry and track them through resolution, so that I have full visibility into every incident.

#### Acceptance Criteria

1. WHEN the Orchestrator receives a valid authenticated metrics payload, THE Orchestrator SHALL persist a `system_metrics` row tagged with the Tenant identifier and a UTC timestamp.
2. WHEN a metric payload contains a `cpu_usage` value above the configured CPU threshold, THE Orchestrator SHALL evaluate whether an Open Incident already exists for that Tenant and Probe.
3. WHEN a metric payload contains a `memory_usage` value above the configured memory threshold, THE Orchestrator SHALL evaluate whether an Open Incident already exists for that Tenant and Probe.
4. WHEN no Open Incident exists for the Tenant and Probe, THE Orchestrator SHALL create a new Incident record with status `Open` and immediately dispatch the payload to the AI Agent.
5. WHEN an Open Incident already exists for the Tenant and Probe, THE Orchestrator SHALL update the existing Incident's latest metric values and SHALL NOT create a duplicate Incident.
6. WHEN the AI Agent returns a PR URL, THE Orchestrator SHALL update the Incident status to `Resolved` and persist the PR URL.
7. WHEN the AI Agent returns an error, THE Orchestrator SHALL update the Incident status to `Failed` and persist the error message.
8. THE Orchestrator SHALL expose the CPU and memory thresholds as environment-variable-configurable values with defaults of 80% and 90% respectively.

---

### Requirement 5: AI-Powered Auto-Remediation

**User Story:** As a Tenant, I want the AI Agent to automatically identify the broken file, generate a patch, and open a GitHub PR, so that my team has a ready-to-review fix without manual triage.

#### Acceptance Criteria

1. WHEN the AI Agent receives a remediation request, THE AI Agent SHALL use the Gemini API to extract the target filename from the provided stack trace before fetching any file from GitHub.
2. WHEN the AI Agent extracts a target filename, THE AI Agent SHALL fetch the file's current content from the Tenant's configured GitHub repository using the Tenant's GitHub token.
3. WHEN the AI Agent has obtained the file content, THE AI Agent SHALL submit the file and the incident context to Gemini and request a corrected version of the file containing only raw source code without markdown formatting.
4. WHEN Gemini returns a corrected file, THE AI Agent SHALL create a new branch named `aegis-fix-{incident_id}-{unix_timestamp}`, commit the patch, and open a Pull Request against the repository's default branch.
5. WHEN any step of the remediation process fails, THE AI Agent SHALL return a structured error response containing the step that failed and the underlying error message, without raising an unhandled exception.
6. THE AI Agent SHALL support per-Tenant GitHub credentials passed as part of the remediation request payload rather than relying on a single global environment variable.
7. THE AI Agent SHALL sanitize Gemini output by removing any leading or trailing markdown code fences before committing the content to GitHub.

---

### Requirement 6: Real-Time Multi-Tenant Dashboard

**User Story:** As a Tenant, I want a production-grade web dashboard that shows only my data in real time, so that I can monitor my infrastructure and act on incidents instantly.

#### Acceptance Criteria

1. THE Dashboard SHALL be built with Next.js 15, TypeScript, and pnpm, and SHALL use the App Router.
2. THE Dashboard SHALL authenticate users via a session cookie set upon successful email/password login; it SHALL redirect unauthenticated users to the login page.
3. WHEN an authenticated Tenant views the main dashboard, THE Dashboard SHALL display a telemetry chart showing that Tenant's last 20 CPU and memory data points.
4. WHEN an authenticated Tenant views the main dashboard, THE Dashboard SHALL display an incident feed showing that Tenant's 5 most recent incidents with their current status and a link to the PR when available.
5. THE Dashboard SHALL refresh telemetry and incident data every 2 seconds using a client-side polling mechanism, or via WebSocket streaming if supported by the Orchestrator.
6. WHEN an incident status changes to `Resolved`, THE Dashboard SHALL display a clickable link labeled "VIEW PATCH" pointing to the GitHub PR URL.
7. WHEN an incident status is `Analyzing`, THE Dashboard SHALL display an animated indicator communicating that the AI is actively working.
8. THE Dashboard SHALL display a global status indicator labeled `SECURE` when no Open or Analyzing incidents exist for the Tenant, and `CRITICAL` with a pulsing red animation when at least one such incident exists.
9. THE Dashboard SHALL be fully responsive and render correctly on viewports from 375px to 1920px wide.
10. THE Dashboard SHALL achieve a Lighthouse accessibility score of at least 90.

---

### Requirement 7: Onboarding Flow

**User Story:** As a newly registered Tenant, I want a guided setup experience, so that I can go from sign-up to a running Probe in under five minutes.

#### Acceptance Criteria

1. WHEN a Tenant completes registration, THE Dashboard SHALL redirect the Tenant to a multi-step Onboarding Flow.
2. THE Onboarding Flow SHALL present the following steps in order: (1) display and copy API key, (2) configure GitHub integration, (3) display the Probe install command, (4) confirm Probe is live.
3. WHEN the Tenant clicks "Copy" next to the API key, THE Dashboard SHALL write the API key to the system clipboard and display a confirmation message.
4. THE Onboarding Flow Step 3 SHALL render a shell command block pre-filled with the Tenant's API key and the Platform Orchestrator URL that the Tenant can copy and paste into their Linux terminal.
5. WHEN the Platform receives a first telemetry ping from the Tenant's Probe after completing Step 3, THE Dashboard SHALL automatically advance the Onboarding Flow to Step 4 and display a success confirmation.
6. THE Dashboard SHALL allow the Tenant to skip the Onboarding Flow and return to it at any time from the account settings page.

---

### Requirement 8: Local Development Mode

**User Story:** As a contributor or self-hoster, I want to run the entire Platform on localhost without cloud credentials, so that I can develop and test locally.

#### Acceptance Criteria

1. THE Platform SHALL support a `LOCAL_MODE=true` environment variable that disables API key authentication and routes all inter-service calls to localhost addresses.
2. WHEN `LOCAL_MODE=true` is set, THE Orchestrator SHALL accept unauthenticated `/metrics` requests and assign them to a default local Tenant.
3. WHEN `LOCAL_MODE=true` is set, THE Orchestrator SHALL route AI Agent requests to `http://localhost:8000` regardless of any cloud service URL configuration.
4. THE Platform SHALL provide a single `docker-compose.yml` file that starts the Orchestrator, AI Agent, and a PostgreSQL instance with all required tables pre-created, binding all services to localhost.
5. THE Probe in Local Mode SHALL default to sending telemetry to `http://localhost:3000/metrics` without requiring an API key in the `Authorization` header when `LOCAL_MODE=true` is set on the Orchestrator.

---

### Requirement 9: Database Schema and Multi-Tenant Data Isolation

**User Story:** As the Platform operator, I want the database schema to enforce Tenant isolation at the schema level, so that data leaks between Tenants are structurally impossible.

#### Acceptance Criteria

1. THE Orchestrator SHALL maintain a `tenants` table with at minimum: `id`, `email` (unique), `password_hash`, `api_key` (unique), `created_at`, `github_token`, `github_repo`.
2. THE Orchestrator SHALL maintain a `system_metrics` table with a non-nullable `tenant_id` foreign key referencing `tenants.id`.
3. THE Orchestrator SHALL maintain an `incidents` table with a non-nullable `tenant_id` foreign key referencing `tenants.id` and a `probe_id` column.
4. WHEN the Orchestrator queries `system_metrics` or `incidents`, THE Orchestrator SHALL always include a `WHERE tenant_id = $1` clause parameterized with the authenticated Tenant's identifier.
5. THE Orchestrator SHALL provide a database migration script (`setup_db.ts` or equivalent) that creates all tables idempotently using `CREATE TABLE IF NOT EXISTS` and adds the `tenant_id` foreign keys.

---

### Requirement 10: Security Baseline

**User Story:** As a Tenant, I want confidence that the Platform protects my credentials and data, so that I can trust it with production infrastructure access.

#### Acceptance Criteria

1. THE Orchestrator SHALL validate and sanitize all incoming JSON fields before using them in SQL queries, using parameterized queries exclusively.
2. THE Orchestrator SHALL set the following HTTP response headers on all responses: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security` (when served over HTTPS).
3. THE Orchestrator SHALL rate-limit the `/metrics` ingest endpoint to a maximum of 60 requests per minute per API key, returning HTTP 429 when exceeded.
4. THE Dashboard SHALL transmit the session token exclusively via an `HttpOnly`, `Secure`, `SameSite=Strict` cookie and SHALL NOT expose it to JavaScript.
5. THE Orchestrator SHALL expire session tokens after 24 hours of inactivity.
6. IF a Tenant's GitHub token is stored in the database, THE Orchestrator SHALL store it encrypted at rest using AES-256, and SHALL decrypt it only at the time of dispatching a remediation request.
