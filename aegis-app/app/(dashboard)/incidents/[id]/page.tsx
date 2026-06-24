"use client";

import { use, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ExternalLink, Clock, AlertTriangle, CheckCircle2,
  XCircle, Loader2, GitBranch, Terminal, Brain, RotateCcw, Check, Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn, relativeTime } from "@/lib/utils";

const statusConfig = {
  open:      { icon: AlertTriangle, badge: "critical" as const  },
  analyzing: { icon: Loader2,       badge: "analyzing" as const },
  resolved:  { icon: CheckCircle2,  badge: "success" as const   },
  failed:    { icon: XCircle,       badge: "critical" as const  },
};

function DiffViewer({ diff }: { diff: string }) {
  if (!diff) return null;
  const lines = diff.split("\n");
  return (
    <div className="font-mono text-[11px] overflow-x-auto bg-slate-950 text-slate-200 p-4 rounded-lg leading-relaxed max-h-96">
      {lines.map((line, idx) => {
        let className = "text-slate-400";
        if (line.startsWith("+")) className = "bg-emerald-950/50 text-emerald-300 border-l-2 border-emerald-500 pl-1";
        else if (line.startsWith("-")) className = "bg-rose-950/50 text-rose-300 border-l-2 border-rose-500 pl-1";
        else if (line.startsWith("@@") || line.startsWith("---") || line.startsWith("+++")) className = "text-cyan-400 font-semibold";
        return (
          <div key={idx} className={cn("py-0.5 px-2 rounded-sm", className)}>
            {line}
          </div>
        );
      })}
    </div>
  );
}

