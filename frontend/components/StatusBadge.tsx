'use client';

import { cn, computeStatus } from '@/lib/utils';
import { ShieldCheck, ShieldAlert } from 'lucide-react';

interface Props {
  incidents: Array<{ status: string }>;
  className?: string;
}

export default function StatusBadge({ incidents, className }: Props) {
  const status = computeStatus(incidents);
  const isCritical = status === 'CRITICAL';

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold tracking-widest border transition-all duration-500',
        isCritical
          ? 'bg-red-500/10 border-red-500/40 text-red-400 glow-red'
          : 'bg-green-500/10 border-green-500/40 text-green-400 glow-green',
        className
      )}
    >
      {isCritical ? (
        <>
          <ShieldAlert className="w-3.5 h-3.5 animate-pulse" />
          <span className="animate-pulse">CRITICAL</span>
        </>
      ) : (
        <>
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>SECURE</span>
        </>
      )}
    </div>
  );
}
