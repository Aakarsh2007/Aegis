# Aegis

Autonomous Site Reliability Engineering platform that finds bugs in your code and opens GitHub Pull Requests with AI-generated fixes — before a crash ever happens.

[![Next.js 15](https://img.shields.io/badge/Next.js-15.3-000?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6?logo=typescript)](https://typescriptlang.org)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle-ORM-c5f74f)](https://orm.drizzle.team)
[![Vercel](https://img.shields.io/badge/Deployed_on-Vercel-000?logo=vercel)](https://vercel.com)
[![Neon](https://img.shields.io/badge/Database-Neon_PostgreSQL-00e599)](https://neon.tech)

**Live:** [aegis-ai-sre.vercel.app](https://aegis-ai-sre.vercel.app)

---

## What it does

Aegis operates in two modes:

| Mode | Trigger | What happens |
|---|---|---|
| **Proactive AI Scan** | You click "Scan" on any connected repo | Fetches source files → Gemini selects suspicious files → analyzes each one → creates incidents for bugs found → auto-opens PRs for critical issues |
| **Live Crash Detection** | C++ probe detects anomaly on your server | Probe reads `/proc/stat`, `/proc/meminfo`, tails your log file → sends telemetry to Aegis → AI identifies the broken file from the stack trace → generates a patch → opens a PR |

Both modes end the same way: a GitHub Pull Request with a fix, ready for your review.

---

## Architecture

```
┌──────────────┐     ┌─────────────────────────────────────────────────────┐
│   Browser    │────▶│  Next.js 15 App Router (Vercel, Edge + Serverless) │
└──────────────┘     │                                                     │
                     │  /api/auth/*              Better Auth sessions      │
                     │  /api/repositories/[id]/scan   AI repo scanner      │
                     │  /api/incidents           Incident lifecycle         │
                     │  /api/remediations        AI patch approval          │
                     │  /api/probes              Probe management           │
                     │  /api/webhooks/probe      C++ probe ingestion        │
                     │  /api/settings            User configuration         │
                     └──────────────┬──────────────────────────────────────┘
                                    │
                     ┌──────────────▼──────────────┐
                     │  Neon PostgreSQL (Drizzle)   │
                     └──────────────┬──────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                                           │
   ┌──────────▼──────────┐                   ┌────────────▼───────────┐
   │  Google Gemini 2.5   │                   │  GitHub API (Octokit)  │
   │  Flash               │                   │  fetch → branch → PR   │
   │  (analysis + patch)  │                   └────────────────────────┘
   └─────────────────────┘

   [Optional — Linux/WSL]
   C++ Probe → POST /api/webhooks/probe (Bearer API key auth)
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router, React 19) |
| Language | TypeScript 5.7 |
| Database | Neon PostgreSQL via Drizzle ORM |
| Authentication | Better Auth (email/password + GitHub OAuth) |
| AI Engine | Google Gemini 2.5 Flash |
| GitHub Integration | Octokit REST API |
| UI | Tailwind CSS, Radix UI, Lucide Icons, Recharts |
| Deployment | Vercel (serverless functions) |
| Edge Probe | C++ (single binary, reads `/proc`, tails logs) |

---

## Getting Started

### Prerequisites

- Node.js 18+
- [pnpm](https://pnpm.io)
- A [Neon](https://neon.tech) PostgreSQL database
- A [GitHub OAuth App](https://github.com/settings/applications/new)
- A [Gemini API key](https://aistudio.google.com/apikey)

### Local Development

```bash
git clone https://github.com/Aakarsh2007/Aegis.git
cd Aegis/aegis-app
pnpm install

# Configure environment
cp .env.example .env.local
# Fill in DATABASE_URL, BETTER_AUTH_SECRET, GITHUB_CLIENT_ID, etc.

pnpm dev
# → http://localhost:3000
```

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Neon PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | Yes | Session signing secret (64 hex chars: `openssl rand -hex 32`) |
| `FIELD_ENCRYPTION_KEY` | Yes | AES-256 key for encrypting stored tokens (64 hex chars) |
| `NEXT_PUBLIC_APP_URL` | Yes | Your deployment URL, no trailing slash |
| `BETTER_AUTH_TRUSTED_ORIGINS` | Yes | Same as `NEXT_PUBLIC_APP_URL` |
| `GITHUB_CLIENT_ID` | Yes | From your GitHub OAuth App |
| `GITHUB_CLIENT_SECRET` | Yes | From your GitHub OAuth App |
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `GITHUB_APP_ID` | No | For GitHub App installations |
| `GITHUB_APP_PRIVATE_KEY` | No | PEM key for GitHub App |
| `CPU_THRESHOLD` | No | CPU % that triggers an incident (default: 80) |
| `MEM_THRESHOLD` | No | RAM % that triggers an incident (default: 90) |

---

## GitHub OAuth Setup

1. Go to [github.com/settings/applications/new](https://github.com/settings/applications/new)
2. Set **Homepage URL** to your deployment URL (e.g. `https://aegis-ai-sre.vercel.app`)
3. Set **Authorization callback URL** to `https://aegis-ai-sre.vercel.app/api/auth/callback/github`
4. Copy **Client ID** and **Client Secret** into your environment variables

> The callback URL must exactly match `{NEXT_PUBLIC_APP_URL}/api/auth/callback/github`. Any mismatch will cause a `redirect_uri is not associated` error.

---

## Deploying to Vercel

1. Push this repo to GitHub
2. Import the project in [Vercel](https://vercel.com/new)
3. Set the **Root Directory** to `aegis-app`
4. Add all environment variables in Vercel → Settings → Environment Variables
5. Deploy — tables are created automatically on first request

---

## Core Features

### Proactive AI Repository Scanner

Connect any GitHub repository and click **Scan**. Aegis:

1. Fetches the file tree via GitHub API
2. Sends the file list to Gemini, which selects up to 10 suspicious files
3. Downloads and analyzes each file for bugs, memory leaks, security vulnerabilities
4. Creates an **Incident** for every real issue found
5. For critical issues with confidence > 65%, automatically generates a patch and opens a PR

No probe, no crash, no server required.

### Live Crash Detection (C++ Probe)

Compile and run the C++ probe on any Linux server:

```bash
g++ main.cpp -o aegis-probe -pthread -std=c++17
./aegis-probe \
  --endpoint  https://aegis-ai-sre.vercel.app \
  --api-key   aegis_YOUR_KEY_HERE \
  --log-file  /var/log/app/error.log \
  --probe-id  web-server-prod \
  --interval  5
```

The probe monitors CPU, memory, disk, and your application log file. When it detects:

- CPU > threshold or memory > threshold
- A crash/exception in the log file

It sends the telemetry to Aegis, which triggers the full AI remediation pipeline.

### Incident Lifecycle

Every issue moves through a clear pipeline:

```
Open → Analyzing → Resolved (PR opened)
                  → Failed (patch generation failed)
```

Each incident shows:

- Stack trace (if crash-triggered)
- Timeline of all status changes
- AI confidence score
- Affected file and explanation
- Code diff of the proposed fix
- Direct link to the GitHub PR

### Settings & Integrations

- **GitHub Token / App Installation** — for repo access and PR creation
- **Gemini API Key** — override the global key with your own
- **Slack & Discord Webhooks** — get alerts when incidents are created
- **API Key Management** — create, rotate, and revoke probe API keys

---

## Project Structure

```
Aegis/
├── aegis-app/                 Next.js application
│   ├── app/
│   │   ├── (auth)/            Login, Register pages
│   │   ├── (dashboard)/       Dashboard, Incidents, Repositories, Probes, Settings
│   │   └── api/               All API routes
│   ├── components/
│   │   ├── dashboard/         Incident cards, telemetry charts
│   │   ├── layout/            Sidebar, help dialog
│   │   └── ui/                Reusable UI primitives (shadcn/ui)
│   └── lib/
│       ├── auth.ts            Better Auth configuration
│       ├── auth-client.ts     Client-side auth helpers
│       ├── repo-scanner.ts    Proactive AI scanner
│       ├── remediation.ts     Crash-triggered AI pipeline
│       ├── gemini.ts          Gemini AI client
│       ├── github.ts          Octokit GitHub utilities
│       ├── crypto.ts          AES-256-GCM encryption
│       ├── db/                Drizzle ORM schema + connection
│       └── validations.ts     Zod schemas for API input
│
├── main.cpp                   C++ edge monitoring probe
├── httplib.h                  HTTP client library (cpp-httplib)
└── docker-compose.yml         Local PostgreSQL for development
```

---

## Security

| Measure | Implementation |
|---|---|
| Password hashing | bcrypt via Better Auth |
| Session management | HttpOnly cookie, 7-day TTL, `sameSite: lax` |
| API key storage | SHA-256 hashed, never stored in plaintext |
| Token encryption | AES-256-GCM for GitHub/Gemini keys at rest |
| SQL injection | Drizzle ORM parameterized queries |
| Multi-tenancy | `userId` enforced on every database query |
| CSRF protection | Origin validation via Better Auth trusted origins |

---

## Troubleshooting

**GitHub login shows "redirect_uri is not associated"**

Your GitHub OAuth App's callback URL doesn't match `{NEXT_PUBLIC_APP_URL}/api/auth/callback/github`. Update one of them so they match exactly, then redeploy.

**"Invalid origin" on login**

Set `BETTER_AUTH_TRUSTED_ORIGINS` in your environment to match `NEXT_PUBLIC_APP_URL` exactly. Redeploy after changing.

**Scan finds no source files**

Verify your GitHub token has `repo` scope and the branch name matches the repository's default branch.

**Probe not showing online**

Ensure `--endpoint` points to your Vercel URL (not `localhost`) and the API key matches the one created in the Probes page.

**PR not being created**

The GitHub token needs write access (`repo` scope). For AI scans, the scanner auto-creates PRs for critical issues with confidence > 65%.

---

## License

MIT
