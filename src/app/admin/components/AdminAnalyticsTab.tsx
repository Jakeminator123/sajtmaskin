"use client";

import {
  Coins,
  Eye,
  FolderOpen,
  RefreshCw,
  TrendingUp,
  Users,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AnalyticsStats } from "./types";

interface AdminAnalyticsTabProps {
  days: number;
  onDaysChange: (days: number) => void;
  isLoading: boolean;
  stats: AnalyticsStats | null;
  onRefresh: () => void | Promise<void>;
}

export function AdminAnalyticsTab({
  days,
  onDaysChange,
  isLoading,
  stats,
  onRefresh,
}: AdminAnalyticsTabProps) {
  const periodLabel = `senaste ${stats?.days ?? days} dagar`;
  const scopeLabel = (scope: "period" | "all_time") =>
    scope === "period" ? periodLabel : "all-time";

  return (
    <>
      <div className="mb-6 flex items-center gap-3">
        <select
          value={days}
          onChange={(e) => onDaysChange(parseInt(e.target.value, 10))}
          className="border border-border bg-card px-3 py-2 text-sm text-foreground"
        >
          <option value={7}>7 dagar</option>
          <option value={30}>30 dagar</option>
          <option value={90}>90 dagar</option>
          <option value={365}>1 år</option>
        </select>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void onRefresh()}
          disabled={isLoading}
          className="gap-2 border-border text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          Uppdatera
        </Button>
      </div>

      {stats && (
        <>
          <div className="mb-4 rounded border border-border bg-muted/50 p-4 text-sm text-muted-foreground">
            Visar perioddata för <span className="text-foreground">{periodLabel}</span>.{" "}
            Gäst-generationer och gäst-förfiningar visas tills vidare som{" "}
            <span className="text-foreground">all-time</span>, eftersom nuvarande datamodell lagrar
            ackumulerade räknare per session och inte säkra tidsserier per körning.
          </div>
          <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            <StatCard
              icon={Eye}
              label="Sidvisningar"
              value={stats.totalPageViews}
              color="blue"
              scopeLabel={scopeLabel(stats.metricScopes.totalPageViews)}
            />
            <StatCard
              icon={Users}
              label="Unika besökare"
              value={stats.uniqueVisitors}
              color="green"
              scopeLabel={scopeLabel(stats.metricScopes.uniqueVisitors)}
            />
            <StatCard
              icon={Users}
              label="Nya användare"
              value={stats.totalUsers}
              color="purple"
              scopeLabel={scopeLabel(stats.metricScopes.totalUsers)}
            />
            <StatCard
              icon={FolderOpen}
              label="Nya projekt"
              value={stats.totalProjects}
              color="amber"
              scopeLabel={scopeLabel(stats.metricScopes.totalProjects)}
            />
            <StatCard
              icon={Wand2}
              label="Gäst-generationer"
              value={stats.totalGenerations}
              color="pink"
              scopeLabel={scopeLabel(stats.metricScopes.totalGenerations)}
            />
            <StatCard
              icon={Coins}
              label="Gäst-förfiningar"
              value={stats.totalRefines}
              color="cyan"
              scopeLabel={scopeLabel(stats.metricScopes.totalRefines)}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="border border-border bg-card p-6">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
                <TrendingUp className="text-primary h-5 w-5" />
                Dagliga besök ({periodLabel})
              </h2>
              <div className="flex h-64 items-end gap-1">
                {stats.dailyViews.length > 0 ? (
                  stats.dailyViews.slice(-14).map((day, i) => {
                    const maxViews = Math.max(...stats.dailyViews.map((d) => d.views));
                    const height = maxViews > 0 ? (day.views / maxViews) * 100 : 0;
                    return (
                      <div key={i} className="flex flex-1 flex-col items-center gap-1">
                        <div
                          className="bg-primary/20 group relative w-full"
                          style={{
                            height: `${height}%`,
                            minHeight: "4px",
                          }}
                        >
                          <div
                            className="bg-primary absolute bottom-0 w-full"
                            style={{
                              height: `${maxViews > 0 ? (day.unique / maxViews) * 100 : 0}%`,
                            }}
                          />
                          <div className="absolute -top-8 left-1/2 z-10 -translate-x-1/2 bg-card px-2 py-1 text-xs whitespace-nowrap text-foreground opacity-0 group-hover:opacity-100">
                            {day.views} visningar, {day.unique} unika
                          </div>
                        </div>
                        <span className="-rotate-45 text-[10px] text-muted-foreground">{day.date.slice(5)}</span>
                      </div>
                    );
                  })
                ) : (
                  <div className="flex flex-1 items-center justify-center text-muted-foreground">
                    Ingen data än
                  </div>
                )}
              </div>
            </div>

            <div className="border border-border bg-card p-6">
              <h2 className="mb-4 text-lg font-semibold text-foreground">Populära sidor ({periodLabel})</h2>
              <div className="space-y-3">
                {stats.recentPageViews.length > 0 ? (
                  stats.recentPageViews.map((page, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between border-b border-border py-2 last:border-0"
                    >
                      <span className="max-w-[200px] truncate text-foreground">{page.path}</span>
                      <span className="font-mono text-sm text-muted-foreground">{page.count}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground">Ingen data än</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  scopeLabel,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: string;
  scopeLabel: string;
}) {
  const colors: Record<string, string> = {
    blue: "bg-brand-blue/10 text-brand-blue",
    green: "bg-primary/10 text-primary",
    purple: "bg-brand-blue/10 text-brand-blue",
    amber: "bg-brand-amber/10 text-brand-amber",
    pink: "bg-brand-warm/10 text-brand-warm",
    cyan: "bg-primary/10 text-primary",
  };

  return (
    <div className="border border-border bg-card p-4">
      <div className={`h-10 w-10 ${colors[color]} mb-3 flex items-center justify-center`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-2xl font-bold text-foreground">{value.toLocaleString()}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">{scopeLabel}</p>
    </div>
  );
}
