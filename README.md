# 🛡️ Aegis: Autonomous SRE & Auto-Remediation Engine

![Architecture: Microservices](https://img.shields.io/badge/Architecture-Microservices-blue)
![AI: Google Gemini](https://img.shields.io/badge/AI-Google_Gemini-purple)
![Status: Autonomous](https://img.shields.io/badge/Status-Autonomous-success)

**Aegis** is a headless, self-healing distributed system that automatically detects server crashes, isolates the root cause, and deploys AI-generated code patches via GitHub Pull Requests—all without human intervention. 

Instead of waking up developers at 3:00 AM for a server outage, Aegis detects the fatal exception, writes the fix, and has the PR waiting for review by morning.

---

## 🧠 The Architecture

Aegis is built on a 4-part microservice architecture, separating the edge telemetry, central orchestration, AI processing, and frontend visualization.



### 1. The Edge Probe (C++)
A hyper-efficient, multithreaded daemon running on the host machine. 
* Polls real-time hardware telemetry (CPU/RAM) directly from the Linux Kernel (`/proc/stat`, `/proc/meminfo`).
* Acts as an asynchronous **Log Tailer**, watching server standard error streams.
* Automatically escapes strings, truncates logs to prevent infinite loops, and fires HTTP POST webhooks to the Orchestrator upon detecting a fatal crash.

### 2. The Orchestrator (Node.js / Express / TypeScript)
The central nervous system of Aegis.
* Exposes RESTful API endpoints to ingest massive telemetry payloads.
* Manages state and incident lifecycles using a **PostgreSQL** relational database.
* Evaluates dynamic tripwires and dispatches asynchronous commands to the AI Agent when a crash is verified.

### 3. The Auto-Remediation Agent (Python / Gemini / GitHub)
The brain of the operation.
* Wakes up via local HTTP triggers and ingests the raw, sanitized stack trace.
* Leverages the **Google Gemini Pro** model to dynamically hunt down the exact file causing the crash.
* Uses the **PyGithub** SDK to directly fetch the buggy file from the repository, generate a secure patch, create a new Git branch, and open a live Pull Request.

### 4. The Command Center (HTML5 / Chart.js / Tailwind CSS)
A dark-mode, enterprise-grade SRE dashboard.
* Uses asynchronous JavaScript `fetch()` polling to pull live metrics from the Node.js API.
* Renders real-time hardware graphs via Chart.js.
* Displays a live Incident Feed that dynamically updates from "Analyzing..." to "Resolved" with a clickable link straight to the AI's GitHub PR.

---

## 🛠️ Tech Stack

* **Edge/Systems:** C++, Linux I/O
* **Backend:** Node.js, Express, TypeScript, Python, FastAPI
* **Database:** PostgreSQL (`pg`)
* **AI & Integrations:** Google Gemini API, GitHub API (PyGithub)
* **Frontend:** HTML5, Tailwind CSS, Chart.js

---

## 🚀 Live Demonstration Flow

1. **Normal State:** The C++ probe silently tracks hardware; UI shows stable telemetry.
2. **The Crash:** A target application (e.g., `buggy_service.py`) throws a `RuntimeError` or triggers an infinite loop.
3. **Detection:** The Linux OS writes to `stderr`. The C++ probe reads it, elevates the alert status, and fires the payload.
4. **Processing:** Node.js logs the incident to PostgreSQL and pages the Python Agent.
5. **Resolution:** The AI reads the stack trace, rewrites the buggy code, and pushes a PR. The Frontend UI dynamically generates a `🔗 VIEW AI PATCH` button for the user.

---

## ⚙️ Local Setup

To run the complete system locally:

1. **Database:** Initialize a PostgreSQL database named `aegis_db` with `incidents` and `system_metrics` tables.
2. **Environment Variables:** Set up your `.env` files with your `GEMINI_API_KEY`, `GITHUB_TOKEN`, and `DATABASE_URL`.
3. **Boot Sequence:**
   * Terminal 1 (Node.js): `cd backend && npm run dev`
   * Terminal 2 (Python): `cd ai_agent && source .venv/bin/activate && python main.py`
   * Terminal 3 (Probe): `cd root && g++ main.cpp -o probe -pthread && ./probe`
4. **View Dashboard:** Open `frontend/index.html` in any modern browser.