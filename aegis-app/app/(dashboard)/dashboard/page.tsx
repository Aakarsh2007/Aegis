"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, Radio, AlertTriangle, RefreshCw, Cpu, MemoryStick } from "lucide-react";
import { TelemetryChart } from "@/components/dashboard/telemetry-chart";
import { IncidentCard } from "@/components/dashboard/incident-card";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { computeStatus, relativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface DashboardData {
  metrics: Array<{ cpuUsage: number; memoryUsage: number; timestamp: string }>;
  incidents: Array<{
    id: string; status: string; severity: string; title: string | null;
    probeId: string; prUrl: string | null; errorMessage: string | null;
    createdAt: string; aiConfidenceScore: number | null;
  }>;
  probes: Array<{ probeId: string; status: string; lastSeen: string | null }>;
  stats: { latestCpu: number; latestMem: number; openIncidents: number; probesOnline: number; totalProbes: number };
}

export default function DashboardPage() {
  const { data, isLoading, dataUpdatedAt } = useQuery<DashboardData>({
    queryKey: ["dashboard"],
    queryFn: () => fetch("/api/dashboard").then((r) => r.json()),
    refetchInterval: 2000,
  });

  const status = computeStatus(
    data?.stats.latestCpu ?? 0,
    data?.stats.latestMem ?? 0,
    data?.stats.openIncidents ?? 0
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Command Center</h1>
          <p className="text-sm text-muted-foreground">Real-time infrastructure intelligence</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={status} />
          {dataUpdatedAt > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <RefreshCw className="w-3 h-3 animate-spin-slow" />
              {new Date(dataUpdatedAt).toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="CPU Usage" value={isLoading ? null : `${(data?.stats.latestCpu ?? 0).toFixed(1)}%`}
          sublabel={(data?.stats.latestCpu ?? 0) > 80 ? "Above threshold" : "Normal"}
          alert={(data?.stats.latestCpu ?? 0) > 80}
          icon={<Cpu className="w-4 h-4 text-primary" />} />
        <StatCard label="Memory" value={isLoading ? null : `${(data?.stats.latestMem ?? 0).toFixed(1)}%`}
          sublabel={(data?.stats.latestMem ?? 0) > 90 ? "Above threshold" : "Normal"}
          alert={(data?.stats.latestMem ?? 0) > 90}
          icon={<MemoryStick className="w-4 h-4 text-purple-400" />} />
        <StatCard label="Incidents" value={isLoading ? null : String(data?.stats.openIncidents ?? 0)}
          sublabel="active right now"
          alert={(data?.stats.openIncidents ?? 0) > 0}
          icon={<AlertTriangle className="w-4 h-4 text-amber-400" />} />
        <StatCard label="Probes" value={isLoading ? null : `${data?.stats.probesOnline ?? 0}/${data?.stats.totalProbes ?? 0}`}
          sublabel="online"
          alert={false}
          icon={<Radio className="w-4 h-4 text-emerald-400" />} />
      </div>

      {/* Chart + probes */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="w-4 h-4 text-primary" />
              Live Telemetry
              <span className="ml-auto flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                2s refresh
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {isLoading ? (
                <div className="h-full flex items-center justify-center">
                  <div className="w-6 h-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                </div>
              ) : (
                <TelemetryChart metrics={data?.metrics ?? []} />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Probes */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Radio className="w-4 h-4 text-purple-400" />
              Probes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)
            ) : data?.probes.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-muted-foreground">No probes registered</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Go to Probes → Create probe</p>
              </div>
            ) : data?.probes.map((p) => (
              <div key={p.probeId} className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2.5">
                  <div className="relative">
                    <div className={cn("w-2 h-2 rounded-full", p.status === "online" ? "bg-emerald-500" : "bg-muted-foreground")} />
                    {p.status === "online" && <div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-500 animate-ping opacity-75" />}
                  </div>
                  <div>
                    <p className="text-xs font-mono font-medium">{p.probeId}</p>
                    <p className="text-[10px] text-muted-foreground">{p.lastSeen ? relativeTime(p.lastSeen) : "Never"}</p>
                  </div>
                </div>
                <span className={cn("text-xs font-medium", p.status === "online" ? "text-emerald-400" : "text-muted-foreground")}>
                  {p.status === "online" ? "Online" : "Offline"}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Incidents */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            Recent Incidents
            {(data?.stats.openIncidents ?? 0) > 0 && (
              <span className="text-xs font-bold bg-red-500/15 text-red-400 border border-red-500/20 rounded-full px-2 py-0.5 animate-pulse">
                {data?.stats.openIncidents} active
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
            </div>
          ) : data?.incidents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-emerald-400" />
              </div>
              <p className="text-sm text-muted-foreground font-medium">All systems normal</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {data?.incidents.map((incident) => (
                <IncidentCard key={incident.id} incident={incident} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, sublabel, alert, icon }: {
  label: string; value: string | null; sublabel: string; alert: boolean; icon: React.ReactNode;
}) {
  return (
    <Card className={cn("transition-all", alert && "border-destructive/30")}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">{label}</p>
            {value === null ? (
              <Skeleton className="h-7 w-16 mb-1" />
            ) : (
              <p className={cn("text-2xl font-bold", alert ? "text-destructive" : "text-foreground")}>{value}</p>
            )}
            <p className={cn("text-xs mt-0.5", alert ? "text-destructive/70" : "text-muted-foreground")}>{sublabel}</p>
          </div>
          <div className="p-2 rounded-lg bg-muted">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}
