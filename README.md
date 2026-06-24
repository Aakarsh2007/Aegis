# 🛡️ Aegis — Autonomous SRE Platform v3

![Next.js](https://img.shields.io/badge/Next.js_15.3-Full_Stack-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript)
![Drizzle](https://img.shields.io/badge/Drizzle_ORM-PostgreSQL-green)
![Better Auth](https://img.shields.io/badge/Better_Auth-Sessions-purple)
![Vercel](https://img.shields.io/badge/Deploy-Vercel_%2B_Neon-black?logo=vercel)

**Aegis** autonomously finds bugs in your code and opens GitHub Pull Requests with AI-generated fixes.

Two ways it works:
1. **Proactive AI Scan** — connect a repo and click Scan. No probe, no crash needed.
2. **Live crash detection** — run the C++ probe on a Linux server. It watches logs and triggers AI remediation when a crash happens.

---

## 🏗️ Architecture

```
Browser  ──────────────────►  Next.js App (Vercel)
                                ├── /api/auth            Better Auth sessions
                                ├── /api/webhooks/probe  C++ probe ingestion
                                ├── /api/repositories/[id]/scan  AI repo scanner
                                ├── /api/incidents       Incident CRUD
                                ├── /api/probes          Probe management
                                ├── /api/settings        User settings
                                └── /api/v1/*            Backward compat
                                      │
                             Neon PostgreSQL (Drizzle ORM)
                                      │
                             Google Gemini 2.5 Flash
                             (AI analysis + patch gen)
                                      │
                             GitHub API (Octokit)
                             (fetch file → create branch → open PR)

[Optional — Linux/WSL only]
C++ Probe  →  POST /api/webhooks/probe  (Bearer API key)
              Reads /proc/stat, /proc/meminfo, disk, tails log file
              Sends telemetry every 5s, heartbeat every 60s
              Retries with exponential backoff if server is down
```

---

## ⚙️ Vercel Environment Variables

**CRITICAL — set all of these in Vercel → Settings → Environment Variables:**

| Variable | Value | How to get |
|---|---|---|
| `DATABASE_URL` | `postgresql://...` | Neon dashboard → Connection Details |
| `BETTER_AUTH_SECRET` | 64-char hex | `openssl rand -hex 32` |
| `BETTER_AUTH_TRUSTED_ORIGINS` | `https://aegis-ai-sre.vercel.app` | Must match your deployment URL exactly |
| `FIELD_ENCRYPTION_KEY` | 64-char hex | `openssl rand -hex 32` |
| `NEXT_PUBLIC_APP_URL` | `https://aegis-ai-sre.vercel.app` | Your Vercel deployment URL (no trailing slash) |
| `GITHUB_CLIENT_ID` | From GitHub OAuth App | See GitHub setup below |
| `GITHUB_CLIENT_SECRET` | From GitHub OAuth App | See GitHub setup below |
| `GEMINI_API_KEY` | `AIza...` | https://aistudio.google.com/apikey |
| `CPU_THRESHOLD` | `80` | CPU % that triggers incident |
| `MEM_THRESHOLD` | `90` | RAM % that triggers incident |

**The most common cause of "invalid origin" errors:**
- `NEXT_PUBLIC_APP_URL` is wrong or has a trailing slash
- `BETTER_AUTH_TRUSTED_ORIGINS` is not set
- After changing either value, redeploy Vercel

---

## 🔧 GitHub OAuth App setup

1. Go to https://github.com/settings/applications/new
2. Fill in:
   - Application name: `Aegis`
   - Homepage URL: `https://aegis-ai-sre.vercel.app`
   - Authorization callback URL: `https://aegis-ai-sre.vercel.app/api/auth/callback/github`
3. Click Register → Copy **Client ID** and **Client Secret** → paste into Vercel env vars

---

## 🗄️ Database setup (Neon)

1. Go to https://neon.tech → Create account → New project
2. Copy the connection string (looks like `postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require`)
3. Paste as `DATABASE_URL` in Vercel
4. Tables are created automatically on first request

---

## 🚀 How Aegis works (both modes explained)

### Mode 1: Proactive AI Repository Scanner (no probe needed)

```
You connect a repo → Click "Scan" → Aegis:
  1. Fetches your file tree from GitHub
  2. Sends file list to Gemini → picks suspicious files
  3. Sends each file to Gemini → looks for bugs, memory leaks, security issues
  4. Creates an Incident for each finding
  5. For critical issues (confidence > 65%): auto-generates patch + opens PR
```

This works entirely from the browser. No Linux server needed.

### Mode 2: Live crash detection via C++ Probe (Linux/WSL)

```
Your server runs → C++ Probe watches:
  - /proc/stat (CPU every 5s)
  - /proc/meminfo (RAM every 5s)
  - /proc disk stats
  - A log file you specify (e.g. /var/log/app/error.log)

When CPU > 80% or RAM > 90% or a crash appears in the log:
  → Probe POSTs to /api/webhooks/probe with stack trace
  → Aegis creates an Incident
  → Gemini identifies the broken file from the stack trace
  → Gemini generates a patch
  → GitHub PR opened automatically
```

---

## 📋 Complete testing guide (step by step)

### Step 1 — Vercel env vars (do this first)

In Vercel dashboard → your project → Settings → Environment Variables:

```
NEXT_PUBLIC_APP_URL          = https://aegis-ai-sre.vercel.app
BETTER_AUTH_TRUSTED_ORIGINS  = https://aegis-ai-sre.vercel.app
BETTER_AUTH_SECRET           = <run: openssl rand -hex 32>
FIELD_ENCRYPTION_KEY         = <run: openssl rand -hex 32>
DATABASE_URL                 = <from Neon>
GITHUB_CLIENT_ID             = <from GitHub OAuth App>
GITHUB_CLIENT_SECRET         = <from GitHub OAuth App>
GEMINI_API_KEY               = <from aistudio.google.com>
```

Redeploy after setting these.

---

### Step 2 — Create an account

1. Go to https://aegis-ai-sre.vercel.app
2. Click "Create one"
3. Fill: name, email, password (min 8 chars)
4. Click "Create account"
5. ✅ You should land on `/onboarding`

---

### Step 3 — Test login (the previously broken flow)

1. Click "Sign out" (bottom of sidebar)
2. Go to `/login`
3. Enter your email + password
4. Click "Sign in"
5. ✅ Should redirect to `/dashboard` — no "invalid origin" error

---

### Step 4 — Test GitHub login

1. Sign out → go to `/login`
2. Click "Continue with GitHub"
3. Authorize on GitHub
4. ✅ Redirects back to `/dashboard` or `/onboarding`

Note: For GitHub login to work, make sure your GitHub OAuth App callback URL is exactly:
`https://aegis-ai-sre.vercel.app/api/auth/callback/github`

---

### Step 5 — Add your GitHub token (required for AI features)

1. Go to `/settings`
2. Under "GitHub Integration", paste your Personal Access Token
   - Get one at: https://github.com/settings/tokens/new
   - Select scopes: `repo` (full control of private repos)
3. Click "Save settings"
4. ✅ Badge shows "Connected"

---

### Step 6 — Test Mode 1: Proactive AI Repository Scanner

**This is the core feature — no probe, no crash needed.**

1. Go to `/repositories`
2. Click "Connect repo"
3. Enter:
   - Owner: `your-github-username` (or any public repo you have write access to)
   - Repo: `your-repo-name`
   - Branch: `main`
4. Click "Connect"
5. Now click **"Scan for issues"** on the repo card
6. Wait 30-60 seconds (Gemini is analyzing your code)
7. ✅ The button shows "Scanned X files — Y issues found"
8. Go to `/incidents` → ✅ You see new incidents with `[AI Scan]` prefix
9. Click any incident → ✅ Shows confidence score, affected file, AI explanation
10. If severity is critical + confidence > 65%: ✅ A GitHub PR was opened automatically

**To test with the demo buggy file in this repo:**
1. Connect the `Aakarsh2007/Aegis` repo itself
2. Click Scan — Gemini will find the intentional bug in `buggy_service.py`
3. Watch the incident + PR get created

---

### Step 7 — Test Mode 2: Live crash detection with C++ Probe (Linux/WSL required)

First create a probe and get an API key:
1. Go to `/probes` → "Create probe" → name it `test-server`
2. ✅ A dialog shows your API key — **copy it now**

Then in WSL/Linux terminal (from the repo root):

```bash
# Compile the probe (one time only)
g++ main.cpp -o aegis-probe -pthread -std=c++17

# Test dry-run — prints telemetry to terminal, no HTTP
./aegis-probe --dry-run

# Run for real, pointing at your deployed Vercel app
./aegis-probe \
  --endpoint  https://aegis-ai-sre.vercel.app \
  --api-key   aegis_YOUR_API_KEY_HERE \
  --log-file  real_server_error.log \
  --probe-id  test-server \
  --interval  5
```

Check the dashboard:
- ✅ Probe shows as **Online** within 10 seconds
- ✅ Telemetry chart shows CPU and RAM data

**Trigger a crash:**

```bash
# In a separate WSL terminal — runs the demo buggy service
# It crashes on batch 5 and writes to real_server_error.log
python3 buggy_service.py 2>> real_server_error.log
```

Watch the dashboard:
- ✅ New incident appears: **Open** → **Analyzing** → **Resolved**
- ✅ AI identifies `buggy_service.py` from the stack trace
- ✅ Gemini generates a patch
- ✅ GitHub PR opened — click **VIEW AI PATCH**

---

### Step 8 — View incident details

1. Go to `/incidents`
2. Click "Details →" on any incident
3. ✅ You see:
   - Stack trace (if crash-triggered)
   - Timeline: each status change with timestamp
   - AI panel: confidence score bar, affected file, explanation, rollback notes
   - "View AI Patch" button → opens the GitHub PR

---

### Step 9 — Settings (optional features)

1. Go to `/settings`
2. Add **Slack webhook** — paste `https://hooks.slack.com/services/...`
3. Add **Discord webhook** — paste `https://discord.com/api/webhooks/...`
4. ✅ Next incident will post alerts to both
5. **Rotate API key** — click Rotate on an existing key → old key is immediately revoked
6. **New API key** — click "+ New key" → name it → copy the new key

---

## 🖥️ Local development setup

```bash
git clone https://github.com/Aakarsh2007/Aegis.git
cd Aegis/aegis-app

pnpm install

# Copy and fill env vars
cp .env.example .env.local
# Edit .env.local with your Neon URL, secrets, GitHub OAuth, Gemini key

# Start dev server
pnpm dev
# → http://localhost:3000

# In a separate terminal: run the probe locally
cd ..
g++ main.cpp -o aegis-probe -pthread -std=c++17
./aegis-probe --api-key YOUR_KEY --log-file real_server_error.log
```

For local mode (no auth required on probe):
```bash
# Set LOCAL_MODE=true in .env.local
# Then probe works without an API key
./aegis-probe --log-file real_server_error.log
```

---

## 📦 Project structure

```
Aegis/
├── aegis-app/              ← v3 unified Next.js app (USE THIS)
│   ├── app/
│   │   ├── (auth)/         Login, Register
│   │   ├── (dashboard)/    Dashboard, Incidents, Repos, Probes, Settings
│   │   └── api/            All API routes
│   ├── components/         UI components (shadcn/ui)
│   ├── lib/
│   │   ├── auth.ts         Better Auth config
│   │   ├── repo-scanner.ts Proactive AI scanner
│   │   ├── remediation.ts  Crash-triggered AI pipeline
│   │   ├── gemini.ts       Gemini AI client
│   │   ├── github.ts       Octokit GitHub client
│   │   └── db/             Drizzle ORM schema + client
│   └── vercel.json
│
├── main.cpp                C++ edge probe (Linux/WSL)
├── buggy_service.py        Demo crash target for testing
└── backend/ ai_agent/ frontend/  ← v2 legacy (kept for reference)
```

---

## 🔐 Security

- Passwords: bcrypt via Better Auth
- Sessions: HttpOnly cookie, 7-day expiry, `sameSite: lax`
- API keys: SHA-256 hashed, never stored plaintext
- GitHub/Gemini tokens: AES-256-GCM encrypted at rest
- All SQL: Drizzle parameterized queries
- Multi-tenancy: `userId` on every DB query

---

## ❓ Common issues

**"Invalid origin" on login:**
→ Set `BETTER_AUTH_TRUSTED_ORIGINS=https://your-app.vercel.app` in Vercel env vars
→ Set `NEXT_PUBLIC_APP_URL=https://your-app.vercel.app` (no trailing slash)
→ Redeploy

**"No source files found" during scan:**
→ Make sure your GitHub token has `repo` scope
→ Check the branch name matches (default: `main`)

**Probe not showing online:**
→ Make sure `--endpoint` points to your Vercel URL, not localhost
→ Check the API key matches the one created in `/probes`

**PR not being opened:**
→ GitHub token needs `repo` write access
→ Set a default repository in `/repositories`
