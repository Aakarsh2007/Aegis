'use client';

import { useEffect, useState, useCallback } from 'react';
import { dashboardApi, type DashboardData } from '@/lib/api';
import TelemetryChart from '@/components/TelemetryChart';
import IncidentCard from '@/components/IncidentCard';
import ProbeStatusList from '@/components/ProbeStatusList';
import StatusBadge from '@/components/StatusBadge';
import { Activity, Radio, AlertTriangle, RefreshCw, ArrowRight } from 'lucide-react';
import Link from 'next/link';

const EMPTY: DashboardData = { metrics: [], incidents: [], probes: [] };

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const d = await dashboardApi.get();
      setData(d);
      setLastUpdated(new Date());
      setError('');
    } catch {
      setError('Failed to fetch dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const latestCpu = data.metrics.at(-1)?.cpu_usage ?? 0;
  const latestRam = data.metrics.at(-1)?.memory_usage ?? 0;
  const openIncidents = data.incidents.filter((i) => i.status === 'Open' || i.status === 'Analyzing').length;

  return (
    <div className="py-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Command Center</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Real-time infrastructure intelligence
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge incidents={data.incidents} />
          {lastUpdated && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <RefreshCw className="w-3 h-3 animate-spin-slow" />
              {lastUpdated.toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="CPU Usage"
          value={`${latestCpu.toFixed(1)}%`}
          sublabel={latestCpu > 80 ? 'Above threshold' : 'Normal'}
          alert={latestCpu > 80}
          icon={<Activity className="w-5 h-5 text-cyan-400" />}
          color="cyan"
        />
        <StatCard
          label="Memory Usage"
          value={`${latestRam.toFixed(1)}%`}
          sublabel={latestRam > 90 ? 'Above threshold' : 'Normal'}
          alert={latestRam > 90}
          icon={<Radio className="w-5 h-5 text-purple-400" />}
          color="purple"
        />
        <StatCard
          label="Active Incidents"
          value={String(openIncidents)}
          sublabel={`${data.probes.filter(p => p.status === 'online').length} probes online`}
          alert={openIncidents > 0}
          icon={<AlertTriangle className="w-5 h-5 text-orange-400" />}
          color="orange"
        />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Telemetry chart */}
        <div className="xl:col-span-2 glass rounded-2xl p-6 glow-cyan border border-white/5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              Live Telemetry
            </h2>
            <span className="flex items-center gap-1.5 text-xs text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              2s refresh
            </span>
          </div>
          <div className="h-72">
            {loading ? (
              <div className="h-full flex items-center justify-center">
                <div className="w-8 h-8 rounded-full border-2 border-cyan-500/30 border-t-cyan-500 animate-spin" />
              </div>
            ) : (
              <TelemetryChart metrics={data.metrics} />
            )}
          </div>
        </div>

        {/* Probe status */}
        <div className="glass rounded-2xl p-6 border border-white/5">
          <h2 className="text-base font-semibold text-white flex items-center gap-2 mb-5">
            <Radio className="w-4 h-4 text-purple-400" />
            Probes
            <span className="ml-auto text-xs text-slate-500">{data.probes.length} total</span>
          </h2>
          <ProbeStatusList probes={data.probes} />
        </div>
      </div>

      {/* Incident feed */}
      <div className="glass rounded-2xl p-6 border border-white/5">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-orange-400" />
            Recent Incidents
            {openIncidents > 0 && (
              <span className="text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30 rounded-full px-2 py-0.5 animate-pulse">
                {openIncidents} active
              </span>
            )}
          </h2>
        </div>

        {data.incidents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <div className="w-12 h-12 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-green-400" />
            </div>
            <p className="text-slate-400 text-sm font-medium">All systems normal</p>
            <p className="text-slate-600 text-xs">No incidents detected</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {data.incidents.map((incident) => (
              <IncidentCard key={incident.id} incident={incident} />
            ))}
          </div>
        )}

        {data.incidents.length > 0 && (
          <div className="mt-4 flex justify-end">
            <Link
              href="/incidents"
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-cyan-400 transition-colors"
            >
              View all incidents <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label, value, sublabel, alert, icon, color,
}: {
  label: string;
  value: string;
  sublabel: string;
  alert: boolean;
  icon: React.ReactNode;
  color: 'cyan' | 'purple' | 'orange';
}) {
  const colorMap = {
    cyan:   { bg: 'bg-cyan-500/10',   border: alert ? 'border-cyan-500/40' : 'border-white/5',   text: 'text-cyan-400'   },
    purple: { bg: 'bg-purple-500/10', border: alert ? 'border-purple-500/40' : 'border-white/5', text: 'text-purple-400' },
    orange: { bg: 'bg-orange-500/10', border: alert ? 'border-red-500/40 glow-red' : 'border-white/5', text: 'text-orange-400' },
  };
  const c = colorMap[color];

  return (
    <div className={`glass rounded-2xl p-5 border ${c.border} transition-all`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">{label}</p>
          <p className={`text-3xl font-bold ${alert ? c.text : 'text-white'}`}>{value}</p>
          <p className={`text-xs mt-1 ${alert ? c.text : 'text-slate-500'}`}>{sublabel}</p>
        </div>
        <div className={`p-2.5 rounded-xl ${c.bg}`}>{icon}</div>
      </div>
    </div>
  );
}
