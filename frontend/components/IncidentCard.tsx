'use client';

import Link from 'next/link';
import { ExternalLink, AlertTriangle, CheckCircle2, XCircle, Loader2, Clock } from 'lucide-react';
import { cn, relativeTime } from '@/lib/utils';
import type { Incident } from '@/lib/api';

const statusConfig = {
  Open:      { icon: AlertTriangle, color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/30',    label: 'Open'      },
  Analyzing: { icon: Loader2,       color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30', label: 'Analyzing' },
  Resolved:  { icon: CheckCircle2,  color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/30',  label: 'Resolved'  },
  Failed:    { icon: XCircle,       color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/30',    label: 'Failed'    },
};

interface Props {
  incident: Incident;
}

export default function IncidentCard({ incident }: Props) {
  const cfg = statusConfig[incident.status] ?? statusConfig.Open;
  const Icon = cfg.icon;
  const isAnalyzing = incident.status === 'Analyzing';

  return (
    <div className={cn(
      'relative glass rounded-xl p-4 border transition-all duration-300 hover:border-white/20 animate-slide-up',
      incident.status === 'Open' || isAnalyzing ? 'border-red-500/20' : 'border-white/5'
    )}>
      {/* Status indicator strip */}
      <div className={cn(
        'absolute left-0 top-3 bottom-3 w-0.5 rounded-full',
        cfg.color.replace('text-', 'bg-')
      )} />

      <div className="pl-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={cn(
                'inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full border',
                cfg.bg, cfg.border, cfg.color
              )}>
                <Icon className={cn('w-3 h-3', isAnalyzing && 'animate-spin')} />
                {cfg.label}
              </span>
              <span className="text-xs text-slate-500 font-mono">#{incident.id.slice(0, 8)}</span>
            </div>

            <p className="text-sm font-medium text-slate-200 truncate">
              {incident.issue_type ?? 'Unknown issue'}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Probe: <span className="text-slate-400 font-mono">{incident.probe_id}</span>
            </p>
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <Clock className="w-3 h-3" />
              {relativeTime(incident.created_at)}
            </div>
          </div>
        </div>

        {/* Action row */}
        <div className="mt-3 flex items-center gap-2">
          {incident.status === 'Resolved' && incident.pr_url && (
            <a
              href={incident.pr_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              VIEW AI PATCH
            </a>
          )}

          {isAnalyzing && (
            <span className="inline-flex items-center gap-1.5 text-xs text-orange-400 bg-orange-500/10 border border-orange-500/20 px-3 py-1.5 rounded-lg">
              <Loader2 className="w-3 h-3 animate-spin" />
              AI generating fix...
            </span>
          )}

          {incident.status === 'Failed' && (
            <span className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-lg truncate max-w-[200px]" title={incident.error_message}>
              {incident.error_message?.slice(0, 50) ?? 'Remediation failed'}
            </span>
          )}

          <Link
            href={`/incidents/${incident.id}`}
            className="ml-auto text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            Details →
          </Link>
        </div>
      </div>
    </div>
  );
}
