'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { onboardingApi, settingsApi, dashboardApi, ApiError } from '@/lib/api';
import {
  Shield, KeyRound, Github, Terminal, CheckCircle2,
  Copy, Check, ChevronRight, Loader2, Eye, EyeOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const STEPS = [
  { id: 1, label: 'API Key',    icon: KeyRound  },
  { id: 2, label: 'GitHub',    icon: Github    },
  { id: 3, label: 'Install',   icon: Terminal  },
  { id: 4, label: 'Confirmed', icon: CheckCircle2 },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [apiKey, setApiKey] = useState('');
  const [installCommand, setInstallCommand] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Step 2 form
  const [githubRepo, setGithubRepo] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [showGemini, setShowGemini] = useState(false);
  const [saving, setSaving] = useState(false);

  // Step 4 polling
  const [waitingForProbe, setWaitingForProbe] = useState(false);

  useEffect(() => {
    onboardingApi.get()
      .then((d) => {
        setApiKey(d.apiKey);
        setInstallCommand(d.installCommand);
        if (d.step >= 5) router.replace('/dashboard');
        else setStep(Math.min(d.step, 4));
      })
      .catch(() => setError('Failed to load onboarding data'))
      .finally(() => setLoading(false));
  }, [router]);

  const copy = useCallback(async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2500);
  }, []);

  async function handleStep2(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await settingsApi.update({ githubRepo, githubToken, geminiKey });
      setStep(3);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  // Step 4: poll for first heartbeat
  useEffect(() => {
    if (step !== 4 || !waitingForProbe) return;
    const poll = setInterval(async () => {
      try {
        const d = await dashboardApi.get();
        const hasProbe = d.probes.some((p) => p.status === 'online');
        if (hasProbe) {
          clearInterval(poll);
          setWaitingForProbe(false);
          await onboardingApi.complete();
          setTimeout(() => router.push('/dashboard'), 2000);
        }
      } catch { /* continue polling */ }
    }, 2000);
    return () => clearInterval(poll);
  }, [step, waitingForProbe, router]);

  if (loading) return (
    <div className="py-12 flex justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-cyan-500/30 border-t-cyan-500 animate-spin" />
    </div>
  );

  return (
    <div className="py-8 max-w-2xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-purple-500/20 border border-cyan-500/30 mb-4">
          <Shield className="w-7 h-7 text-cyan-400" />
        </div>
        <h1 className="text-2xl font-bold text-white">Set up Aegis</h1>
        <p className="text-slate-400 text-sm mt-1">Get from sign-up to live monitoring in minutes</p>
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
                  'flex items-center justify-center w-9 h-9 rounded-full border-2 transition-all',
                  done  ? 'bg-cyan-500 border-cyan-500 text-slate-900' :
                  active ? 'bg-cyan-500/10 border-cyan-500 text-cyan-400' :
                           'bg-white/5 border-white/10 text-slate-500'
                )}>
                  {done ? <Check className="w-4 h-4" /> : <StepIcon className="w-4 h-4" />}
                </div>
                <span className={cn('text-xs hidden sm:block', active ? 'text-cyan-400' : done ? 'text-slate-400' : 'text-slate-600')}>
                  {s.label}
                </span>
              </div>
              {idx < STEPS.length - 1 && (
                <div className={cn('w-12 sm:w-20 h-px mx-2 transition-all', done ? 'bg-cyan-500/60' : 'bg-white/10')} />
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mb-4">
          {error}
        </div>
      )}

      {/* Step content */}
      <div className="glass rounded-2xl p-7 border border-white/5">

        {/* Step 1: API Key */}
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-1">
                <KeyRound className="w-5 h-5 text-cyan-400" />
                Your API Key
              </h2>
              <p className="text-slate-400 text-sm">This authenticates your probe. Keep it secret — treat it like a password.</p>
            </div>
            <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-xl px-4 py-3">
              <code className="flex-1 text-cyan-400 font-mono text-sm break-all">{apiKey}</code>
              <button
                onClick={() => copy(apiKey, 'apikey')}
                className="shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition-all"
              >
                {copied === 'apikey' ? <><Check className="w-3.5 h-3.5 text-green-400" /> Copied!</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
              </button>
            </div>
            <p className="text-xs text-slate-500 bg-yellow-500/5 border border-yellow-500/10 rounded-lg px-3 py-2">
              ⚠️ This key won&apos;t be shown again after you leave this page. Store it safely.
            </p>
            <button
              onClick={() => setStep(2)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-slate-900 font-semibold text-sm transition-all"
            >
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Step 2: GitHub */}
        {step === 2 && (
          <form onSubmit={handleStep2} className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-1">
                <Github className="w-5 h-5 text-purple-400" />
                Connect GitHub
              </h2>
              <p className="text-slate-400 text-sm">Aegis needs access to your repo to fetch files and open PRs.</p>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1.5">Repository</label>
              <input
                type="text" required
                value={githubRepo} onChange={(e) => setGithubRepo(e.target.value)}
                placeholder="your-org/your-repo"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 font-mono transition-all"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1.5">GitHub Personal Access Token</label>
              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'} required
                  value={githubToken} onChange={(e) => setGithubToken(e.target.value)}
                  placeholder="ghp_..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 pr-10 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 font-mono transition-all"
                />
                <button type="button" onClick={() => setShowToken(!showToken)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-slate-600 mt-1">Needs repo read/write access</p>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1.5">Gemini API Key <span className="text-slate-600">(optional — uses global key if not set)</span></label>
              <div className="relative">
                <input
                  type={showGemini ? 'text' : 'password'}
                  value={geminiKey} onChange={(e) => setGeminiKey(e.target.value)}
                  placeholder="AIza..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 pr-10 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 font-mono transition-all"
                />
                <button type="button" onClick={() => setShowGemini(!showGemini)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                  {showGemini ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit" disabled={saving}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-400 hover:to-purple-500 text-white font-semibold text-sm transition-all disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {saving ? 'Saving...' : <><span>Save & continue</span><ChevronRight className="w-4 h-4" /></>}
            </button>
          </form>
        )}

        {/* Step 3: Install command */}
        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-1">
                <Terminal className="w-5 h-5 text-orange-400" />
                Install the Probe
              </h2>
              <p className="text-slate-400 text-sm">Run this on your Linux server to start sending telemetry to Aegis.</p>
            </div>

            <div className="relative bg-black/50 border border-white/10 rounded-xl p-4 group">
              <pre className="text-xs text-green-400 font-mono overflow-x-auto leading-relaxed whitespace-pre-wrap">{installCommand}</pre>
              <button
                onClick={() => copy(installCommand, 'install')}
                className="absolute top-3 right-3 flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition-all"
              >
                {copied === 'install' ? <><Check className="w-3.5 h-3.5 text-green-400" /> Copied!</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
              </button>
            </div>

            <p className="text-xs text-slate-500">Requires: g++ (C++17), pthreads, Linux kernel ≥ 3.10</p>

            <button
              onClick={() => { setStep(4); setWaitingForProbe(true); }}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-semibold text-sm transition-all"
            >
              I&apos;ve started the probe <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Step 4: Waiting for first ping */}
        {step === 4 && (
          <div className="text-center space-y-5">
            <div className="flex flex-col items-center gap-4">
              {waitingForProbe ? (
                <>
                  <div className="relative w-16 h-16">
                    <div className="absolute inset-0 rounded-full bg-cyan-500/20 animate-ping" />
                    <div className="relative flex items-center justify-center w-16 h-16 rounded-full bg-cyan-500/10 border border-cyan-500/30">
                      <Loader2 className="w-7 h-7 text-cyan-400 animate-spin" />
                    </div>
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">Waiting for your probe...</h2>
                    <p className="text-slate-400 text-sm mt-1">Aegis will auto-advance once it receives the first heartbeat.</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10 border border-green-500/30">
                    <CheckCircle2 className="w-8 h-8 text-green-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">Probe connected!</h2>
                    <p className="text-slate-400 text-sm mt-1">Redirecting to your dashboard...</p>
                  </div>
                </>
              )}
            </div>

            {waitingForProbe && (
              <button
                onClick={async () => { await onboardingApi.complete(); router.push('/dashboard'); }}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors underline"
              >
                Skip and go to dashboard
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
