'use client';

import { useEffect, useState } from 'react';
import { use } from 'react';
import Link from 'next/link';
import { dashboardApi, type Incident, ApiError } from '@/lib/api';
import { ArrowLeft, ExternalLink, Clock, AlertTriangle, CheckCircle2, XCircle, Loader2, GitBranch, Terminal } from 'lucide-react';
import { relativeTime, cn } from '@/lib/utils';

const statusConfig = {
  Open:      { icon: AlertTriangle, color: 'text-red-400',    bg: 'bg-red-500/10'    },
  Analyzing: { icon: Loader2,       color: 'text-orange-400', bg: 'bg-orange-500/10' },
  Resolved:  { icon: CheckCircle2,  color: 'text-green-400',  bg: 'bg-green-500/10'  },
  Failed:    { icon: XCircle,       color: 'text-red-400',    bg: 'bg-red-500/10'    },
};

type TimelineItem = { from_status?: string; to_status: string; note?: string; occurred_at: string };
type IncidentDetail = Incident & { stack_trace?: string; ai_reasoning?: string };

export default function IncidentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [incident, setIncident] = useState<IncidentDetail | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    dashboardApi.getIncident(id)
      .then(({ incident: inc, timeline: tl }) => {
        setIncident(inc);
        setTimeline(tl);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load incident'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div className="py-12 flex justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-cyan-500/30 border-t-cyan-500 animate-spin" />
    </div>
  );

  if (error || !incident) return (
    <div className="py-12 text-center">
      <p className="text-red-400">{error || 'Incident not found'}</p>
      <Link href="/dashboard" className="text-cyan-400 text-sm mt-2 inline-block hover:underline">← Back to dashboard</Link>
    </div>
  );

  const cfg = statusConfig[incident.status] ?? statusConfig.Open;
  const Icon = cfg.icon;

  return (
    <div className="py-6 space-y-6 animate-fade-in">
      {/* Back */}
      <Link href="/dashboard" className="inline-flex items-center gap-2 text-slate-400 hover:text-white text-sm transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to dashboard
      </Link>

      {/* Header */}
      <div className="glass rounded-2xl p-6 border border-white/5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className={cn('inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border', cfg.bg, cfg.color, 'border-current/20')}>
                <Icon className={cn('w-3.5 h-3.5', incident.status === 'Analyzing' && 'animate-spin')} />
                {incident.status}
              </span>
              <span className="text-xs text-slate-500 font-mono bg-white/5 px-2 py-0.5 rounded">#{incident.id}</span>
            </div>
            <h1 className="text-xl font-bold text-white">{incident.issue_type ?? 'Unknown Issue'}</h1>
            <p className="text-slate-400 text-sm mt-1">
              Probe: <span className="font-mono text-slate-300">{incident.probe_id}</span>
              {' · '}
              <Clock className="w-3 h-3 inline mr-0.5" />
              {relativeTime(incident.created_at)}
            </p>
          </div>

          {incident.pr_url && (
            <a
              href={incident.pr_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20 font-semibold text-sm transition-all whitespace-nowrap"
            >
              <GitBranch className="w-4 h-4" />
              View AI Patch
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Stack trace */}
        {incident.stack_trace && (
          <div className="lg:col-span-3 glass rounded-2xl p-5 border border-white/5">
            <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2 mb-4">
              <Terminal className="w-4 h-4 text-cyan-400" />
              Stack Trace
            </h2>
            <pre className="text-xs text-slate-400 font-mono bg-black/30 rounded-xl p-4 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto">
              {incident.stack_trace}
            </pre>
          </div>
        )}

        {/* Timeline */}
        <div className={cn('glass rounded-2xl p-5 border border-white/5', incident.stack_trace ? 'lg:col-span-2' : 'lg:col-span-5')}>
          <h2 className="text-sm font-semibold text-slate-300 mb-4">Timeline</h2>
          <div className="relative space-y-0">
            {timeline.map((item, idx) => {
              const isLast = idx === timeline.length - 1;
              const itemCfg = statusConfig[item.to_status as keyof typeof statusConfig];
              const ItemIcon = itemCfg?.icon ?? Clock;
              return (
                <div key={idx} className="flex gap-3 pb-5 relative">
                  {!isLast && <div className="absolute left-3.5 top-7 bottom-0 w-px bg-white/5" />}
                  <div className={cn('w-7 h-7 rounded-full flex items-center justify-center shrink-0', itemCfg?.bg ?? 'bg-white/5')}>
                    <ItemIcon className={cn('w-3.5 h-3.5', itemCfg?.color ?? 'text-slate-400')} />
                  </div>
                  <div className="pt-0.5">
                    <p className={cn('text-xs font-semibold', itemCfg?.color ?? 'text-slate-400')}>
                      {item.from_status ? `${item.from_status} → ${item.to_status}` : item.to_status}
                    </p>
                    {item.note && <p className="text-xs text-slate-500 mt-0.5 break-all">{item.note}</p>}
                    <p className="text-xs text-slate-600 mt-0.5">{relativeTime(item.occurred_at)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Error message */}
      {incident.error_message && (
        <div className="glass rounded-2xl p-5 border border-red-500/20">
          <h2 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
            <XCircle className="w-4 h-4" />
            Remediation Error
          </h2>
          <p className="text-sm text-slate-300 font-mono bg-red-500/5 rounded-xl p-4">{incident.error_message}</p>
        </div>
      )}
    </div>
  );
}
