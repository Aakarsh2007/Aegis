from fastapi import FastAPI, Request
import uvicorn
import os
import time
from dotenv import load_dotenv
from github import Github, Auth
from google import genai
from google.genai import types

load_dotenv()

gemini_key = os.getenv("GEMINI_API_KEY")
github_token = os.getenv("GITHUB_TOKEN")
github_repo_name = os.getenv("GITHUB_REPO")

client = genai.Client(api_key=gemini_key)
sys_instruction = "You are Aegis, an elite SRE AI. You will receive a buggy code file causing a CPU or Memory spike. Find the root cause and fix it. OUTPUT ONLY THE RAW, CORRECTED CODE. Do not include markdown formatting like ```python. Do not explain the fix. Just the raw code."

app = FastAPI()

@app.post("/remediate")
async def remediate_incident(request: Request):
    payload = await request.json()
    incident_id = payload.get("incident_id")
    cpu_usage = payload.get("cpu_usage")
    memory_usage = payload.get("memory_usage")
    issue_type = payload.get("issue_type")
    stack_trace = payload.get("stack_trace", "No stack trace provided.")
    
    print("="*60)
    print(f"🚨 AI ACTIVATED: Incident #{incident_id} | {issue_type}")
    print("🐙 Initiating DYNAMIC GitHub Auto-Remediation...")

    try:
        extraction_prompt = f"Analyze this server stack trace. Output ONLY the exact filename that caused the crash (e.g., filename.py). Do not output any other text or explanation. Stack Trace:\n{stack_trace}"
        filename_response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=extraction_prompt,
        )
        target_file_path = filename_response.text.strip().split('/')[-1]
        print(f"🎯 Target Acquired! AI isolated the broken file: {target_file_path}")

        auth = Auth.Token(github_token)
        g = Github(auth=auth)
        repo = g.get_repo(github_repo_name)

        print(f"📄 Fetching {target_file_path} directly from GitHub...")
        file_content = repo.get_contents(target_file_path)
        raw_code = file_content.decoded_content.decode('utf-8')

        print(f"🧠 Gemini is analyzing {target_file_path} for the {issue_type}...")
        fix_prompt = f"System Report: {issue_type}. CPU is at {cpu_usage}% and Memory is at {memory_usage}%. Fix this code that is causing the issue. Return ONLY the raw code:\n\n{raw_code}"
        
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=fix_prompt,
            config=types.GenerateContentConfig(
                system_instruction=sys_instruction,
            ),
        )
        
        fixed_code = response.text.strip()
        if fixed_code.startswith("```"):
            fixed_code = "\n".join(fixed_code.split("\n")[1:-1])

        print("🛠️ Patch generated! Creating branch and pushing to GitHub...")

        main_branch = repo.get_branch("main")
        new_branch_name = f"aegis-dynamic-fix-{int(time.time())}"
        repo.create_git_ref(ref=f"refs/heads/{new_branch_name}", sha=main_branch.commit.sha)

        repo.update_file(
            path=target_file_path,
            message=f"fix(aegis): dynamic auto-resolution of {issue_type} in {target_file_path}",
            content=fixed_code,
            sha=file_content.sha,
            branch=new_branch_name
        )

        pr = repo.create_pull(
            title=f"🚨 Aegis Auto-Remediation: Dynamic Patch for {target_file_path}",
            body=f"### Automated Dynamic AI Fix\nAegis detected a {issue_type}. The AI analyzed the server stack trace and isolated the failure to `{target_file_path}`.\n\nThis PR contains the AI-generated patch.",
            head=new_branch_name,
            base="main"
        )

        print(f"✅ SUCCESS! Dynamic Pull Request Opened: {pr.html_url}")
        print("="*60)

        return {"status": "success", "message": "PR created successfully", "pr_url": pr.html_url}

    except Exception as e:
        print(f"❌ DYNAMIC Remediation Failed: {e}")
        return {"status": "error", "message": str(e)}

if __name__ == "__main__":
    print("Starting AI Agent on Port 8000...")
    uvicorn.run(app, host="0.0.0.0", port=8000)
    