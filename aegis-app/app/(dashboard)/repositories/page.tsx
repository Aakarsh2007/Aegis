"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { GitBranch, Plus, Loader2, AlertCircle, Check, ShieldCheck, Github, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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

interface GitHubAppRepo {
  name: string;
  owner: string;
  fullName: string;
  defaultBranch: string;
}

export default function RepositoriesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [owner, setOwner] = useState("");
  const [name, setName] = useState("");
  const [branch, setBranch] = useState("main");
  const [error, setError] = useState("");

  // Connected Repositories
  const { data: reposData, isLoading: isLoadingRepos } = useQuery({
    queryKey: ["repositories"],
    queryFn: () => fetch("/api/repositories").then((r) => r.json()),
  });

  // Incident list to calculate health score
  const { data: incidentsData } = useQuery({
    queryKey: ["incidents"],
    queryFn: () => fetch("/api/incidents").then((r) => r.json()),
  });

  // GitHub App repositories
  const { data: appReposData, isLoading: isLoadingAppRepos } = useQuery({
    queryKey: ["githubAppRepos"],
    queryFn: () => fetch("/api/github/repos").then((r) => r.json()),
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
      qc.invalidateQueries({ queryKey: ["githubAppRepos"] });
      setOpen(false);
      setOwner(""); setName(""); setBranch("main"); setError("");
    },
    onError: (e: Error) => setError(e.message),
  });

  const repos: Repository[] = reposData?.repositories ?? [];
  const incidents = incidentsData?.incidents ?? [];
  const appInstalled = appReposData?.appInstalled ?? false;
  const appRepos: GitHubAppRepo[] = appReposData?.repos ?? [];

  // Filter out repos that are already connected
  const unconnectedAppRepos = appRepos.filter(
    (ar) => !repos.some((r) => r.fullName.toLowerCase() === ar.fullName.toLowerCase())
  );

  // Compute live health score based on active incidents
  const getHealthScore = (repoId: string) => {
    let score = 100;
    const repoIncidents = incidents.filter((i: any) => i.repositoryId === repoId);
    
    const activeIncidents = repoIncidents.filter((i: any) => i.status === "open" || i.status === "analyzing").length;
    const failedIncidents = repoIncidents.filter((i: any) => i.status === "failed").length;

    score -= activeIncidents * 25;
    score -= failedIncidents * 10;
    
    return Math.max(15, Math.min(100, score));
  };

  const getHealthVariant = (score: number) => {
    if (score >= 90) return "success";
    if (score >= 60) return "warning";
    return "destructive";
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GitBranch className="w-6 h-6 text-primary" />
            Repositories
          </h1>
          <p className="text-sm text-muted-foreground">Manage your connected version control and view repository health</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setOpen(true)}>
            <Plus className="w-4 h-4 mr-1" />
            Connect manually
          </Button>
          <a
            href={`https://github.com/apps/${process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || "aegis-sre"}/installations/new`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold">
              <Github className="w-4 h-4 mr-1.5" />
              Configure GitHub App
              <ExternalLink className="w-3 h-3 ml-1" />
            </Button>
          </a>
        </div>
      </div>

      {/* GitHub App Onboarding Section */}
      {!appInstalled && (
        <Card className="border-dashed border-primary/30 bg-primary/5">
          <CardContent className="p-5 flex flex-col sm:flex-row items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <Github className="w-6 h-6" />
            </div>
            <div className="space-y-1 text-center sm:text-left flex-1">
              <h3 className="font-semibold text-sm">One-Click Onboarding with GitHub App</h3>
              <p className="text-xs text-muted-foreground">
                Install our official GitHub App on your account/organization to securely select repositories with zero-configurations.
              </p>
            </div>
            <a
              href={`https://github.com/apps/${process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || "aegis-sre"}/installations/new`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto"
            >
              <Button size="sm" className="w-full">
                Install GitHub App
              </Button>
            </a>
          </CardContent>
        </Card>
      )}

      {/* Importable Repos from GitHub App */}
      {appInstalled && unconnectedAppRepos.length > 0 && (
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Import Repositories from GitHub App
            </CardTitle>
            <CardDescription className="text-xs">
              Quickly connect any of your installed GitHub repositories to start auto-patching.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {unconnectedAppRepos.map((ar) => (
                <div key={ar.fullName} className="flex items-center justify-between p-3 rounded-lg bg-background border hover:border-emerald-500/40 transition-colors">
                  <div className="min-w-0 pr-2">
                    <p className="text-xs font-semibold font-mono truncate">{ar.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{ar.owner}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[10px] shrink-0 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
                    onClick={() => addRepo.mutate({ owner: ar.owner, name: ar.name, defaultBranch: ar.defaultBranch })}
                    disabled={addRepo.isPending}
                  >
                    Connect
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Connected Repositories Grid */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Connected Repositories</h2>
        {isLoadingRepos ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
          </div>
        ) : repos.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
                <GitBranch className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground font-medium">No repositories connected</p>
              <p className="text-sm text-muted-foreground/60">Connect a GitHub repo to enable AI patch generation</p>
              <Button size="sm" onClick={() => setOpen(true)}>
                <Plus className="w-4 h-4 mr-1" />
                Connect manually
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {repos.map((repo) => {
              const score = getHealthScore(repo.id);
              return (
                <Card key={repo.id} className="hover:border-border/80 transition-all">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <GitBranch className="w-4 h-4 text-primary shrink-0" />
                        <span className="truncate font-mono">{repo.fullName}</span>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={repo.isActive ? "success" : "secondary"}>
                          {repo.isActive ? <><Check className="w-3 h-3 mr-1" />Active</> : "Inactive"}
                        </Badge>
                        <span className="text-xs text-muted-foreground font-mono">branch: {repo.defaultBranch ?? "main"}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-muted-foreground uppercase">Health:</span>
                        <Badge variant={getHealthVariant(score)}>
                          {score}%
                        </Badge>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">Connected {relativeTime(repo.createdAt)}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Manual Connection Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect Repository Manually</DialogTitle>
            <DialogDescription>Input the repository coordinates directly</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); addRepo.mutate({ owner, name, defaultBranch: branch }); }} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Owner / Organization</Label>
              <Input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="e.g. facebook" required />
            </div>
            <div className="space-y-1.5">
              <Label>Repository name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. react" required />
            </div>
            <div className="space-y-1.5">
              <Label>Default branch</Label>
              <Input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" />
            </div>
            <Button type="submit" className="w-full" disabled={addRepo.isPending}>
              {addRepo.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Connect Repository
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