export default function IncidentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const router = useRouter();
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["incident", id],
    queryFn: () => fetch(`/api/incidents/${id}`).then((r) => r.json()),
    refetchInterval: 3000,
  });

  const incident = data?.incident;
  const events = data?.events ?? [];
  const remediation = data?.remediation;

  const handleApprove = async () => {
    if (!remediation?.id) return;
    setApproving(true);
    setApproveError("");
    try {
      const res = await fetch(`/api/remediations/${remediation.id}/approve`, {
        method: "POST",
      });
      const d = await res.json();
      if (!res.ok) {
        throw new Error(d.error || "Failed to approve patch");
      }
      qc.invalidateQueries({ queryKey: ["incident", id] });
    } catch (err) {
      setApproveError(err instanceof Error ? err.message : String(err));
    } finally {
      setApproving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/incidents/${id}`, { method: "DELETE" });
      if (res.ok) {
        qc.invalidateQueries({ queryKey: ["incidents"] });
        router.push("/incidents");
      }
    } finally {
      setDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  if (isLoading) return (
    <div className="space-y-4 animate-fade-in">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-32 rounded-xl" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );

  if (!incident) return (
    <div className="text-center py-20">
      <p className="text-muted-foreground">Incident not found</p>
      <Link href="/incidents" className="text-primary text-sm hover:underline mt-2 inline-block">← Back</Link>
    </div>
  );

  const cfg = statusConfig[incident.status as keyof typeof statusConfig] ?? statusConfig.open;
  const Icon = cfg.icon;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <Link href="/incidents" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to incidents
        </Link>
        <Button
          variant="outline"
          size="sm"
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={() => setShowDeleteDialog(true)}
        >
          <Trash2 className="w-3.5 h-3.5 mr-1.5" />
          Delete
        </Button>
      </div>

      {/* Header */}
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant={cfg.badge}>
                  <Icon className={cn("w-3 h-3 mr-1", incident.status === "analyzing" && "animate-spin")} />
                  {incident.status}
                </Badge>
                <span className="text-xs text-muted-foreground font-mono bg-muted px-2 py-0.5 rounded">#{incident.id}</span>
              </div>
              <h1 className="text-xl font-bold">{incident.title ?? "Unknown Issue"}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Probe: <span className="font-mono">{incident.probeId}</span>
                {" · "}
                <Clock className="w-3 h-3 inline mr-0.5" />
                {relativeTime(incident.createdAt)}
              </p>
            </div>

            {incident.prUrl && (
              <a href={incident.prUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 text-sm font-semibold transition-all whitespace-nowrap">
                <GitBranch className="w-4 h-4" />
                VIEW AI PATCH
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Stack trace */}
        {incident.stackTrace && (
          <Card className="lg:col-span-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Terminal className="w-4 h-4 text-primary" />
                Stack Trace
              </CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs text-muted-foreground font-mono bg-muted/50 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                {incident.stackTrace}
              </pre>
            </CardContent>
          </Card>
        )}

        {/* Timeline */}
        <Card className={incident.stackTrace ? "lg:col-span-2" : "lg:col-span-5"}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-0">
              {events.map((ev: { id: number; toStatus: string; fromStatus: string | null; message: string | null; eventType: string; createdAt: string }, idx: number) => {
                const evCfg = statusConfig[ev.toStatus as keyof typeof statusConfig];
                const EvIcon = evCfg?.icon ?? Clock;
                const isLast = idx === events.length - 1;
                return (
                  <div key={ev.id} className="flex gap-3 pb-4 relative">
                    {!isLast && <div className="absolute left-3.5 top-7 bottom-0 w-px bg-border" />}
                    <div className={cn("w-7 h-7 rounded-full flex items-center justify-center shrink-0 border", evCfg ? "bg-card" : "bg-muted")}>
                      <EvIcon className={cn("w-3.5 h-3.5", evCfg?.badge === "success" ? "text-emerald-400" : evCfg?.badge === "analyzing" ? "text-amber-400 animate-spin" : evCfg?.badge === "critical" ? "text-red-400" : "text-muted-foreground")} />
                    </div>
                    <div className="pt-0.5 min-w-0">
                      <p className="text-xs font-semibold capitalize">{ev.toStatus}</p>
                      {ev.message && <p className="text-xs text-muted-foreground mt-0.5 break-words">{ev.message.slice(0, 120)}</p>}
                      <p className="text-xs text-muted-foreground/60 mt-0.5">{relativeTime(ev.createdAt)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI Remediation Proposal */}
      {reremediationDisplay()}

      {/* Code diff */}
      {remediation && remediation.patchDiff && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              Proposed Code Correction Diff
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DiffViewer diff={remediation.patchDiff} />
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {incident.errorMessage && (
        <Card className="border-destructive/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-destructive">
              <XCircle className="w-4 h-4" />
              Remediation Error
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-mono bg-destructive/5 rounded-lg p-3 text-muted-foreground">{incident.errorMessage}</p>
          </CardContent>
        </Card>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete incident?</DialogTitle>
            <DialogDescription>
              This will permanently remove this incident and all associated events and remediations. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
            <Button variant="destructive" className="flex-1" disabled={deleting} onClick={handleDelete}>
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );

  function reremediationDisplay() {
    if (!remediation) return null;

    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Brain className="w-4 h-4 text-purple-400" />
            AI Remediation Analysis & Proposal
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {remediation.confidenceScore != null && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-muted-foreground">AI Confidence Score</span>
                <span className={cn("text-xs font-bold",
                  remediation.confidenceScore > 0.7 ? "text-emerald-400" :
                  remediation.confidenceScore > 0.4 ? "text-amber-400" : "text-red-400")}>
                  {(remediation.confidenceScore * 100).toFixed(0)}%
                </span>
              </div>
              <Progress
                value={remediation.confidenceScore * 100}
                className={cn("h-1.5",
                  remediation.confidenceScore > 0.7 ? "[&>div]:bg-emerald-500" :
                  remediation.confidenceScore > 0.4 ? "[&>div]:bg-amber-500" : "[&>div]:bg-red-500")}
              />
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {remediation.targetFile && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Affected File</p>
                <code className="text-xs bg-muted px-2 py-1 rounded font-mono">{remediation.targetFile}</code>
              </div>
            )}
            {remediation.status && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Proposal Status</p>
                <Badge variant={remediation.status === "success" ? "success" : "warning"}>
                  {remediation.status.replace("_", " ")}
                </Badge>
              </div>
            )}
          </div>

          {remediation.explanation && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Fix Explanation</p>
              <p className="text-sm bg-muted/50 rounded-lg p-3 leading-relaxed">{remediation.explanation}</p>
            </div>
          )}

          {remediation.rollbackNotes && (
            <div>
              <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <RotateCcw className="w-3 h-3" />
                Rollback Notes
              </p>
              <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">{remediation.rollbackNotes}</p>
            </div>
          )}

          {/* Action CTA for review approval */}
          {remediation.status === "pending_review" && (
            <div className="pt-3 border-t border-border flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">Action Required</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Review the proposed patch diff below. Clicking approve will create a new branch, commit the fixes, and open a Pull Request automatically on GitHub.
              </p>
              {approveError && (
                <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 p-2 rounded">{approveError}</p>
              )}
              <Button 
                onClick={handleApprove} 
                disabled={approving}
                className="w-full sm:w-auto bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold self-end"
              >
                {approving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                    Approve & Opening PR...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-1.5" />
                    Approve & Open PR
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }
}
