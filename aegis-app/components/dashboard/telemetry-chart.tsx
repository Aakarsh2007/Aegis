"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";

interface MetricPoint {
  cpuUsage: number;
  memoryUsage: number;
  timestamp: string | Date | null;
}

interface Props { metrics: MetricPoint[] }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs space-y-1 shadow-lg">
      <p className="text-muted-foreground font-mono">{label}</p>
      {payload.map((p: { name: string; value: number; color: string }) => (
        <div key={p.name} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-bold" style={{ color: p.color }}>{p.value.toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );
};

export function TelemetryChart({ metrics }: Props) {
  const data = metrics.map((m) => ({
    time: m.timestamp ? new Date(m.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "",
    CPU: parseFloat(m.cpuUsage.toFixed(1)),
    RAM: parseFloat(m.memoryUsage.toFixed(1)),
  }));

  if (data.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2">
        <div className="w-2 h-2 rounded-full bg-primary/40 animate-pulse" />
        <p className="text-sm text-muted-foreground">Waiting for telemetry…</p>
        <p className="text-xs text-muted-foreground/60">Deploy the Aegis probe to start monitoring</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="time" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontFamily: "monospace" }} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} interval="preserveStartEnd" />
        <YAxis domain={[0, 100]} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine y={80} stroke="hsl(var(--destructive)/0.4)" strokeDasharray="4 4" />
        <ReferenceLine y={90} stroke="hsl(var(--destructive)/0.6)" strokeDasharray="4 4" />
        <Line type="monotone" dataKey="CPU" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} activeDot={{ r: 3, strokeWidth: 0 }} />
        <Line type="monotone" dataKey="RAM" stroke="#a855f7" strokeWidth={2} dot={false} activeDot={{ r: 3, strokeWidth: 0 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
