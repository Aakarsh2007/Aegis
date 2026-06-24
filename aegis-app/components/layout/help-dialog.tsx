"use client";

import { useState } from "react";
import { HelpCircle, Shield, Scan, Cpu, GitBranch, AlertTriangle, Key, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const sections = [
  {
    icon: Shield,
    color: "text-primary",
    title: "What is Aegis?",
    content:
      "Aegis is an autonomous SRE platform. It finds bugs in your code using AI and automatically opens GitHub Pull Requests with fixes — without you having to do anything.",
  },
  {
    icon: Scan,
    color: "text-purple-400",
    title: "AI Repository Scanner",
    content:
      "Go to Repositories → connect a repo → click Scan. Aegis fetches your source files, sends them to Gemini AI, finds bugs, memory leaks and security issues, then opens PRs with patches. No crash needed.",
  },
  {
    icon: Cpu,
    color: "text-amber-400",
    title: "Live Probe (Linux/WSL)",
    content:
      "Compile main.cpp on a Linux server. Run the probe with your API key pointing at this app. It monitors CPU, RAM, disk and log files in real time. When a crash happens, Aegis detects it and opens a PR automatically.",
  },
  {
    icon: GitBranch,
    color: "text-emerald-400",
    title: "Repositories",
    content:
      "Connect any GitHub repo you have write access to. Aegis needs your GitHub Personal Access Token (repo scope) in Settings to fetch files and create PRs.",
  },
  {
    icon: AlertTriangle,
    color: "text-red-400",
    title: "Incidents",
    content:
      "Every issue found — by scan or live probe — becomes an Incident. Each one shows the AI confidence score, affected file, explanation, and a link to the GitHub PR with the fix.",
  },
  {
    icon: Key,
    color: "text-cyan-400",
    title: "Required Setup",
    content:
      "Settings → add your GitHub token (ghp_... with repo scope). Optionally add your own Gemini key. For Slack/Discord alerts, add webhook URLs.",
  },
];

export function HelpDialog() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-all border border-transparent hover:border-border"
        title="Help & Guide"
      >
        <HelpCircle className="w-3.5 h-3.5" />
        Help
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              Aegis — How it works
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {sections.map(({ icon: Icon, color, title, content }) => (
              <div key={title} className="flex gap-3">
                <div className="mt-0.5 shrink-0">
                  <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center">
                    <Icon className={`w-3.5 h-3.5 ${color}`} />
                  </div>
                </div>
                <div>
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {content}
                  </p>
                </div>
              </div>
            ))}

            {/* Quick start */}
            <div className="rounded-xl bg-primary/5 border border-primary/20 p-4 space-y-2">
              <p className="text-sm font-semibold text-primary">Quick start (2 minutes)</p>
              <ol className="text-xs text-muted-foreground space-y-1.5 list-none">
                {[
                  "Go to Settings → add your GitHub token",
                  "Go to Repositories → connect a repo",
                  "Click Scan for issues",
                  "Check Incidents for AI findings + PR links",
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-0.5 flex items-center justify-center w-4 h-4 rounded-full bg-primary/20 text-primary font-bold text-[10px] shrink-0">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>

            {/* Links */}
            <div className="flex gap-3">
              <a
                href="https://github.com/Aakarsh2007/Aegis"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                GitHub repo & full docs
              </a>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
