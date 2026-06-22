import { ShieldCheck, ShieldAlert, ShieldOff } from "lucide-react";
import { cn } from "@/lib/utils";

type Status = "secure" | "warning" | "critical";

export function StatusBadge({ status }: { status: Status }) {
  return (
    <div className={cn(
      "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold tracking-widest border",
      status === "critical" && "bg-red-500/10 border-red-500/30 text-red-400",
      status === "warning"  && "bg-amber-500/10 border-amber-500/30 text-amber-400",
      status === "secure"   && "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
    )}>
      {status === "critical" && <ShieldAlert className="w-3.5 h-3.5 animate-pulse" />}
      {status === "warning"  && <ShieldOff className="w-3.5 h-3.5" />}
      {status === "secure"   && <ShieldCheck className="w-3.5 h-3.5" />}
      <span className={status === "critical" ? "animate-pulse" : ""}>
        {status.toUpperCase()}
      </span>
    </div>
  );
}
