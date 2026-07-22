"use client"

import { landingJourneySteps } from "@/components/landing-v2/landing-chat-data"
import { usePrefersReducedMotion } from "@/components/landing-v2/landing-hooks"

export function HowItWorksFallback() {
  const reduceMotion = usePrefersReducedMotion()
  const pulse = reduceMotion ? "" : "animate-pulse"

  return (
    <div className="rounded-[32px] border border-border/20 bg-card/30 p-5 md:p-6 shadow-[0_24px_80px_rgba(6,10,20,0.28)]">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,420px)]">
        <div className="relative overflow-hidden rounded-[28px] border border-border/20 bg-secondary/20 min-h-[420px]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_32%,rgba(45,212,191,0.16),transparent_52%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent_40%,rgba(34,197,94,0.04)_100%)]" />
          {/* Browser-mockup (speglar "AI bygger sajten"-stadiet) */}
          <div className="absolute left-1/2 top-1/2 w-[62%] max-w-[320px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-primary/25 bg-background/60 shadow-[0_20px_60px_rgba(6,10,20,0.35)] backdrop-blur-sm">
            <div className="flex items-center gap-1.5 border-b border-border/20 bg-secondary/40 px-3 py-2">
              <span className="h-2 w-2 rounded-full bg-destructive/60" />
              <span className="h-2 w-2 rounded-full bg-chart-4/60" />
              <span className="h-2 w-2 rounded-full bg-primary/60" />
            </div>
            <div className="space-y-2.5 p-4">
              <div className={`h-3 w-2/3 rounded-full bg-primary/40 ${pulse}`} />
              <div className={`h-2.5 w-full rounded-full bg-foreground/10 ${pulse}`} />
              <div className={`h-2.5 w-5/6 rounded-full bg-foreground/10 ${pulse}`} />
              <div className="flex gap-2 pt-1">
                <div className={`h-10 flex-1 rounded-lg border border-border/20 bg-secondary/30 ${pulse}`} />
                <div className={`h-10 flex-1 rounded-lg border border-primary/20 bg-primary/5 ${pulse}`} />
              </div>
            </div>
          </div>
          <div className="absolute inset-x-10 bottom-10 h-px bg-linear-to-r from-transparent via-primary/35 to-transparent" />
        </div>

        <div className="space-y-3">
          {landingJourneySteps.map((step) => (
            <div key={step.number} className="rounded-2xl border border-border/15 bg-secondary/20 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-sm font-(--font-heading) text-primary">
                  {step.number}
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-(--font-heading) text-foreground">{step.title}</p>
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
