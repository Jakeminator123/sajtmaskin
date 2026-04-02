"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Globe, Check, AlertCircle } from "lucide-react";

type ScrapeStatus = "loading" | "done" | "error";

interface ScrapeProgressBarProps {
  status: ScrapeStatus;
  url?: string;
  title?: string;
}

export function ScrapeProgressBar({ status, url, title }: ScrapeProgressBarProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (status !== "loading") {
      setProgress(100);
      return;
    }

    setProgress(0);
    const stages = [
      { target: 15, delay: 200 },
      { target: 35, delay: 800 },
      { target: 55, delay: 1800 },
      { target: 72, delay: 3200 },
      { target: 85, delay: 5000 },
      { target: 92, delay: 7000 },
    ];

    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const { target, delay } of stages) {
      timers.push(setTimeout(() => setProgress(target), delay));
    }
    return () => timers.forEach(clearTimeout);
  }, [status]);

  const hostname = url ? (() => {
    try { return new URL(url.startsWith("http") ? url : `https://${url}`).hostname; } catch { return url; }
  })() : null;

  return (
    <div className="my-2 overflow-hidden rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm">
      <div className="flex items-center gap-3 px-4 py-3">
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors duration-500",
            status === "loading" && "bg-primary/10 text-primary",
            status === "done" && "bg-emerald-500/10 text-emerald-500",
            status === "error" && "bg-destructive/10 text-destructive",
          )}
        >
          {status === "loading" && <Globe className="h-4 w-4 animate-pulse" />}
          {status === "done" && <Check className="h-4 w-4" />}
          {status === "error" && <AlertCircle className="h-4 w-4" />}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {status === "loading" && "Analyserar din hemsida..."}
            {status === "done" && (title || "Analys klar!")}
            {status === "error" && "Kunde inte nå sidan"}
          </p>
          {hostname && (
            <p className="truncate text-xs text-muted-foreground">{hostname}</p>
          )}
        </div>

        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {progress}%
        </span>
      </div>

      <div className="h-1 w-full bg-muted/40">
        <div
          className={cn(
            "h-full transition-all duration-700 ease-out",
            status === "loading" && "bg-primary",
            status === "done" && "bg-emerald-500",
            status === "error" && "bg-destructive",
          )}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
