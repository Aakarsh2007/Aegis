'use client';

import { useState, useEffect } from 'react';
import { settingsApi, type Settings, ApiError } from '@/lib/api';
import {
  Settings2, Github, KeyRound, Webhook, Eye, EyeOff,
  RotateCcw, Copy, Check, Loader2, AlertCircle, Save,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  // Form state
  const [githubRepo, setGithubRepo] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [showGemini, setShowGemini] = useState(false);

  useEffect(() => {
    settingsApi.get()
      .then((s) => {
        setSettings(s);
        setGithubRepo(s.githubRepo ?? '');
        setWebhookUrl(s.webhookUrl ?? '');
      })
      .catch(() => setError('Failed to load settings'))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await settingsApi.update({
        githubRepo: githubRepo || undefined,
        githubToken: githubToken || undefined,
        geminiKey: geminiKey || undefined,
        webhookUrl: webhookUrl || undefined,
      });
      setSuccess('Settings saved successfully');
      setGithubToken('');
      setGeminiKey('');
      // Refresh
      const s = await settingsApi.get();
      setSettings(s);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  async function handleRotateKey() {
    if (!confirm('Rotate API key? Your probe will need to be updated with the new key.')) return;
    setRotating(true);
    setError('');
    try {
      const { apiKey } = await settingsApi.rotateKey();
      setSettings((prev) => prev ? { ...prev, apiKey } : prev);
      setSuccess('API key rotated. Update your probe configuration.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to rotate key');
    } finally {
      setRotating(false);
    }
  }

  async function copyApiKey() {
    if (!settings?.apiKey) return;
    await navigator.clipboard.writeText(settings.apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) return (
    <div className="py-12 flex justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-cyan-500/30 border-t-cyan-500 animate-spin" />
    </div>
  );

  return (
    <div className="py-6 max-w-2xl space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Settings2 className="w-6 h-6 text-cyan-400" />
          Settings
        </h1>
        <p className="text-slate-400 text-sm mt-1">Configure your integrations and credentials</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3 text-green-400 text-sm">
          <Check className="w-4 h-4 shrink-0" />
          {success}
        </div>
      )}

      {/* API Key card */}
      <div className="glass rounded-2xl p-6 border border-white/5">
        <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2 mb-4">
          <KeyRound className="w-4 h-4 text-cyan-400" />
          API Key
        </h2>
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 bg-black/30 rounded-xl px-4 py-2.5 font-mono text-sm text-slate-300 border border-white/5">
            <span className="truncate">{settings?.apiKey ?? '—'}</span>
          </div>
          <button
            onClick={copyApiKey}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs transition-all"
          >
            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            onClick={handleRotateKey}
            disabled={rotating}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-xs transition-all disabled:opacity-50"
          >
            {rotating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
            Rotate
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-2">Used by your probe: <code className="bg-white/5 px-1 rounded">Authorization: Bearer {'<key>'}</code></p>
      </div>

      {/* Integration settings form */}
      <form onSubmit={handleSave} className="glass rounded-2xl p-6 border border-white/5 space-y-5">
        <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <Github className="w-4 h-4 text-purple-400" />
          GitHub Integration
        </h2>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Repository <span className="text-slate-600">(e.g. org/repo)</span></label>
          <input
            type="text"
            value={githubRepo}
            onChange={(e) => setGithubRepo(e.target.value)}
            placeholder="your-org/your-repo"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 transition-all font-mono"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            GitHub Token
            {settings?.githubTokenSet && (
              <span className="ml-2 text-green-400 text-xs">● configured</span>
            )}
          </label>
          <div className="relative">
            <input
              type={showToken ? 'text' : 'password'}
              value={githubToken}
              onChange={(e) => setGithubToken(e.target.value)}
              placeholder={settings?.githubTokenSet ? 'Leave blank to keep existing token' : 'ghp_...'}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 pr-10 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 transition-all font-mono"
            />
            <button type="button" onClick={() => setShowToken(!showToken)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
              {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="pt-2 border-t border-white/5">
          <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2 mb-4">
            <KeyRound className="w-4 h-4 text-yellow-400" />
            Gemini API Key
            {settings?.geminiKeySet && <span className="text-green-400 text-xs">● configured</span>}
          </h2>
          <div className="relative">
            <input
              type={showGemini ? 'text' : 'password'}
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              placeholder={settings?.geminiKeySet ? 'Leave blank to keep existing key' : 'AIza...'}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 pr-10 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 transition-all font-mono"
            />
            <button type="button" onClick={() => setShowGemini(!showGemini)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
              {showGemini ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="pt-2 border-t border-white/5">
          <label className="block text-xs font-medium text-slate-400 mb-1.5 flex items-center gap-1.5">
            <Webhook className="w-3.5 h-3.5" />
            Webhook URL <span className="text-slate-600">(optional)</span>
          </label>
          <input
            type="url"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://hooks.slack.com/..."
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 transition-all"
          />
          <p className="text-xs text-slate-600 mt-1">Receives a POST when an incident is resolved</p>
        </div>

        <button
          type="submit"
          disabled={saving}
          className={cn(
            'flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all',
            'bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500',
            'text-slate-900 shadow-lg shadow-cyan-500/20 disabled:opacity-50'
          )}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving...' : 'Save settings'}
        </button>
      </form>
    </div>
  );
}
