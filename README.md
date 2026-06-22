# 🛡️ Aegis — Autonomous SRE Platform v3 (SaaS Ready)

![Next.js](https://img.shields.io/badge/Next.js_15-Full_Stack-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?logo=typescript)
![Drizzle](https://img.shields.io/badge/Drizzle_ORM-PostgreSQL-green)
![Better Auth](https://img.shields.io/badge/Better_Auth-Sessions-purple)
![Vercel](https://img.shields.io/badge/Deploy-Vercel_%2B_Neon-black?logo=vercel)

**Aegis** is an autonomous SRE and self-healing platform that monitors system telemetry, detects application crashes, performs AI root-cause analysis, proposes code corrections, and automatically opens GitHub Pull Requests with patches—all controlled via a secure manual patch review screen.

---

## ✨ Features in v3.0

- **Consolidated Architecture**: Fully migrated from a 4-service stack to a single, high-performance full-stack Next.js 15 application.
- **GitHub App Integration**: Supports secure, organization-wide GitHub App installations (replacing weak Personal Access Tokens) with one-click repository connections.
- **AI Patch Review Screen**: Beautiful interactive dashboard with code diff viewers, AI confidence score progress bars, rollback instructions, and approval CTAs.
- **Slack & Discord Alerts**: Decrypts and dispatches instant webhook notifications with direct links to review patches on the dashboard.
- **Repository Health Score**: Dynamic health status indicator for connected repositories based on incident rates and fix outcomes.
- **Robust C++ Telemetry Probe**:
  - Monitors CPU, Memory, Disk Space, running Docker containers, and active systemd services.
  - Heartbeat checks run every 60 seconds.
  - Immediate incident triggers upon log error detection.
  - Built-in 50-metric retry queue with exponential backoff for network resilience.
  - Portable design compile-tested on both Windows and Linux/WSL.

---

## 🏗️ Architecture

```
Browser → Next.js 15 App (Vercel)
              ├── /app/(auth)                 Login, Register pages
              ├── /app/(dashboard)            Dashboard, Incidents, Probes, Repos, Settings
              ├── /api/webhooks/probe         ← C++ probe telemetry POSTs here (Bearer auth)
              ├── /api/v1/health              ← C++ probe heartbeat POSTs here (Bearer auth)
              ├── /api/github/callback        ← GitHub App Redirect Callback
              ├── /api/github/repos           ← Discover accessible repositories
              ├── /api/remediations/[id]/appr ← Approve proposed AI patch
              └── /api/auth/[...all]          Better Auth session handlers
              │
              ├── Drizzle ORM → Neon PostgreSQL (Serverless)
              ├── @google/genai → Gemini 2.5 Flash (AI stack trace analysis & patch generation)
              └── @octokit/rest → Octokit App Client (creates branches, commits code, opens PRs)

[Production Server / VM]
  └── C++ Probe → POST /api/webhooks/probe (Bearer: aegis_key_xxx)
```

---

## 📁 Repository Structure

```
Aegis/
  ├── aegis-app/              ← Next.js full-stack SRE platform
  │     ├── app/              ├── Pages and API routes (App Router)
  │     ├── components/       ├── Custom Tailwind/CSS Components
  │     ├── drizzle/          └── Database migration SQL files
  │     ├── lib/              └── DB schema, Gemini AI, GitHub client, crypto helpers
  │     ├── Dockerfile        └── Next.js production standalone Dockerfile
  │     └── vercel.json       └── Vercel configuration override
  ├── main.cpp                ← Portable C++ Probe source code
  ├── httplib.h               ← C++ Header-only HTTP library
  ├── docker-compose.yml      ← Local self-hosting configuration (PostgreSQL + Next.js App)
  └── README.md
```

---

## 🚀 Step-by-Step Deployment Guide

Follow these steps to deploy Aegis to Vercel and Neon in under 15 minutes.

### 1. Provision Neon PostgreSQL
1. Sign up/log in at [neon.tech](https://neon.tech).
2. Create a new project and select your preferred region.
3. Copy your database connection string. It will look like this:
   `postgresql://neondb_owner:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require`

### 2. Configure a GitHub App
To enable automatic PR creation and one-click repo imports:
1. Go to your GitHub profile: **Settings** → **Developer Settings** → **GitHub Apps** → **New GitHub App**.
2. **App Name**: `Aegis SRE` (or any unique name).
3. **Homepage URL**: `https://your-aegis-app.vercel.app` (you can update this after Vercel deployment).
4. **Callback URL**: `https://your-aegis-app.vercel.app/api/auth/callback/github` (for Better Auth).
5. **Setup URL**: `https://your-aegis-app.vercel.app/api/github/callback` (where users are redirected after installing).
6. Under **Repository permissions**:
   - `Content`: **Read & write** (to fetch files, create branches, and commit fixes).
   - `Pull Requests`: **Read & write** (to open pull request patches).
   - `Metadata`: **Read-only** (required).
7. Under **Webhooks**: Uncheck "Active" (not needed).
8. Click **Create GitHub App**.
9. Generate a **Client Secret** and copy it along with your **Client ID** and **App ID**.
10. At the bottom, click **Generate a private key**. Download the `.pem` key file and open it. Copy its entire content, or convert it to a single-line base64 string to avoid newline issues:
    `cat key.pem | base64` (use this as `GITHUB_APP_PRIVATE_KEY`).

### 3. Generate Encryption & Session Keys
Open your terminal and run:
```bash
# Generate BETTER_AUTH_SECRET
openssl rand -hex 32

# Generate FIELD_ENCRYPTION_KEY (Must be exactly 64 hex characters)
openssl rand -hex 32
```

### 4. Deploy to Vercel
1. Install the Vercel CLI: `npm i -g vercel`.
2. Navigate to `aegis-app/` and run `vercel`.
3. In the Vercel dashboard, configure the following environment variables:

| Variable | Description |
|---|---|
| `DATABASE_URL` | Your Neon PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | 64-character hex key |
| `FIELD_ENCRYPTION_KEY` | 64-character hex key (for securing API/webhook secrets) |
| `GITHUB_CLIENT_ID` | GitHub App Client ID (for OAuth) |
| `GITHUB_CLIENT_SECRET` | GitHub App Client Secret |
| `GITHUB_APP_ID` | GitHub App ID |
| `GITHUB_APP_PRIVATE_KEY` | Raw private key (or base64 encoded private key) |
| `NEXT_PUBLIC_GITHUB_APP_SLUG` | The URL slug of your GitHub App (e.g. `aegis-sre`) |
| `NEXT_PUBLIC_APP_URL` | `https://your-aegis-app.vercel.app` |
| `GEMINI_API_KEY` | Google Gemini key from [aistudio.google.com](https://aistudio.google.com) |

4. Run `vercel --prod` to deploy the app to production.
5. Update your GitHub App settings with your live Vercel URL.

### 5. Run Database Migrations
Run the Drizzle migrations to set up the database tables in Neon:
```bash
cd aegis-app
# Set DATABASE_URL locally or in your session
pnpm db:migrate
```

---

## 🔧 C++ Probe Setup

Compile the probe on the servers you wish to monitor:

```bash
# Compile (Linux / WSL / macOS)
g++ main.cpp -o aegis-probe -pthread -std=c++17

# Compile on Windows (PowerShell)
g++ main.cpp -o aegis-probe.exe -lws2_32 -std=c++17

# Test probe locally without sending metrics
./aegis-probe --dry-run

# Connect the probe to your deployed Aegis instance
./aegis-probe \
  --endpoint  https://your-aegis-app.vercel.app \
  --api-key   aegis_key_xxx \           # Create an API Key in Aegis Settings
  --log-file  /var/log/my-app/error.log \
  --probe-id  prod-backend-node-1 \
  --interval  10
```

---

## 🧪 Testing the Autonomous Loop

### 1. Run the Probe
Ensure the probe is tailing a log file (e.g., `real_server_error.log`) and pointing to your Aegis instance.
```bash
./aegis-probe --api-key YOUR_PROBE_API_KEY --log-file real_server_error.log
```
The Dashboard will display your probe as **Online**.

### 2. Simulate an Application Crash
Write an error stack trace to the log file:
```bash
echo -e "TypeError: Cannot read properties of undefined (reading 'split')\n    at parseData (server.js:45:21)\n    at processTicksAndRejections (node:internal/process/task_queues:95:5)" >> real_server_error.log
```

### 3. Review & Approve
1. Check your Slack or Discord channel. You will receive an alert with a direct link to the incident.
2. Open the Aegis incident page.
3. Review the **Confidence Score** and code diff.
4. Click **Approve & Open PR**.
5. Aegis will automatically push the correction to your GitHub repository and open a Pull Request.

---

## 🔐 Security Configuration

- **Field Encryption**: Session/secret tokens are encrypted at rest with AES-256-GCM using `FIELD_ENCRYPTION_KEY`.
- **Hashed Probe API Keys**: API keys are stored in the database as SHA-256 hashes.
- **Row-level Isolation**: Every database interaction is scoped to the authenticated user's `userId`.
- **Authentication**: Handled securely by Better Auth using HttpOnly cookies with CSRF protection.
