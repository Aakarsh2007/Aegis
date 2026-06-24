<div align="center">
  
# 🛡️ Aegis

**Autonomous Site Reliability Engineering Platform**

[![Next.js 15](https://img.shields.io/badge/Next.js-15.3-000?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6?style=for-the-badge&logo=typescript)](https://typescriptlang.org)
[![Neon](https://img.shields.io/badge/Database-Neon_PostgreSQL-00e599?style=for-the-badge&logo=postgresql)](https://neon.tech)
[![Gemini](https://img.shields.io/badge/AI-Google_Gemini-4285F4?style=for-the-badge&logo=google)](https://deepmind.google/technologies/gemini/)

*Aegis finds bugs, memory leaks, and security vulnerabilities in your codebase, analyzes them, and automatically opens GitHub Pull Requests with AI-generated fixes — before a crash ever happens.*

</div>

---

## ✨ Overview

Aegis acts as your autonomous SRE and AI engineer. Instead of waiting for users to report bugs or monitoring static logs, Aegis proactively scans your code, understands the business logic using Google's Gemini 2.5 Flash, and automatically commits fixes to your repository. 

### Core Modes
- **🔍 Proactive AI Scanner**: Connect your GitHub repository and click "Scan". Aegis will fetch your source code, identify vulnerabilities or performance bottlenecks, and automatically open a PR with the patch. No servers or probes required.
- **⚡ Live Crash Detection**: Run the lightweight Aegis C++ Probe on your Linux server. It monitors CPU, memory, and application logs in real-time. The moment your app crashes, the probe sends the stack trace to Aegis, which instantly generates a patch and opens a PR.

---

## 🚀 Quick Start

Deploying your own Aegis platform takes less than 5 minutes.

### 1. Prerequisites
You will need:
- A [Neon](https://neon.tech) PostgreSQL Database URL
- A [Google Gemini API Key](https://aistudio.google.com/apikey)
- A GitHub Personal Access Token (with `repo` scope)

### 2. One-Click Deploy
Aegis is designed to run serverlessly on Vercel. 

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FAakarsh2007%2FAegis%2Ftree%2Fmain%2Faegis-app)

During deployment, Vercel will ask for the following Environment Variables:

| Variable | Description |
|---|---|
| `DATABASE_URL` | Your Neon PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | 64-character random hex string (`openssl rand -hex 32`) |
| `FIELD_ENCRYPTION_KEY` | 64-character random hex string for securing API keys at rest |
| `NEXT_PUBLIC_APP_URL` | Your Vercel production URL (e.g., `https://aegis.vercel.app`) |
| `BETTER_AUTH_TRUSTED_ORIGINS`| Same as `NEXT_PUBLIC_APP_URL` |
| `GEMINI_API_KEY` | Your Google AI Studio API Key |

*Note: Database tables are automatically migrated and created on your first login.*

### 3. Start Scanning
1. Go to your deployed Aegis URL and create an account.
2. Navigate to **Settings** and securely input your GitHub Personal Access Token.
3. Go to **Repositories**, click **Connect Repo**, and enter your GitHub username and repository name.
4. Click **Scan for issues**.
5. Aegis will run in the background. Navigate to **Incidents** to watch issues populate and PRs automatically get created in your GitHub!

---

## 🏗️ Tech Stack

Aegis is built with a modern, edge-ready architecture to ensure zero maintenance and maximum speed.

- **Frontend**: Next.js 15 App Router, React 19, Tailwind CSS, shadcn/ui
- **Backend**: Next.js Serverless Functions, Vercel Edge Runtime
- **Database**: PostgreSQL (Neon Serverless) + Drizzle ORM
- **Authentication**: Better Auth (Email/Password)
- **AI Engine**: Google Gemini 2.5 Flash
- **Integrations**: GitHub Octokit REST API
- **Live Probe**: C++17 (compiled as a single standalone binary)

---

## 🔒 Security First

Aegis handles sensitive source code and production API keys. We designed it with zero-trust principles:
- **AES-256-GCM Encryption**: All GitHub tokens and Gemini API keys are heavily encrypted at rest in the database using your `FIELD_ENCRYPTION_KEY`.
- **Stateless Analysis**: Code is analyzed in ephemeral serverless functions. It is never stored permanently unless it is attached to an incident report as a `diff`.
- **Multi-tenant Architecture**: Every database query is strictly scoped to the `userId` to prevent data leakage between workspaces.

---

## 📜 License

This project is licensed under the MIT License.
