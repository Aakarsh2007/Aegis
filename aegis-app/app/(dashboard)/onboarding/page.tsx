"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Shield, KeyRound, Github, Terminal, CheckCircle2, Copy, Check, ChevronRight, Loader2, Eye, EyeOff, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: 1, label: "API Key",  icon: KeyRound },
  { id: 2, label: "GitHub",   icon: Github   },
  { id: 3, label: "Install",  icon: Terminal },
  { id: 4, label: "Live",     icon: Zap      },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [copied, setCopied] = useState<string | null>(null);
  const [githubToken, setGithubToken] = useState("");
  const [githubOwner, setGithubOwner] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [showGemini, setShowGemini] = useState(false);
  const [saving, setSaving] = useState(false);
  const [waitingForProbe, setWaitingForProbe] = useState(false);
  const [probeDetected, setProbeDetected] = useState(false);

  const { data: onboarding } = useQuery({
    queryKey: ["onboarding"],
    queryFn: () => fetch("/api/onboarding").then((r) => r.json()),
  });

  const { data: probeKey } = useQuery({
    queryKey: ["first-probe-key"],
    queryFn: () => fetch("/api/probes").then((r) => r.json()),
  });

  const updateStep = useMutation({
    mutationFn: (s: number) =>
      fetch("/api/onboarding", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step: s }) }),
  });

  useEffect(() => {
    if (onboarding?.step && onboarding.step >= 5) {
      router.replace("/dashboard");
    }
  }, [onboarding, router]);

  const copy = useCallback(async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2500);
  }, []);

  async function handleStep2(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body: Record<string, string> = {};
      if (githubToken) body.githubToken = githubToken;
      if (geminiKey) body.geminiApiKey = geminiKey;
      if (githubOwner && githubRepo) {
        await fetch("/api/repositories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ owner: githubOwner, name: githubRepo }),
        });
      }
      if (Object.keys(body).length > 0) {
        await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      }
      setStep(3);
      updateStep.mutate(3);
    } finally {
      setSaving(false);
    }
  }

  // Poll for first probe heartbeat in step 4
  useEffect(() => {
    if (step !== 4 || !waitingForProbe) return;
    const poll = setInterval(async () => {
      try {
        const d = await fetch("/api/dashboard").then((r) => r.json());
        if (d?.probes?.some((p: { status: string }) => p.status === "online")) {
          clearInterval(poll);
          setProbeDetected(true);
          setWaitingForProbe(false);
          await fetch("/api/onboarding", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step: 5 }) });
          setTimeout(() => router.push("/dashboard"), 2500);
        }
      } catch { /* continue polling */ }
    }, 2000);
    return () => clearInterval(poll);
  }, [step, waitingForProbe, router]);

  const apiKeyPrefix = probeKey?.probes?.[0] ? null : null;
  const installCmd = onboarding?.installCommand ?? `export AEGIS_API_KEY="<your-api-key>"\nexport AEGIS_ENDPOINT="${typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"}"\ng++ main.cpp -o aegis-probe -pthread -std=c++17\n./aegis-probe --api-key "$AEGIS_API_KEY" --endpoint "$AEGIS_ENDPOINT"`;

  return (
    <div className="py-8 max-w-xl mx-auto animate-fade-in">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border border-primary/30 mb-4">
          <Shield className="w-7 h-7 text-primary" />
        </div>
        <h1 className="text-2xl font-bold">Set up Aegis</h1>
        <p className="text-sm text-muted-foreground mt-1">Go from sign-up to live monitoring in minutes</p>
      </div>

      {/* Step indicators */}
      <div className="flex items-center justify-center mb-8">
        {STEPS.map((s, idx) => {
          const done = step > s.id;
          const active = step === s.id;
          const StepIcon = s.icon;
          return (
            <div key={s.id} className="flex items-center">
              <div className="flex flex-col items-center gap-1">
                <div className={cn(
                  "flex items-center justify-center w-9 h-9 rounded-full border-2 transition-all",
                  done ? "bg-primary border-primary text-primary-foreground" :
                  active ? "bg-primary/10 border-primary text-primary" :
                           "bg-muted border-border text-muted-foreground"
                )}>
                  {done ? <Check className="w-4 h-4" /> : <StepIcon className="w-4 h-4" />}
                </div>
                <span className={cn("text-xs hidden sm:block", active ? "text-primary" : done ? "text-muted-foreground" : "text-muted-foreground/50")}>{s.label}</span>
              </div>
              {idx < STEPS.length - 1 && (
                <div className={cn("w-12 sm:w-16 h-px mx-2 transition-all", done ? "bg-primary/60" : "bg-border")} />
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border bg-card p-7">

        {/* Step 1: API Key */}
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2"><KeyRound className="w-5 h-5 text-primary" />Your API Key</h2>
              <p className="text-sm text-muted-foreground mt-1">This authenticates your probe. Treat it like a password.</p>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Go to <strong>Probes</strong> → <strong>Create probe</strong> to get your API key, then come back here.</p>
              <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-lg px-4 py-3">
                <KeyRound className="w-4 h-4 text-primary shrink-0" />
                <p className="text-sm">Your API key is shown once when you create a probe.</p>
              </div>
            </div>
            <Button className="w-full" onClick={() => { setStep(2); updateStep.mutate(2); }}>
              I have my API key <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}

        {/* Step 2: GitHub */}
        {step === 2 && (
          <form onSubmit={handleStep2} className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2"><Github className="w-5 h-5 text-purple-400" />Connect GitHub</h2>
              <p className="text-sm text-muted-foreground mt-1">Required for AI to fetch files and open PRs.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Repo owner</Label>
                <Input value={githubOwner} onChange={(e) => setGithubOwner(e.target.value)} placeholder="your-username" className="text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Repo name</Label>
                <Input value={githubRepo} onChange={(e) => setGithubRepo(e.target.value)} placeholder="your-repo" className="text-xs" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">GitHub Token (repo scope)</Label>
              <div className="relative">
                <Input type={showToken ? "text" : "password"} value={githubToken} onChange={(e) => setGithubToken(e.target.value)} placeholder="ghp_..." className="pr-10 text-xs font-mono" />
                <button type="button" onClick={() => setShowToken(!showToken)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"><Eye className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Gemini API Key <span className="text-muted-foreground">(optional)</span></Label>
              <div className="relative">
                <Input type={showGemini ? "text" : "password"} value={geminiKey} onChange={(e) => setGeminiKey(e.target.value)} placeholder="AIza..." className="pr-10 text-xs font-mono" />
                <button type="button" onClick={() => setShowGemini(!showGemini)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"><EyeOff className="w-4 h-4" /></button>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save & continue <ChevronRight className="w-4 h-4" />
            </Button>
          </form>
        )}

        {/* Step 3: Install */}
        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2"><Terminal className="w-5 h-5 text-amber-400" />Install the Probe</h2>
              <p className="text-sm text-muted-foreground mt-1">Run this on your Linux server (requires g++ and pthreads).</p>
            </div>
            <div className="relative bg-muted rounded-lg p-4">
              <pre className="text-xs font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap">{installCmd}</pre>
              <button onClick={() => copy(installCmd, "install")} className="absolute top-2 right-2 p-1.5 rounded-md bg-background/80 hover:bg-background border border-border text-muted-foreground hover:text-foreground transition-all">
                {copied === "install" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <Button className="w-full" onClick={() => { setStep(4); setWaitingForProbe(true); updateStep.mutate(4); }}>
              I&apos;ve started the probe <ChevronRight className="w-4 h-4" />
            </Button>
            <button onClick={() => { router.push("/dashboard"); }} className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors">
              Skip for now
            </button>
          </div>
        )}

        {/* Step 4: Waiting */}
        {step === 4 && (
          <div className="text-center space-y-5 py-4">
            {!probeDetected ? (
              <>
                <div className="relative inline-flex">
                  <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <Loader2 className="w-7 h-7 text-primary animate-spin" />
                  </div>
                  <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Waiting for your probe…</h2>
                  <p className="text-sm text-muted-foreground mt-1">Aegis will auto-advance when it receives the first heartbeat.</p>
                </div>
                <button onClick={() => { router.push("/dashboard"); }} className="text-xs text-muted-foreground hover:text-foreground transition-colors underline">
                  Go to dashboard anyway
                </button>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Probe connected!</h2>
                  <p className="text-sm text-muted-foreground mt-1">Redirecting to your dashboard…</p>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
