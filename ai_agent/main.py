import re
import time
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os
from dotenv import load_dotenv
from github import Github, Auth
from google import genai
from google.genai import types

load_dotenv()

GLOBAL_GEMINI_KEY = os.getenv("GEMINI_API_KEY")

SYS_INSTRUCTION = (
    "You are Aegis, an elite SRE AI. You will receive a buggy code file causing a CPU or Memory spike. "
    "Find the root cause and fix it. "
    "OUTPUT ONLY THE RAW, CORRECTED CODE. Do not include markdown formatting like ```python. "
    "Do not explain the fix. Just the raw code."
)

app = FastAPI(title="Aegis AI Agent", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST"],
    allow_headers=["Content-Type"],
)


def sanitize_gemini_output(text: str) -> str:
    """Strip leading/trailing markdown code fences from Gemini output."""
    if not text:
        return text
    # Match optional language tag after opening fence
    fence_pattern = re.compile(r'^```[a-zA-Z0-9_+-]*\n?', re.MULTILINE)
    close_pattern = re.compile(r'\n?```\s*$', re.MULTILINE)

    result = text.strip()
    # Remove leading fence
    result = fence_pattern.sub('', result, count=1)
    # Remove trailing fence
    result = close_pattern.sub('', result)
    return result.strip()


def make_gemini_client(gemini_key: str | None) -> genai.Client:
    key = gemini_key or GLOBAL_GEMINI_KEY
    if not key:
        raise ValueError("No Gemini API key available (neither per-tenant nor global)")
    return genai.Client(api_key=key)


@app.get("/")
async def health():
    return {"service": "Aegis AI Agent", "version": "2.0.0", "status": "online"}


@app.post("/remediate")
async def remediate_incident(request: Request):
    payload = await request.json()

    incident_id = payload.get("incident_id", "unknown")
    tenant_id = payload.get("tenant_id", "unknown")
    probe_id = payload.get("probe_id", "unknown")
    cpu_usage = payload.get("cpu_usage", 0)
    memory_usage = payload.get("memory_usage", 0)
    issue_type = payload.get("issue_type", "Unknown Issue")
    stack_trace = payload.get("stack_trace", "No stack trace provided.")

    # Per-tenant credentials (passed from orchestrator, decrypted)
    github_token = payload.get("github_token") or os.getenv("GITHUB_TOKEN")
    github_repo = payload.get("github_repo") or os.getenv("GITHUB_REPO")
    gemini_key = payload.get("gemini_key")

    print("=" * 60)
    print(f"🚨 AI ACTIVATED: Incident #{incident_id} | {issue_type}")
    print(f"   Tenant: {tenant_id} | Probe: {probe_id}")
    print("🐙 Initiating Dynamic GitHub Auto-Remediation...")

    # ── Step 1: Extract filename from stack trace ──────────────────────
    target_file_path = None
    try:
        client = make_gemini_client(gemini_key)
        extraction_prompt = (
            f"Analyze this server stack trace. Output ONLY the exact filename that caused the crash "
            f"(e.g., filename.py). Do not output any other text or explanation.\n\nStack Trace:\n{stack_trace}"
        )
        filename_response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=extraction_prompt,
        )
        raw_filename = filename_response.text.strip()
        # Take only the basename in case Gemini returns a path
        target_file_path = raw_filename.split("/")[-1].split("\\")[-1].strip()
        # Sanitize: remove any markdown or whitespace artifacts
        target_file_path = re.sub(r'[`\'"*]', '', target_file_path).strip()
        print(f"🎯 Target Acquired: {target_file_path}")
    except Exception as e:
        msg = f"Gemini filename extraction failed: {e}"
        print(f"❌ {msg}")
        return {"status": "error", "failed_step": "gemini_extraction", "message": msg}

    # ── Step 2: Fetch file from GitHub ────────────────────────────────
    file_content = None
    raw_code = None
    try:
        if not github_token:
            raise ValueError("No GitHub token available for this tenant")
        if not github_repo:
            raise ValueError("No GitHub repo configured for this tenant")

        auth = Auth.Token(github_token)
        g = Github(auth=auth)
        repo = g.get_repo(github_repo)

        print(f"📄 Fetching '{target_file_path}' from {github_repo}...")
        file_content = repo.get_contents(target_file_path)
        raw_code = file_content.decoded_content.decode("utf-8")
        print(f"✅ File fetched ({len(raw_code)} chars)")
    except Exception as e:
        msg = f"GitHub file fetch failed for '{target_file_path}': {e}"
        print(f"❌ {msg}")
        return {"status": "error", "failed_step": "github_fetch", "message": msg}

    # ── Step 3: Generate patch ─────────────────────────────────────────
    fixed_code = None
    try:
        client = make_gemini_client(gemini_key)
        fix_prompt = (
            f"System Report: {issue_type}. CPU is at {cpu_usage}% and Memory is at {memory_usage}%. "
            f"Fix this code that is causing the issue. Return ONLY the raw corrected code:\n\n{raw_code}"
        )
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=fix_prompt,
            config=types.GenerateContentConfig(system_instruction=SYS_INSTRUCTION),
        )
        fixed_code = sanitize_gemini_output(response.text)
        print(f"🧠 Patch generated ({len(fixed_code)} chars)")
    except Exception as e:
        msg = f"Gemini patch generation failed: {e}"
        print(f"❌ {msg}")
        return {"status": "error", "failed_step": "gemini_patch", "message": msg}

    # ── Step 4: Create branch and open PR ─────────────────────────────
    try:
        new_branch_name = f"aegis-fix-{incident_id}-{int(time.time())}"
        main_branch = repo.get_branch("main")
        repo.create_git_ref(
            ref=f"refs/heads/{new_branch_name}",
            sha=main_branch.commit.sha
        )

        repo.update_file(
            path=target_file_path,
            message=f"fix(aegis): auto-remediation of {issue_type} in {target_file_path}",
            content=fixed_code,
            sha=file_content.sha,
            branch=new_branch_name,
        )

        pr = repo.create_pull(
            title=f"🛡️ Aegis Auto-Fix: {issue_type[:60]}",
            body=(
                f"### Aegis Autonomous Remediation\n\n"
                f"**Incident ID:** `{incident_id}`  \n"
                f"**Probe:** `{probe_id}`  \n"
                f"**Issue:** {issue_type}  \n"
                f"**CPU:** {cpu_usage}% | **Memory:** {memory_usage}%  \n\n"
                f"The AI analyzed the stack trace, isolated the fault to `{target_file_path}`, "
                f"and generated this patch automatically. Please review before merging.\n\n"
                f"*Generated by [Aegis Cloud Platform](https://github.com)*"
            ),
            head=new_branch_name,
            base="main",
        )

        print(f"✅ PR opened: {pr.html_url}")
        print("=" * 60)

        return {
            "status": "success",
            "pr_url": pr.html_url,
            "branch": new_branch_name,
            "target_file": target_file_path,
            "message": "PR created successfully",
        }
    except Exception as e:
        msg = f"GitHub PR creation failed: {e}"
        print(f"❌ {msg}")
        return {"status": "error", "failed_step": "github_pr", "message": msg}


if __name__ == "__main__":
    print("🤖 Starting Aegis AI Agent on port 8000...")
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
