# 🛡️ Aegis — Autonomous SRE Platform

![Next.js](https://img.shields.io/badge/Frontend-Next.js_15-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/Backend-TypeScript-blue?logo=typescript)
![Python](https://img.shields.io/badge/AI_Agent-Python_3.12-yellow?logo=python)
![C++](https://img.shields.io/badge/Probe-C++17-purple?logo=cplusplus)
![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL_16-blue?logo=postgresql)
![Docker](https://img.shields.io/badge/Deploy-Docker_Compose-2496ED?logo=docker)

**Aegis** is a multi-tenant, cloud-ready autonomous SRE platform that detects server crashes, isolates root causes with Google Gemini AI, and automatically opens GitHub Pull Requests with a code fix — all without human intervention.

---

## ✨ How it works

```
[Your Linux Server]
  └─ C++ Probe  ──POST /api/v1/metrics (Bearer token)──►  [Orchestrator]
                                                               │ PostgreSQL
                                                               │ Threshold engine
                                                               └─ POST /remediate ──► [AI Agent]
                                                                                          │ Gemini: find file
                                                                                          │ GitHub: fetch code
                                                                                          │ Gemini: patch
                                                                                          └─ GitHub: open PR
[Next.js Dashboard]  ◄──── GET /api/v1/dashboard (2s polling) ──────────────────────────┘
```

1. **Detect** — C++ probe reads `/proc/stat` + `/proc/meminfo` every 2 s and tails a crash log
2. **Alert** — Telemetry streams to the cloud orchestrator over HTTPS with per-tenant Bearer auth
3. **Analyze** — Gemini reads the stack trace and identifies the broken file
4. **Fix** — Aegis fetches the file from GitHub, generates a patch, creates a branch, opens a PR
5. **Visualize** — Real-time Next.js dashboard shows live metrics, incident timeline, and a link to the AI patch

---

## 🏗️ Architecture

| Layer | Tech | Role |
|---|---|---|
| Edge Probe | C++17 + httplib | Linux kernel telemetry, log tailing |
| Orchestrator | Node.js 20 + Express 4 + TypeScript | Auth, multi-tenancy, incidents, DB |
| AI Agent | Python 3.12 + FastAPI + Gemini | Patch generation, GitHub PR |
| Dashboard | Next.js 15 + Tailwind + Recharts | Real-time SRE UI |
| Database | PostgreSQL 16 | Persistent multi-tenant data store |

---

## 📁 Project structure

```
aegis/
├── main.cpp                    # C++ probe (edge daemon)
├── httplib.h                   # Single-header HTTP library
├── buggy_service.py            # Demo crash target to trigger Aegis
├── backend/                    # Node.js orchestrator
│   ├── src/
│   │   ├── index.ts            # Express entry point + security middleware
│   │   ├── setup_db.ts         # DB migration + retention cleanup
│   │   ├── types.ts            # Shared TypeScript interfaces
│   │   ├── crypto.ts           # AES-256-GCM field encryption
│   │   ├── incidents.ts        # Threshold engine + incident dedup
│   │   ├── remediation.ts      # Async AI Agent dispatch
│   │   ├── middleware/
│   │   │   ├── probeAuth.ts    # Bearer token validation
│   │   │   └── sessionAuth.ts  # JWT cookie validation
│   │   └── routes/
│   │       ├── auth.ts         # /register /login /logout
│   │       ├── metrics.ts      # /metrics /health
│   │       └── dashboard.ts    # /dashboard /incidents /settings /onboarding
│   ├── Dockerfile
│   └── package.json
├── ai_agent/                   # Python AI agent
│   ├── main.py                 # FastAPI + Gemini + PyGithub
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/                   # Next.js 15 dashboard
│   ├── app/
│   │   ├── (auth)/login/       # Login page
│   │   ├── (auth)/register/    # Register page
│   │   └── (app)/
│   │       ├── dashboard/      # Live telemetry + incident feed
│   │       ├── incidents/[id]/ # Incident detail + timeline
│   │       ├── settings/       # GitHub/Gemini keys + API key rotation
│   │       └── onboarding/     # 4-step setup wizard
│   ├── components/             # NavBar, TelemetryChart, IncidentCard, etc.
│   ├── lib/api.ts              # Typed API client
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
└── .env.example
```

---

## 🖥️ Local setup (step by step)

### Prerequisites

- Node.js 20+
- Python 3.12+
- PostgreSQL 16 running locally (`createdb aegis`)
- pnpm (`npm install -g pnpm`)
- g++ with C++17 support (Linux/WSL only for the probe)
- A Google Gemini API key → https://aistudio.google.com/apikey
- A GitHub Personal Access Token with `repo` scope → https://github.com/settings/tokens

---

### Step 1 — Clone & copy env

```bash
git clone https://github.com/Aakarsh2007/Aegis.git
cd Aegis
cp .env.example .env
```

Open `.env` and fill in:

```env
DB_PASSWORD=your_postgres_password
DATABASE_URL=postgres://aegis:your_postgres_password@localhost:5432/aegis
JWT_SECRET=<run: openssl rand -hex 32>
FIELD_ENCRYPTION_KEY=<run: openssl rand -hex 32>
GEMINI_API_KEY=AIza...
```

For local dev set:
```env
LOCAL_MODE=false
ALLOWED_ORIGIN=http://localhost:3001
ORCHESTRATOR_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3000
```

---

### Step 2 — Database

```bash
# Create the database (if not exists)
createdb aegis

# Run migration (creates all tables)
cd backend
npm install
cp ../.env .env
npm run migrate
# Expected: ✅ All tables ready, 🎉 Migration complete
```

---

### Step 3 — Start the orchestrator

```bash
# In backend/
npm run dev
# Expected: 🛡️  Aegis Orchestrator running on port 3000
```

---

### Step 4 — Start the AI Agent

```bash
cd ai_agent
python -m venv .venv

# Linux/macOS
source .venv/bin/activate
# Windows (WSL)
source .venv/bin/activate

pip install -r requirements.txt
cp ../.env .env
python main.py
# Expected: 🤖 Starting Aegis AI Agent on port 8000...
```

---

### Step 5 — Start the dashboard

```bash
cd frontend
pnpm install
# Create .env.local
echo "NEXT_PUBLIC_API_URL=http://localhost:3000" > .env.local
pnpm dev
# Expected: Next.js ready on http://localhost:3001
```

Open **http://localhost:3001**

---

### Step 6 — Compile and run the probe (Linux/WSL)

```bash
# Compile (run once)
g++ main.cpp -o aegis-probe -pthread -std=c++17

# Dry-run first (no HTTP, just prints telemetry)
./aegis-probe --dry-run

# Real local run (register first on the dashboard to get your API key)
./aegis-probe \
  --endpoint  http://localhost:3000 \
  --api-key   YOUR_API_KEY_HERE \
  --log-file  real_server_error.log \
  --probe-id  my-local-server
```

---

## 🧪 Testing all features (step by step)

### 1. Register an account

1. Go to http://localhost:3001
2. Click **Create one** → fill email + password (min 8 chars) → **Create account**
3. You're redirected to the **Onboarding wizard**

---

### 2. Onboarding wizard

**Step 1 — API Key**
- Copy your API key (you'll need it for the probe)
- Click **Continue**

**Step 2 — GitHub**
- Enter your repo: `your-username/your-repo`
- Paste your GitHub token (`ghp_...`)
- Optionally paste your own Gemini key (or leave blank to use the global one)
- Click **Save & continue**

**Step 3 — Install command**
- The shell command is pre-filled with your API key and endpoint
- Click **Copy** then run it on your Linux/WSL terminal
- Click **I've started the probe**

**Step 4 — Confirm**
- Aegis polls every 2s waiting for the first heartbeat
- Once the probe is running it auto-advances and redirects to the dashboard

---

### 3. Dashboard — normal state

- You should see **SECURE** badge in the top-right
- The telemetry chart renders CPU and RAM in real time
- Your probe appears as **Online** in the Probes panel

---

### 4. Trigger a crash (test auto-remediation)

```bash
# Run the demo buggy service — it crashes on batch 5
python buggy_service.py 2>> real_server_error.log
```

The probe tails `real_server_error.log`, detects the exception, and sends it to the orchestrator. Within a few seconds:

1. Dashboard shows a new **Critical** incident with status **Analyzing**
2. The AI Agent wakes up, extracts the filename from the stack trace
3. Gemini generates a patch
4. A PR is opened on your GitHub repo
5. Dashboard updates to **Resolved** with a green **VIEW AI PATCH** button

---

### 5. Incident detail view

- Click **Details →** on any incident card
- See the full stack trace, incident timeline (Open → Analyzing → Resolved), and a link to the PR diff

---

### 6. Settings page

- Navigate to **Settings**
- Rotate your API key (probe needs updating after this)
- Update GitHub repo / token / Gemini key / webhook URL

---

### 7. Test rate limiting

```bash
# Send 61 rapid requests with a fake key — should see 429 on the 61st
for i in {1..62}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST http://localhost:3000/api/v1/metrics \
    -H "Authorization: Bearer $(openssl rand -hex 32)" \
    -H "Content-Type: application/json" \
    -d '{"probe_id":"test","cpu":10,"memory":10}'
done
```

---

### 8. Test LOCAL_MODE

Set `LOCAL_MODE=true` in `.env` and restart the orchestrator. The probe can now POST without any API key:

```bash
./aegis-probe --dry-run   # still just prints
./aegis-probe             # sends without Authorization header
```

---

## 🌐 Deployment guide

### Option A — Docker Compose (any VPS: DigitalOcean, Hetzner, EC2)

This is the simplest full-stack deployment. One server runs everything.

```bash
# 1. SSH into your server
ssh user@your-server-ip

# 2. Install Docker + Docker Compose
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker

# 3. Clone the repo
git clone https://github.com/Aakarsh2007/Aegis.git
cd Aegis

# 4. Create .env (never commit this!)
cp .env.example .env
nano .env
# Fill in: DB_PASSWORD, JWT_SECRET, FIELD_ENCRYPTION_KEY, GEMINI_API_KEY
# Set: ALLOWED_ORIGIN=https://yourdomain.com
#      ORCHESTRATOR_URL=https://api.yourdomain.com
#      NEXT_PUBLIC_API_URL=https://api.yourdomain.com

# 5. Start all services
docker compose up -d --build

# Dashboard  → http://your-server-ip:3001
# Orchestrator → http://your-server-ip:3000
# AI Agent  → http://your-server-ip:8000

# 6. Check logs
docker compose logs -f orchestrator
docker compose logs -f ai-agent
docker compose logs -f dashboard
```

Point a domain + Nginx reverse proxy at ports 3000 and 3001 for HTTPS.

---

### Option B — Railway (recommended for easiest cloud deploy)

Railway runs each service as a separate web service and provisions PostgreSQL automatically.

**1. Deploy the orchestrator**

```bash
# Install Railway CLI
npm install -g @railway/cli
railway login
railway init   # in the backend/ directory
railway up
```

Set environment variables in the Railway dashboard:
```
DATABASE_URL       = (auto-set by Railway PostgreSQL plugin)
JWT_SECRET         = <openssl rand -hex 32>
FIELD_ENCRYPTION_KEY = <openssl rand -hex 32>
AI_AGENT_URL       = https://your-ai-agent.up.railway.app
ALLOWED_ORIGIN     = https://your-dashboard.vercel.app
ORCHESTRATOR_URL   = https://your-orchestrator.up.railway.app
LOCAL_MODE         = false
CPU_THRESHOLD      = 80
MEM_THRESHOLD      = 90
```

**2. Deploy the AI Agent**

```bash
cd ai_agent
railway init
railway up
```

Set: `GEMINI_API_KEY=AIza...`

**3. Deploy the dashboard to Vercel** (see below)

---

### Option C — Vercel (frontend only) + Railway (backend)

This is the recommended split: Vercel for the Next.js dashboard, Railway for orchestrator + AI agent + PostgreSQL.

#### Deploy the frontend to Vercel

```bash
# Install Vercel CLI
npm install -g vercel

cd frontend
vercel

# Follow prompts:
# - Framework: Next.js (auto-detected)
# - Root directory: frontend/
```

In the **Vercel dashboard → Project → Settings → Environment Variables** add:
```
NEXT_PUBLIC_API_URL = https://your-orchestrator.up.railway.app
```

Redeploy after setting the env var:
```bash
vercel --prod
```

Your dashboard is live at `https://your-project.vercel.app`

> **Important for Vercel:** The orchestrator must have CORS set to allow the Vercel domain:
> ```
> ALLOWED_ORIGIN=https://your-project.vercel.app
> ```

#### Deploy the orchestrator to Railway

```
1. Go to https://railway.app → New Project
2. Deploy from GitHub repo → select Aakarsh2007/Aegis
3. Set root directory: backend
4. Add PostgreSQL plugin (Railway auto-sets DATABASE_URL)
5. Set all env vars listed above
6. Railway auto-deploys on every git push
```

#### Deploy the AI Agent to Railway

```
1. New service in same Railway project
2. Root directory: ai_agent
3. Set: GEMINI_API_KEY=AIza...
4. Copy the service URL → paste as AI_AGENT_URL in the orchestrator service
```

---

### Option D — Render (free tier available)

Same approach as Railway. Use `render.yaml` or deploy each service manually:

1. **Orchestrator**: Web Service → Node → `npm run build && npm start`
2. **AI Agent**: Web Service → Python → `uvicorn main:app --host 0.0.0.0 --port $PORT`
3. **Dashboard**: Static Site or Web Service → `pnpm build && pnpm start`
4. **Database**: Render PostgreSQL (free tier: 1 GB)

---

### Pointing the probe at the cloud

After deploying, run the probe on any Linux server pointing at your cloud orchestrator:

```bash
g++ main.cpp -o aegis-probe -pthread -std=c++17

./aegis-probe \
  --endpoint  https://your-orchestrator.up.railway.app \
  --api-key   YOUR_API_KEY_FROM_DASHBOARD \
  --log-file  /var/log/myapp/error.log \
  --probe-id  prod-web-1 \
  --interval  2
```

Or use environment variables:
```bash
export AEGIS_ENDPOINT=https://your-orchestrator.up.railway.app
export AEGIS_API_KEY=your_api_key
export AEGIS_LOG_FILE=/var/log/myapp/error.log
export AEGIS_PROBE_ID=prod-web-1
./aegis-probe
```

---

## 🔐 Security notes

| Feature | Implementation |
|---|---|
| Passwords | bcrypt, work factor 12 |
| Sessions | JWT HS256, HttpOnly + Secure + SameSite=Strict cookie, 24h expiry |
| API keys | 256-bit cryptographic random, unique DB index |
| GitHub/Gemini tokens | AES-256-GCM encrypted at rest in PostgreSQL |
| SQL queries | Parameterized only — no string interpolation |
| Rate limiting | 60 req/min per API key on `/metrics` |
| Security headers | helmet (CSP, HSTS, X-Frame-Options, X-Content-Type-Options) |
| Multi-tenancy | Row-level isolation — every query is scoped to `tenant_id` |

**Generating secrets:**
```bash
# JWT_SECRET and FIELD_ENCRYPTION_KEY must both be 64 hex chars (32 bytes)
openssl rand -hex 32   # run twice, use one for each
```

---

## 🛠️ Environment variables reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | — | 64-char hex secret for JWT signing |
| `FIELD_ENCRYPTION_KEY` | ✅ | — | 64-char hex key for AES-256-GCM |
| `GEMINI_API_KEY` | ✅ | — | Global fallback Gemini API key |
| `AI_AGENT_URL` | ✅ | `http://localhost:8000` | Internal URL of AI Agent |
| `ALLOWED_ORIGIN` | ✅ | `http://localhost:3001` | CORS origin for the dashboard |
| `ORCHESTRATOR_URL` | ✅ | `http://localhost:3000` | Public URL shown in install command |
| `NEXT_PUBLIC_API_URL` | ✅ | `http://localhost:3000` | API base URL used by the browser |
| `CPU_THRESHOLD` | ✗ | `80` | CPU % that triggers an incident |
| `MEM_THRESHOLD` | ✗ | `90` | RAM % that triggers an incident |
| `LOCAL_MODE` | ✗ | `false` | Bypass auth for local dev |
| `PORT` | ✗ | `3000` | Orchestrator port |

---

## 📦 Quick commands reference

```bash
# Backend
cd backend && npm run dev          # dev server
cd backend && npm run migrate      # run DB migration
cd backend && npm run build        # compile TypeScript

# AI Agent
cd ai_agent && python main.py      # start agent

# Frontend
cd frontend && pnpm dev            # dev server (port 3001)
cd frontend && pnpm build          # production build

# Probe (Linux/WSL)
g++ main.cpp -o aegis-probe -pthread -std=c++17
./aegis-probe --dry-run            # test without HTTP
./aegis-probe --help               # show all flags (--endpoint --api-key --log-file --probe-id --interval --dry-run)

# Docker (all services)
docker compose up --build          # start everything
docker compose down                # stop everything
docker compose logs -f             # stream all logs
```
