"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Settings2, Github, KeyRound, Eye, EyeOff, Save, Loader2, Plus, Trash2, Copy, Check, AlertCircle, Bell, Webhook } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { relativeTime } from "@/lib/utils";

export default function SettingsPage() {
  const qc = useQueryClient();
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [slackUrl, setSlackUrl] = useState("");
  const [discordUrl, setDiscordUrl] = useState("");
  const [showGithub, setShowGithub] = useState(false);
  const [showGemini, setShowGemini] = useState(false);
  const [showSlack, setShowSlack] = useState(false);
  const [showDiscord, setShowDiscord] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["settings"],
    queryFn: () => fetch("/api/settings").then((r) => r.json()),
  });

  useEffect(() => {
    if (data?.webhookUrl) setWebhookUrl(data.webhookUrl);
  }, [data]);

  const saveSettings = useMutation({
    mutationFn: (body: object) =>
      fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        return d;
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      setSuccess("Settings saved!");
      setGithubToken(""); setGeminiKey(""); setSlackUrl(""); setDiscordUrl("");
      setTimeout(() => setSuccess(""), 3000);
    },
    onError: (e: Error) => setError(e.message),
  });

  const createApiKey = useMutation({
    mutationFn: (body: object) =>
      fetch("/api/settings/rotate-key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        return d;
      }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      setNewKey(d.apiKey);
      setKeyDialogOpen(false);
      setNewKeyName("");
    },
  });

  const revokeKey = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/settings/rotate-key?id=${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }),
  });

  async function copy(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setSuccess("");
    const body: Record<string, string | boolean> = {};
    if (githubToken) body.githubToken = githubToken;
    if (geminiKey) body.geminiApiKey = geminiKey;
    if (webhookUrl !== (data?.webhookUrl ?? "")) body.webhookUrl = webhookUrl;
    if (slackUrl) body.slackWebhookUrl = slackUrl;
    if (discordUrl) body.discordWebhookUrl = discordUrl;
    if (Object.keys(body).length === 0) { setSuccess("Nothing to update"); return; }
    saveSettings.mutate(body);
  }

  const apiKeys = data?.apiKeys ?? [];

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings2 className="w-6 h-6 text-primary" />
          Settings
        </h1>
        <p className="text-sm text-muted-foreground">Configure integrations and credentials</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3">
          <AlertCircle className="w-4 h-4 shrink-0" />{error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-3">
          <Check className="w-4 h-4 shrink-0" />{success}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-5">
        {/* GitHub */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Github className="w-4 h-4" />
              GitHub Integration
              {data?.githubInstallationId ? (
                <Badge variant="success" className="ml-auto">App Installed (ID: {data.githubInstallationId})</Badge>
              ) : data?.githubTokenSet ? (
                <Badge variant="success" className="ml-auto">PAT Connected</Badge>
              ) : null}
            </CardTitle>
            <CardDescription className="text-xs">Configure either a GitHub App installation (preferred) or a fallback Personal Access Token.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Input
                type={showGithub ? "text" : "password"}
                value={githubToken}
                onChange={(e) => setGithubToken(e.target.value)}
                placeholder={data?.githubTokenSet ? "Leave blank to keep existing token" : "ghp_..."}
                className="pr-10 font-mono text-xs"
              />
              <button type="button" onClick={() => setShowGithub(!showGithub)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showGithub ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {data?.githubInstallationId && (
              <p className="text-[10px] text-emerald-400">
                ✓ GitHub App installation is active and preferred. PAT is only used as a secondary fallback.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Gemini */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-yellow-400" />
              Gemini API Key
              {data?.geminiApiKeySet && <Badge variant="success" className="ml-auto">Configured</Badge>}
            </CardTitle>
            <CardDescription className="text-xs">Your own Gemini key (overrides the global key)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <Input
                type={showGemini ? "text" : "password"}
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                placeholder={data?.geminiApiKeySet ? "Leave blank to keep existing key" : "AIza..."}
                className="pr-10 font-mono text-xs"
              />
              <button type="button" onClick={() => setShowGemini(!showGemini)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showGemini ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Bell className="w-4 h-4 text-purple-400" />
              Notifications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-xs"><Webhook className="w-3.5 h-3.5" />Webhook URL (optional)</Label>
              <Input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://hooks.example.com/aegis" type="url" className="text-xs" />
            </div>
            <Separator />
            <div className="space-y-1.5">
              <Label className="text-xs">Slack Webhook {data?.slackWebhookUrl && <span className="text-emerald-400">(configured)</span>}</Label>
              <div className="relative">
                <Input type={showSlack ? "text" : "password"} value={slackUrl} onChange={(e) => setSlackUrl(e.target.value)} placeholder="https://hooks.slack.com/services/..." className="pr-10 text-xs" />
                <button type="button" onClick={() => setShowSlack(!showSlack)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {showSlack ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Discord Webhook {data?.discordWebhookUrl && <span className="text-emerald-400">(configured)</span>}</Label>
              <div className="relative">
                <Input type={showDiscord ? "text" : "password"} value={discordUrl} onChange={(e) => setDiscordUrl(e.target.value)} placeholder="https://discord.com/api/webhooks/..." className="pr-10 text-xs" />
                <button type="button" onClick={() => setShowDiscord(!showDiscord)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {showDiscord ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Button type="submit" disabled={saveSettings.isPending}>
          {saveSettings.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saveSettings.isPending ? "Saving…" : "Save settings"}
        </Button>
      </form>

      {/* API Keys */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-primary" />
            API Keys
            <Button size="sm" variant="outline" className="ml-auto h-7 text-xs" onClick={() => setKeyDialogOpen(true)}>
              <Plus className="w-3.5 h-3.5" />
              New key
            </Button>
          </CardTitle>
          <CardDescription className="text-xs">Keys used by probes to authenticate</CardDescription>
        </CardHeader>
        <CardContent>
          {apiKeys.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No API keys. Create one to connect a probe.</p>
          ) : (
            <div className="space-y-2">
              {apiKeys.map((k: { id: string; name: string; keyPrefix: string; lastUsed: string | null; createdAt: string | null }) => (
                <div key={k.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/50">
                  <div>
                    <p className="text-xs font-medium">{k.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{k.keyPrefix}•••</p>
                    <p className="text-xs text-muted-foreground">{k.lastUsed ? `Last used ${relativeTime(k.lastUsed)}` : `Created ${relativeTime(k.createdAt)}`}</p>
                  </div>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8 p-0" onClick={() => revokeKey.mutate(k.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Newly created key */}
      {newKey && (
        <Card className="border-emerald-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-emerald-400">New API Key — Save this now!</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-muted px-3 py-2 rounded-lg font-mono break-all">{newKey}</code>
              <Button size="sm" variant="outline" onClick={() => copy(newKey, "newkey")}>
                {copied === "newkey" ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">This key won&apos;t be shown again.</p>
          </CardContent>
        </Card>
      )}

      <Dialog open={keyDialogOpen} onOpenChange={setKeyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create API Key</DialogTitle>
            <DialogDescription>Give it a descriptive name</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); createApiKey.mutate({ name: newKeyName }); }} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} placeholder="e.g. prod-web-server" required />
            </div>
            <Button type="submit" className="w-full" disabled={createApiKey.isPending}>
              {createApiKey.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Create
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
