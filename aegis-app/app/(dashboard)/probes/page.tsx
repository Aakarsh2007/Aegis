"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Cpu, Plus, Copy, Check, Loader2, AlertCircle, Terminal, Wifi, WifiOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn, relativeTime } from "@/lib/utils";

interface Probe {
  id: string;
  probeId: string;
  name: string | null;
  hostname: string | null;
  status: string;
  lastSeen: string | null;
  version: string | null;
}

export default function ProbesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [installCmd, setInstallCmd] = useState("");
  const [copied, setCopied] = useState(false);
  const [probeName, setProbeName] = useState("");
  const [error, setError] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["probes"],
    queryFn: () => fetch("/api/probes").then((r) => r.json()),
    refetchInterval: 10000,
  });

  const createProbe = useMutation({
    mutationFn: (body: object) =>
      fetch("/api/probes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        return d;
      }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["probes"] });
      setNewKey(d.apiKey);
      setInstallCmd(d.installCommand);
      setShowKey(true);
      setOpen(false);
      setProbeName("");
    },
    onError: (e: Error) => setError(e.message),
  });

  async function copyText(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const probes: Probe[] = data?.probes ?? [];

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Cpu className="w-6 h-6 text-primary" />
            Probes
          </h1>
          <p className="text-sm text-muted-foreground">Manage your edge monitoring agents</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="w-4 h-4" />
          Create probe
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      ) : probes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
              <Cpu className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground font-medium">No probes registered</p>
            <p className="text-sm text-muted-foreground/60 text-center">Create a probe and run it on your Linux server</p>
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="w-4 h-4" />
              Create your first probe
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {probes.map((probe) => (
            <Card key={probe.id} className={cn("transition-all", probe.status === "online" && "border-emerald-500/20")}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  {probe.status === "online"
                    ? <Wifi className="w-4 h-4 text-emerald-400 shrink-0" />
                    : <WifiOff className="w-4 h-4 text-muted-foreground shrink-0" />}
                  <span className="font-mono truncate">{probe.probeId}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {probe.name && probe.name !== probe.probeId && (
                  <p className="text-xs text-muted-foreground">{probe.name}</p>
                )}
                <div className="flex items-center gap-2">
                  <Badge variant={probe.status === "online" ? "success" : "secondary"}>
                    {probe.status === "online" ? "Online" : "Offline"}
                  </Badge>
                  {probe.hostname && <span className="text-xs text-muted-foreground font-mono">{probe.hostname}</span>}
                </div>
                <p className="text-xs text-muted-foreground">
                  Last seen: {probe.lastSeen ? relativeTime(probe.lastSeen) : "Never"}
                </p>
                {probe.version && <p className="text-xs text-muted-foreground">v{probe.version}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create probe dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Probe</DialogTitle>
            <DialogDescription>A new API key will be generated for this probe</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); setError(""); createProbe.mutate({ name: probeName }); }} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 shrink-0" />{error}
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Probe name</Label>
              <Input value={probeName} onChange={(e) => setProbeName(e.target.value)} placeholder="e.g. web-server-prod-1" required />
            </div>
            <Button type="submit" className="w-full" disabled={createProbe.isPending}>
              {createProbe.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Create probe
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* API key reveal dialog */}
      <Dialog open={showKey} onOpenChange={setShowKey}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Probe created!</DialogTitle>
            <DialogDescription>Copy your API key and install command. The key won&apos;t be shown again.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>API Key (save this now)</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-muted px-3 py-2 rounded-lg font-mono break-all">{newKey}</code>
                <Button variant="outline" size="sm" onClick={() => copyText(newKey)}>
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><Terminal className="w-3.5 h-3.5" />Install command</Label>
              <div className="relative bg-muted rounded-lg p-3">
                <pre className="text-xs font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap">{installCmd}</pre>
                <Button variant="outline" size="sm" className="absolute top-2 right-2" onClick={() => copyText(installCmd)}>
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
            <Button className="w-full" onClick={() => setShowKey(false)}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
