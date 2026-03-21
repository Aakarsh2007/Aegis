from fastapi import FastAPI, Request
import uvicorn

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
    print(f"🖥️  Target Server: {probe_id}")
    print(f"🔥 CPU Spiked to: {cpu_usage}%")
    print("🧠 Initiating LLM diagnostic protocols...")
    print("="*50)

    return {
        "status": "success", 
        "message": f"AI is investigating Incident {incident_id}"
    }

if __name__ == "__main__":
    print("Starting AI Agent on Port 8000...")
    uvicorn.run(app, host="0.0.0.0", port=8000)
    