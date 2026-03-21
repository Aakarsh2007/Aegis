from fastapi import FastAPI, Request
import uvicorn
import os
import time
from dotenv import load_dotenv
import google.generativeai as genai
from github import Github

load_dotenv()

gemini_key = os.getenv("GEMINI_API_KEY")
github_token = os.getenv("GITHUB_TOKEN")
github_repo_name = os.getenv("GITHUB_REPO")

genai.configure(api_key=gemini_key)
model = genai.GenerativeModel(
    model_name="gemini-2.5-flash",
    system_instruction="You are Aegis, an elite SRE AI. You will receive a buggy code file causing a 99.9% CPU spike. Find the infinite loop or memory leak and fix it. OUTPUT ONLY THE RAW, CORRECTED CODE. Do not include markdown formatting like ```python. Do not explain the fix. Just the raw code."
)

app = FastAPI()

@app.post("/remediate")
async def remediate_incident(request: Request):
    payload = await request.json()
    incident_id = payload.get("incident_id")
    
    print("="*60)
    print(f"🚨 AI ACTIVATED: Incident #{incident_id} | CRITICAL CPU SPIKE")
    print("🐙 Initiating GitHub Auto-Remediation Protocol...")

    try:
        g = Github(github_token)
        repo = g.get_repo(github_repo_name)
        target_file_path = "buggy_service.py"

        print(f"📄 Fetching {target_file_path} from repository...")
        file_content = repo.get_contents(target_file_path)
        raw_code = file_content.decoded_content.decode('utf-8')

        print("🧠 Gemini is analyzing the infinite loop...")
        prompt = f"Fix this code that is causing a CPU spike. Return ONLY the raw code:\n\n{raw_code}"
        response = model.generate_content(prompt)
        
        fixed_code = response.text.strip()
        if fixed_code.startswith("```"):
            fixed_code = "\n".join(fixed_code.split("\n")[1:-1])

        print("🛠️ Patch generated! Pushing to GitHub...")

        main_branch = repo.get_branch("main")
        new_branch_name = f"aegis-auto-fix-{int(time.time())}"
        repo.create_git_ref(ref=f"refs/heads/{new_branch_name}", sha=main_branch.commit.sha)

        repo.update_file(
            path=target_file_path,
            message=f"fix(aegis): auto-resolved CPU spike for Incident #{incident_id}",
            content=fixed_code,
            sha=file_content.sha,
            branch=new_branch_name
        )

        pr = repo.create_pull(
            title=f"🚨 Aegis Auto-Remediation: CPU Spike Patch (Incident #{incident_id})",
            body="### Automated AI Fix\nAegis detected a 99.9% CPU spike. The root cause was identified as an infinite loop in `buggy_service.py`. \n\nThis PR contains the AI-generated patch to resolve the system lockup.",
            head=new_branch_name,
            base="main"
        )

        print(f"✅ SUCCESS! Pull Request Opened: {pr.html_url}")
        print("="*60)

        return {"status": "success", "message": "PR created successfully", "pr_url": pr.html_url}

    except Exception as e:
        print(f"❌ GitHub Remediation Failed: {e}")
        return {"status": "error", "message": str(e)}

if __name__ == "__main__":
    print("Starting AI Agent on Port 8000...")
    uvicorn.run(app, host="0.0.0.0", port=8000)
    