"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { GitBranch, Plus, Loader2, AlertCircle, Check, Scan, Zap, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { relativeTime } from "@/lib/utils";

interface Repository {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string | null;
  isActive: boolean | null;
  createdAt: string | null;
}

interface ScanResult {
  success: boolean;
  filesScanned: number;
  issuesFound: number;
  incidentIds: string[];
  message: string;
}

export default function RepositoriesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [owner, setOwner] = useState("");
  const [name, setName] = useState("");
  const [branch, setBranch] = useState("main");
  const [error, setError] = useState("");
  const [scanResults, setScanResults] = useState<Record<string, ScanResult>>({});
  const [scanningId, setScanningId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["repositories"],
    queryFn: () => fetch("/api/repositories").then((r) => r.json()),
  });

  const addRepo = useMutation({
    mutationFn: (body: object) =>
      fetch("/api/repositories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        return d;
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["repositories"] });
      setOpen(false);
      setOwner(""); setName(""); setBranch("main"); setError("");
    },
    onError: (e: Error) => setError(e.message),
  });

  async function handleScan(repoId: string) {
    setScanningId(repoId);
    setScanResults((prev) => ({ ...prev, [repoId]: { success: false, filesScanned: 0, issuesFound: 0, incidentIds: [], message: "Scanning..." } }));
    try {
      const res = await fetch(`/api/repositories/${repoId}/scan`, { method: "POST" });
      const data = await res.json();
      setScanResults((prev) => ({ ...prev, [repoId]: data }));
      // Refresh incidents list
      qc.invalidateQueries({ queryKey: ["incidents"] });
    } catch {
      setScanResults((prev) => ({ ...prev, [repoId]: { success: false, filesScanned: 0, issuesFound: 0, incidentIds: [], message: "Scan failed" } }));
    } finally {
      setScanningId(null);
    }
  }

  const repos: Repository[] = data?.repositories ?? [];

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GitBranch className="w-6 h-6 text-primary" />
            Repositories
          </h1>
          <p className="text-sm text-muted-foreground">
            Connect repos and let AI scan them for bugs automatically
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="w-4 h-4" />
          Connect repo
        </Button>
      </div>

      {/* Explainer banner */}
      <div className="flex items-start gap-3 bg-primary/5 border border-primary/20 rounded-xl px-4 py-3">
        <Zap className="w-5 h-5 text-primary mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium">How AI scanning works</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Click <strong>Scan</strong> on any repo. Aegis fetches your source files, sends them to Gemini,
            identifies bugs, memory leaks, and security issues — then automatically opens GitHub PRs with fixes.
            No crash required.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      ) : repos.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
              <GitBranch className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground font-medium">No repositories connected</p>
            <p className="text-sm text-muted-foreground/60 text-center max-w-xs">
              Connect a GitHub repo and Aegis will scan it for bugs using AI — no probe needed
            </p>
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="w-4 h-4" />
              Connect your first repo
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {repos.map((repo) => {
            const scanning = scanningId === repo.id;
            const result = scanResults[repo.id];
            return (
              <Card key={repo.id} className="hover:border-border/80 transition-all">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <GitBranch className="w-4 h-4 text-primary shrink-0" />
                    <a
                      href={`https://github.com/${repo.fullName}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono hover:underline flex items-center gap-1 truncate"
                    >
                      {repo.fullName}
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge variant={repo.isActive ? "success" : "secondary"}>
                      {repo.isActive ? <><Check className="w-3 h-3 mr-1" />Active</> : "Inactive"}
                    </Badge>
                    <span className="text-xs text-muted-foreground font-mono">
                      branch: {repo.defaultBranch ?? "main"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">Added {relativeTime(repo.createdAt)}</p>

                  {/* Scan result */}
                  {result && (
                    <div className={`text-xs rounded-lg px-3 py-2 ${result.issuesFound > 0 ? "bg-amber-500/10 border border-amber-500/20 text-amber-400" : result.success ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                      {result.success
                        ? result.issuesFound > 0
                          ? `🔍 Found ${result.issuesFound} issue${result.issuesFound > 1 ? "s" : ""} in ${result.filesScanned} files — check Incidents`
                          : `✅ Scanned ${result.filesScanned} files — no issues found`
                        : `❌ ${result.message}`
                      }
                    </div>
                  )}

                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => handleScan(repo.id)}
                    disabled={scanning || scanningId !== null}
                  >
                    {scanning ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />Scanning with AI...</>
                    ) : (
                      <><Scan className="w-3.5 h-3.5 mr-1.5" />Scan for issues</>
                    )}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect Repository</DialogTitle>
            <DialogDescription>
              Connect a GitHub repo — Aegis will scan it for bugs and open PRs with fixes
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => { e.preventDefault(); addRepo.mutate({ owner, name, defaultBranch: branch }); }}
            className="space-y-4"
          >
            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Owner / Username</Label>
              <Input
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="your-github-username"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Repository name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="your-repo-name"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Default branch</Label>
              <Input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" />
            </div>
            <p className="text-xs text-muted-foreground">
              Make sure your GitHub token (in Settings) has <code>repo</code> read access to this repository.
            </p>
            <Button type="submit" className="w-full" disabled={addRepo.isPending}>
              {addRepo.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Connect
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
