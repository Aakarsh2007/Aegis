"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { GitBranch, Plus, Loader2, AlertCircle, Check } from "lucide-react";
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

export default function RepositoriesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [owner, setOwner] = useState("");
  const [name, setName] = useState("");
  const [branch, setBranch] = useState("main");
  const [error, setError] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["repositories"],
    queryFn: () => fetch("/api/repositories").then((r) => r.json()),
  });

  const addRepo = useMutation({
    mutationFn: (body: object) =>
      fetch("/api/repositories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => {
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

  const repos: Repository[] = data?.repositories ?? [];

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GitBranch className="w-6 h-6 text-primary" />
            Repositories
          </h1>
          <p className="text-sm text-muted-foreground">Connected GitHub repositories for AI patch generation</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="w-4 h-4" />
          Connect repo
        </Button>
      </div>

      {isLoading ? (
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
              <Plus className="w-4 h-4" />
              Connect your first repo
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {repos.map((repo) => (
            <Card key={repo.id} className="hover:border-border/80 transition-all">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-primary shrink-0" />
                  <span className="truncate font-mono">{repo.fullName}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant={repo.isActive ? "success" : "secondary"}>
                    {repo.isActive ? <><Check className="w-3 h-3 mr-1" />Active</> : "Inactive"}
                  </Badge>
                  <span className="text-xs text-muted-foreground font-mono">branch: {repo.defaultBranch ?? "main"}</span>
                </div>
                <p className="text-xs text-muted-foreground">Added {relativeTime(repo.createdAt)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect Repository</DialogTitle>
            <DialogDescription>Add a GitHub repository for AI-generated patches</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); addRepo.mutate({ owner, name, defaultBranch: branch }); }} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Owner</Label>
              <Input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="your-username" required />
            </div>
            <div className="space-y-1.5">
              <Label>Repository name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="your-repo" required />
            </div>
            <div className="space-y-1.5">
              <Label>Default branch</Label>
              <Input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" />
            </div>
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
