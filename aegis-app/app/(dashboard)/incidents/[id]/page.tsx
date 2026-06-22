"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  ArrowLeft, ExternalLink, Clock, AlertTriangle, CheckCircle2,
  XCircle, Loader2, GitBranch, Terminal, Brain, RotateCcw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, relativeTime } from "@/lib/utils";

const statusConfig = {
  open:      { icon: AlertTriangle, badge: "critical" as const  },
  analyzing: { icon: Loader2,       badge: "analyzing" as const },
  resolved:  { icon: CheckCircle2,  badge: "success" as const   },
  failed:    { icon: XCircle,       badge: "critical" as const  },
};

export default function IncidentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const { data, isLoading } = useQuery({
    queryKey: ["incident", id],
    queryFn: () => fetch(`/api/incidents/${id}`).then((r) => r.json()),
    refetchInterval: 3000,
  });

  const incident = data?.incident;
  const events = data?.events ?? [];
  const remediation = data?.remediation;

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
      <Link href="/incidents" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to incidents
      </Link>

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
                View AI Patch
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

      {/* AI Remediation */}
      {remediation && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Brain className="w-4 h-4 text-purple-400" />
              AI Remediation Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {remediation.confidenceScore != null && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-muted-foreground">Confidence Score</span>
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

            {remediation.targetFile && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Affected File</p>
                <code className="text-xs bg-muted px-2 py-1 rounded font-mono">{remediation.targetFile}</code>
              </div>
            )}

            {remediation.explanation && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">What was fixed</p>
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
    </div>
  );
}
