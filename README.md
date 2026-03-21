# 🛡️ Aegis: Autonomous SRE & Auto-Remediation Engine

![Architecture: Microservices](https://img.shields.io/badge/Architecture-Microservices-blue)
![AI: Google Gemini](https://img.shields.io/badge/AI-Google_Gemini-purple)
![Status: Autonomous](https://img.shields.io/badge/Status-Autonomous-success)

**Aegis** is a headless, self-healing distributed system that automatically detects server crashes, isolates the root cause, and deploys AI-generated code patches via GitHub Pull Requests—all without human intervention. 

Instead of waking up developers at 3:00 AM for a server outage, Aegis detects the fatal exception, writes the fix, and has the PR waiting for review by morning.

---

## ✨ Why Aegis?

Traditional APM tools (like Datadog or New Relic) only *tell* you that your server is burning. Aegis actually puts out the fire. 

* **Zero-Touch Remediation:** You sleep. Aegis fixes the code.
* **Edge-First Telemetry:** No heavy cloud agents. A lightweight C++ daemon runs locally to monitor hardware and tail logs.
* **Human-in-the-Loop Failsafe:** Aegis doesn't force-push to production. It opens a clean, documented Pull Request for your engineering team to merge.
* **No Vendor Lock-in:** Run the orchestrator locally or on your own VPC. 

---

## 🔌 Integrations

Aegis connects the deepest parts of your operating system to modern AI and version control:
* **Linux OS:** Native kernel telemetry (`/proc/stat`, `/proc/meminfo`)
* **Google Gemini Pro:** Advanced stack-trace analysis and code generation
* **GitHub API:** Automated branch creation and PR management
* **PostgreSQL:** Persistent incident tracking and metric storage
* **Chart.js & Tailwind:** Real-time, dark-mode visual command center

---

## 🧠 The Microservice Architecture

Aegis separates edge telemetry, central orchestration, AI processing, and frontend visualization into four distinct services to ensure enterprise-grade scalability.

### 1. The Edge Probe (C++)
A hyper-efficient, multithreaded daemon running on the host machine. 
* Polls real-time hardware telemetry directly from the Linux Kernel.
* Acts as an asynchronous **Log Tailer**, watching server `stderr` streams.
* Automatically escapes strings, truncates logs to prevent infinite loops, and fires HTTP POST webhooks upon detecting a crash.

### 2. The Orchestrator (Node.js / Express / TypeScript)
The central nervous system.
* Exposes RESTful API endpoints to ingest massive telemetry payloads.
* Manages state and incident lifecycles using a **PostgreSQL** relational database.
* Evaluates dynamic tripwires and dispatches asynchronous commands to the AI Agent.

### 3. The Auto-Remediation Agent (Python / Gemini)
The autonomous brain.
* Wakes up via local HTTP triggers and ingests the raw, sanitized stack trace.
* Leverages **Google Gemini Pro** to dynamically hunt down the exact buggy file.
* Uses the **PyGithub** SDK to directly fetch the file, generate a secure patch, create a new branch, and open a live Pull Request.

### 4. The Command Center (HTML5 / Tailwind)
A dark-mode, SRE dashboard.
* Uses asynchronous JavaScript `fetch()` polling to pull live metrics.
* Renders real-time hardware graphs via Chart.js.
* Displays a live Incident Feed that dynamically updates from "Analyzing..." to "Resolved" with a direct link to the AI's patch.

---

## 🚀 Live Demonstration Flow

1. **Normal State:** The C++ probe silently tracks hardware; UI shows stable telemetry.
2. **The Crash:** A target application throws a fatal exception.
3. **Detection:** The Linux OS writes to `stderr`. The C++ probe reads it, elevates the alert status, and fires the payload.
4. **Processing:** Node.js logs the incident to PostgreSQL and pages the Python Agent.
5. **Resolution:** The AI rewrites the buggy code and pushes a PR. The Frontend UI dynamically generates a `🔗 VIEW AI PATCH` button.

---

## ⚙️ Local Setup

To run the complete system locally:

1. **Database:** Initialize a PostgreSQL database named `aegis_db` with `incidents` and `system_metrics` tables.
2. **Environment Variables:** Set up your `.env` files with your `GEMINI_API_KEY`, `GITHUB_TOKEN`, and `DATABASE_URL`.
3. **Boot Sequence:**
   * **Terminal 1 (Node.js):** `cd backend && npm run dev`
   * **Terminal 2 (Python):** `cd ai_agent && source .venv/bin/activate && python main.py`
   * **Terminal 3 (Probe):** `cd root && g++ main.cpp -o probe -pthread && ./probe`
4. **View Dashboard:** Open `frontend/index.html` in any modern browser.