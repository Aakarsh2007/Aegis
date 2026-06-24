import Link from "next/link";
import { AlertTriangle, CheckCircle2, XCircle, Loader2, Clock, ExternalLink, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, relativeTime } from "@/lib/utils";

interface Incident {
  id: string;
  status: string;
  severity: string;
  title: string | null;
  probeId: string;
  prUrl: string | null;
  errorMessage: string | null;
  createdAt: Date | string | null;
  aiConfidenceScore: number | null;
}

const statusConfig = {
  open:      { icon: AlertTriangle, badge: "critical" as const,  label: "Open"      },
  analyzing: { icon: Loader2,       badge: "analyzing" as const, label: "Analyzing" },
  resolved:  { icon: CheckCircle2,  badge: "success" as const,   label: "Resolved"  },
  failed:    { icon: XCircle,       badge: "critical" as const,  label: "Failed"    },
  ignored:   { icon: XCircle,       badge: "secondary" as const, label: "Ignored"   },
};

export function IncidentCard({ incident, onDelete }: { incident: Incident; onDelete?: () => void }) {
  const cfg = statusConfig[incident.status as keyof typeof statusConfig] ?? statusConfig.open;
  const Icon = cfg.icon;
  const isAnalyzing = incident.status === "analyzing";

  return (
    <div className={cn(
      "rounded-xl border bg-card p-4 transition-all hover:border-border/80 animate-slide-up",
      (incident.status === "open" || isAnalyzing) && "border-destructive/20"
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <Badge variant={cfg.badge}>
              <Icon className={cn("w-3 h-3 mr-1", isAnalyzing && "animate-spin")} />
              {cfg.label}
            </Badge>
            <span className="text-xs text-muted-foreground font-mono">#{incident.id.slice(0, 8)}</span>
          </div>
          <p className="text-sm font-medium truncate">{incident.title ?? "Unknown issue"}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Probe: <span className="font-mono">{incident.probeId}</span>
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            {relativeTime(incident.createdAt)}
          </div>
          {/* Delete button */}
          {onDelete && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(); }}
              className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              title="Delete incident"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Confidence score */}
      {incident.aiConfidenceScore != null && (
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
            <div
              className={cn("h-full rounded-full", incident.aiConfidenceScore > 0.7 ? "bg-emerald-500" : incident.aiConfidenceScore > 0.4 ? "bg-amber-500" : "bg-red-500")}
              style={{ width: `${incident.aiConfidenceScore * 100}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground">{(incident.aiConfidenceScore * 100).toFixed(0)}% conf</span>
        </div>
      )}

      {/* Actions */}
      <div className="mt-3 flex items-center gap-2">
        {incident.status === "resolved" && incident.prUrl && (
          <a href={incident.prUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-colors">
            <ExternalLink className="w-3 h-3" />
            VIEW PATCH
          </a>
        )}
        {isAnalyzing && (
          <span className="inline-flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-md">
            <Loader2 className="w-3 h-3 animate-spin" />
            AI fixing…
          </span>
        )}
        <Link href={`/incidents/${incident.id}`} className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors">
          Details →
        </Link>
      </div>
    </div>
  );
}
