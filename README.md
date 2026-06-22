# 🛡️ Aegis — Autonomous SRE Platform v3

![Next.js](https://img.shields.io/badge/Next.js_15-Full_Stack-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript)
![Drizzle](https://img.shields.io/badge/Drizzle_ORM-PostgreSQL-green)
![Better Auth](https://img.shields.io/badge/Better_Auth-Sessions-purple)
![Vercel](https://img.shields.io/badge/Deploy-Vercel_%2B_Neon-black?logo=vercel)

**Aegis** detects server crashes, isolates the root cause with Google Gemini AI, and automatically opens a GitHub Pull Request with a patch — all without human intervention.

**v3 is a complete rewrite** — from a 4-service microservice stack (Next.js + Express + FastAPI + Postgres) to a single, deployable-in-15-minutes Next.js full-stack app on Vercel + Neon.

---

## ✨ What's new in v3

| Before (v2) | After (v3) |
|---|---|
| Express backend (separate service) | Next.js API routes |
| Python FastAPI AI Agent | TypeScript + `@google/genai` |
| Raw SQL queries | Drizzle ORM with full schema |
| Custom JWT auth | Better Auth (email + GitHub OAuth) |
| Hardcoded localhost | Deployable to Vercel in 1 click |
| Single-tenant | Multi-user, row-level isolated |
| Polling every 2s | Configurable, heartbeat every 60s |

---

## 🏗️ Architecture

```
Browser → Next.js 15 App (Vercel)
              ├── /app/(auth)          Login, Register
              ├── /app/(dashboard)     Dashboard, Incidents, Probes, Repos, Settings
              ├── /api/webhooks/probe  ← C++ probe POSTs here (Bearer auth)
              ├── /api/v1/metrics      ← backward compat for old probes
              ├── /api/dashboard       Dashboard data
              ├── /api/incidents       Incident CRUD
              ├── /api/probes          Probe management
              ├── /api/repositories    GitHub repo management
              ├── /api/settings        User settings
              └── /api/auth/[...all]   Better Auth handler
              │
              ├── Drizzle ORM → Neon PostgreSQL
              ├── @google/genai → Gemini 2.5 Flash (AI analysis + patch gen)
              └── @octokit/rest → GitHub (fetch file, create branch, open PR)

[Linux Server]
  └── C++ Probe → POST /api/webhooks/probe (Bearer: aegis_xxx)
```

---

## 📁 Project layout

```
aegis-app/          ← The v3 unified Next.js app (use this)
  app/              ← Pages + API routes (App Router)
  components/       ← UI components (shadcn/ui + custom)
  lib/              ← Business logic (auth, AI, GitHub, DB, crypto)
  drizzle.config.ts
  vercel.json       ← One-click Vercel deploy

backend/            ← v2 Express orchestrator (kept for reference)
ai_agent/           ← v2 Python AI agent (kept for reference)
frontend/           ← v2 Next.js dashboard (kept for reference)
main.cpp            ← C++ probe (works with v2 AND v3)
```

---

## 🚀 Deploy to Vercel + Neon (15 minutes)

### Step 1 — Neon database

1. Go to [neon.tech](https://neon.tech) → Create project → Copy the connection string
2. It looks like: `postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require`

### Step 2 — GitHub OAuth App

1. Go to [github.com/settings/applications/new](https://github.com/settings/applications/new)
2. Application name: `Aegis`
3. Homepage URL: `https://your-project.vercel.app`
4. Authorization callback URL: `https://your-project.vercel.app/api/auth/callback/github`
5. Copy `Client ID` and `Client Secret`

### Step 3 — Generate secrets

```bash
# Run these twice, use one for each:
openssl rand -hex 32   # → BETTER_AUTH_SECRET
openssl rand -hex 32   # → FIELD_ENCRYPTION_KEY
```

### Step 4 — Deploy

```bash
npm i -g vercel
cd aegis-app
vercel
```

Set these environment variables in Vercel dashboard (or `vercel env add`):

| Variable | Value |
|---|---|
| `DATABASE_URL` | Your Neon connection string |
| `BETTER_AUTH_SECRET` | 64-char hex (openssl rand -hex 32) |
| `FIELD_ENCRYPTION_KEY` | 64-char hex (openssl rand -hex 32) |
| `GITHUB_CLIENT_ID` | From GitHub OAuth App |
| `GITHUB_CLIENT_SECRET` | From GitHub OAuth App |
| `NEXT_PUBLIC_APP_URL` | `https://your-project.vercel.app` |
| `GEMINI_API_KEY` | From [aistudio.google.com](https://aistudio.google.com) |

### Step 5 — Run DB migration

```bash
# From aegis-app/ with DATABASE_URL set:
pnpm db:migrate
```

Or just deploy — the app will auto-create tables on first request (Drizzle handles this).

---

## 🖥️ Local development

```bash
git clone https://github.com/Aakarsh2007/Aegis.git
cd Aegis/aegis-app

pnpm install

cp .env.example .env.local
# Fill in .env.local (see above table)

pnpm db:migrate    # creates tables in your DB
pnpm dev           # http://localhost:3000
```

---

## 🔧 C++ Probe setup

The probe works with both v2 and v3. Compile once, point at your deployed URL:

```bash
# Compile (Linux / WSL)
g++ main.cpp -o aegis-probe -pthread -std=c++17

# Test locally (dry run - no HTTP)
./aegis-probe --dry-run

# Connect to your deployed Aegis instance
./aegis-probe \
  --endpoint  https://your-project.vercel.app \
  --api-key   aegis_xxxx  \          # from Probes → Create probe
  --log-file  /var/log/app/error.log \
  --probe-id  web-server-prod-1 \
  --interval  5                       # seconds between metrics
```

**CLI flags:**

| Flag | Env var | Default | Description |
|---|---|---|---|
| `--endpoint` | `AEGIS_ENDPOINT` | `http://localhost:3000` | Orchestrator URL |
| `--api-key` | `AEGIS_API_KEY` | (none) | Your probe API key |
| `--log-file` | `AEGIS_LOG_FILE` | `real_server_error.log` | File to tail for crashes |
| `--probe-id` | `AEGIS_PROBE_ID` | hostname | Unique probe identifier |
| `--interval` | `AEGIS_INTERVAL` | `2` | Polling interval in seconds |
| `--dry-run` | — | false | Print to stdout, no HTTP |

---

## 🧪 Testing all features

### 1. Register & Onboarding
- Open http://localhost:3000 → **Create account**
- Go through the 4-step onboarding wizard
- Create a probe (saves API key) → copy install command

### 2. Run the probe
```bash
./aegis-probe --api-key YOUR_KEY --log-file real_server_error.log
```
→ Dashboard shows your probe as **Online**

### 3. Trigger a crash
```bash
python buggy_service.py 2>> real_server_error.log
```
→ Incident appears as **Open** → **Analyzing** → **Resolved**
→ GitHub PR is created automatically

### 4. Test AI remediation
The incident detail page shows:
- Confidence score (0–100%)
- Affected file
- AI explanation of the fix
- Rollback notes
- Link to PR

### 5. Settings
- Add GitHub token + repo (for PR creation)
- Add Gemini key (or use the global `GEMINI_API_KEY`)
- Add Slack/Discord webhook for alerts
- Rotate API keys

---

## 🔐 Security

| Feature | Implementation |
|---|---|
| Passwords | Better Auth (bcrypt) |
| Sessions | HttpOnly cookie, 7-day expiry |
| API keys | SHA-256 hashed, never stored plaintext |
| GitHub/Gemini tokens | AES-256-GCM encrypted at rest |
| SQL queries | Drizzle ORM parameterized only |
| Multi-tenancy | `userId` scoped on every DB query |
| CORS | Strict origin matching |

**Generate secrets:**
```bash
openssl rand -hex 32   # BETTER_AUTH_SECRET
openssl rand -hex 32   # FIELD_ENCRYPTION_KEY
```

---

## 📦 Environment variables

```env
# Required
DATABASE_URL=postgresql://...
BETTER_AUTH_SECRET=<64-hex>
FIELD_ENCRYPTION_KEY=<64-hex>
GITHUB_CLIENT_ID=<from github oauth app>
GITHUB_CLIENT_SECRET=<from github oauth app>
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app

# Optional (can also be set per-user in Settings)
GEMINI_API_KEY=AIza...
CPU_THRESHOLD=80
MEM_THRESHOLD=90
```

---

## 🐳 Docker (optional, for self-hosting)

```bash
# In the repo root:
docker compose up --build

# Services:
# - Orchestrator (v2 Express): http://localhost:3000
# - AI Agent (v2 Python):      http://localhost:8000
# - Dashboard (v2 Next.js):    http://localhost:3001
# - PostgreSQL:                 localhost:5432

# OR run only the v3 unified app:
docker build -t aegis-v3 aegis-app/
docker run -p 3000:3000 --env-file aegis-app/.env.local aegis-v3
```

---

## 🗺️ Roadmap

**Phase 1 (current — v3)** — Unified deployable MVP
- ✅ Next.js full-stack app
- ✅ Better Auth (email + GitHub OAuth)
- ✅ Drizzle ORM + Neon PostgreSQL
- ✅ AI remediation (Gemini 2.5 Flash in TypeScript)
- ✅ GitHub PR creation (Octokit in TypeScript)
- ✅ Multi-user, row-level isolation
- ✅ Vercel deployment with vercel.json
- ✅ C++ probe (configurable endpoint, API key, heartbeat)

**Phase 2 — Production ready**
- [ ] GitHub App (installable, no PAT needed)
- [ ] Slack/Discord alert delivery
- [ ] Email alerts (Resend)
- [ ] AI patch review screen (approve before PR opens)
- [ ] Sentry integration
- [ ] Repository health score

**Phase 3 — SaaS ready**
- [ ] Billing abstraction (Free / Pro / Enterprise tiers)
- [ ] Team management
- [ ] Audit logs UI
- [ ] Usage analytics

---

## 🏗️ v2 Legacy services

The original `backend/`, `ai_agent/`, and `frontend/` directories are kept for reference. They work independently with their own `docker-compose.yml`. See the v2 setup instructions in the [v2 README section below](#v2-local-setup-legacy).

### v2 Local Setup (legacy)

```bash
# Terminal 1 — Orchestrator
cd backend && npm install && npm run migrate && npm run dev

# Terminal 2 — AI Agent
cd ai_agent && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt && python main.py

# Terminal 3 — Dashboard
cd frontend && pnpm install && pnpm dev   # http://localhost:3001

# Terminal 4 — Probe
g++ main.cpp -o aegis-probe -pthread -std=c++17
./aegis-probe --endpoint http://localhost:3000 --api-key YOUR_KEY
```
