'use client';

import { cn, relativeTime } from '@/lib/utils';
import { Cpu, Wifi, WifiOff } from 'lucide-react';
import type { ProbeStatus } from '@/lib/api';

interface Props {
  probes: ProbeStatus[];
}

export default function ProbeStatusList({ probes }: Props) {
  if (probes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-2">
        <Cpu className="w-8 h-8 text-slate-600" />
        <p className="text-slate-500 text-sm">No probes registered</p>
        <p className="text-slate-600 text-xs">Install the Aegis probe on your servers</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {probes.map((probe) => {
        const online = probe.status === 'online';
        return (
          <div
            key={probe.probe_id}
            className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/3 border border-white/5 hover:border-white/10 transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className={cn(
                  'w-2.5 h-2.5 rounded-full',
                  online ? 'bg-green-400' : 'bg-slate-600'
                )} />
                {online && (
                  <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-green-400 animate-ping opacity-75" />
                )}
              </div>
              <div>
                <p className="text-sm font-mono font-medium text-slate-200">{probe.probe_id}</p>
                <p className="text-xs text-slate-500">
                  {probe.last_seen ? relativeTime(probe.last_seen) : 'Never seen'}
                </p>
              </div>
            </div>
            <div className={cn(
              'flex items-center gap-1.5 text-xs font-medium',
              online ? 'text-green-400' : 'text-slate-500'
            )}>
              {online ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              {online ? 'Online' : 'Offline'}
            </div>
          </div>
        );
      })}
    </div>
  );
}
