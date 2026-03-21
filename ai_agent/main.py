from fastapi import FastAPI, Request
import uvicorn
import os
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    print("❌ CRITICAL: GEMINI_API_KEY is missing from .env!")

genai.configure(api_key=api_key)

model = genai.GenerativeModel(
    model_name="gemini-2.5-flash",
    system_instruction="You are Aegis, an elite Autonomous Site Reliability Engineer. Your job is to analyze server telemetry, identify potential causes of crashes, and suggest code-level fixes. Be concise, technical, and output actionable intelligence. Do not use conversational filler."
)

app = FastAPI()

@app.get("/")
def read_root():
    return {"status": "Aegis AI Agent is online."}

@app.post("/remediate")
async def remediate_incident(request: Request):
    payload = await request.json()
    
    incident_id = payload.get("incident_id")
    probe_id = payload.get("probe_id")
    cpu_usage = payload.get("cpu_usage")

    print("="*50)
    print(f"🚨 AI ACTIVATED: Received Incident #{incident_id}")
    print(f"🖥️  Target Server: {probe_id} | 🔥 CPU: {cpu_usage}%")
    print("🧠 Initiating Gemini LLM diagnostic protocols...")
    
    diagnostic_prompt = f"""
    Incident Report #{incident_id}
    Server ID: {probe_id}
    Current State: CPU usage has critically spiked to {cpu_usage}%.
    
    Task: Provide a brief technical hypothesis on what typically causes a backend system to hit this CPU level. Then, list 3 Linux terminal commands I can run to debug the runaway process.
    """
    
    try:
        response = model.generate_content(diagnostic_prompt)
        ai_diagnosis = response.text
        
        print("\n💡 --- AI DIAGNOSIS ---")
        print(ai_diagnosis)
        print("------------------------\n")
        
        return {
            "status": "success", 
            "message": "AI diagnosis complete",
            "diagnosis": ai_diagnosis
        }
        
    except Exception as e:
        print(f"❌ AI Core Failure: {e}")
        return {"status": "error", "message": str(e)}

if __name__ == "__main__":
    print("Starting AI Agent on Port 8000...")
    uvicorn.run(app, host="0.0.0.0", port=8000)
