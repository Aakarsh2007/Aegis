'use client';

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';
import type { MetricPoint } from '@/lib/api';

interface Props {
  metrics: MetricPoint[];
}

const CustomTooltip = ({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass rounded-xl px-4 py-3 text-xs space-y-1.5 border border-white/10">
      <p className="text-slate-400 font-mono">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-slate-300">{p.name}:</span>
          <span className="font-bold" style={{ color: p.color }}>{p.value.toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );
};

export default function TelemetryChart({ metrics }: Props) {
  const data = metrics.map((m) => ({
    time: new Date(m.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    CPU: parseFloat(m.cpu_usage.toFixed(1)),
    RAM: parseFloat(m.memory_usage.toFixed(1)),
  }));

  if (data.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3">
        <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
          <div className="w-3 h-3 rounded-full bg-cyan-500/40 animate-pulse" />
        </div>
        <p className="text-slate-500 text-sm">Waiting for telemetry data...</p>
        <p className="text-slate-600 text-xs">Deploy the Aegis probe to start monitoring</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
        <XAxis
          dataKey="time"
          tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'monospace' }}
          tickLine={false}
          axisLine={{ stroke: 'rgba(255,255,255,0.05)' }}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fill: '#64748b', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: 12, color: '#94a3b8' }}
          iconType="circle"
          iconSize={8}
        />
        <ReferenceLine y={80} stroke="rgba(251,146,60,0.3)" strokeDasharray="4 4" label={{ value: 'CPU threshold', fill: 'rgba(251,146,60,0.5)', fontSize: 10 }} />
        <ReferenceLine y={90} stroke="rgba(248,113,113,0.3)" strokeDasharray="4 4" label={{ value: 'RAM threshold', fill: 'rgba(248,113,113,0.5)', fontSize: 10 }} />
        <Line
          type="monotone"
          dataKey="CPU"
          stroke="#22d3ee"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: '#22d3ee', strokeWidth: 0 }}
        />
        <Line
          type="monotone"
          dataKey="RAM"
          stroke="#a855f7"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: '#a855f7', strokeWidth: 0 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
