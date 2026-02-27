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
  return (
    <>
      <div className="mb-6 flex items-center gap-3">
        <select
          value={days}
          onChange={(e) => onDaysChange(parseInt(e.target.value, 10))}
          className="border border-gray-700 bg-black/50 px-3 py-2 text-sm text-white"
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
          className="gap-2 border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-white"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          Uppdatera
        </Button>
      </div>

      {stats && (
        <>
          <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            <StatCard icon={Eye} label="Sidvisningar" value={stats.totalPageViews} color="blue" />
            <StatCard
              icon={Users}
              label="Unika besökare"
              value={stats.uniqueVisitors}
              color="green"
            />
            <StatCard icon={Users} label="Registrerade" value={stats.totalUsers} color="purple" />
            <StatCard icon={FolderOpen} label="Projekt" value={stats.totalProjects} color="amber" />
            <StatCard icon={Wand2} label="Generationer" value={stats.totalGenerations} color="pink" />
            <StatCard icon={Coins} label="Förfiningar" value={stats.totalRefines} color="cyan" />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="border border-gray-800 bg-black/50 p-6">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
                <TrendingUp className="text-brand-teal h-5 w-5" />
                Dagliga besök
              </h2>
              <div className="flex h-64 items-end gap-1">
                {stats.dailyViews.length > 0 ? (
                  stats.dailyViews.slice(-14).map((day, i) => {
                    const maxViews = Math.max(...stats.dailyViews.map((d) => d.views));
                    const height = maxViews > 0 ? (day.views / maxViews) * 100 : 0;
                    return (
                      <div key={i} className="flex flex-1 flex-col items-center gap-1">
                        <div
                          className="bg-brand-teal/20 group relative w-full"
                          style={{
                            height: `${height}%`,
                            minHeight: "4px",
                          }}
                        >
                          <div
                            className="bg-brand-teal absolute bottom-0 w-full"
                            style={{
                              height: `${maxViews > 0 ? (day.unique / maxViews) * 100 : 0}%`,
                            }}
                          />
                          <div className="absolute -top-8 left-1/2 z-10 -translate-x-1/2 bg-gray-900 px-2 py-1 text-xs whitespace-nowrap text-white opacity-0 group-hover:opacity-100">
                            {day.views} visningar, {day.unique} unika
                          </div>
                        </div>
                        <span className="-rotate-45 text-[10px] text-gray-500">{day.date.slice(5)}</span>
                      </div>
                    );
                  })
                ) : (
                  <div className="flex flex-1 items-center justify-center text-gray-500">
                    Ingen data än
                  </div>
                )}
              </div>
            </div>

            <div className="border border-gray-800 bg-black/50 p-6">
              <h2 className="mb-4 text-lg font-semibold text-white">Populära sidor</h2>
              <div className="space-y-3">
                {stats.recentPageViews.length > 0 ? (
                  stats.recentPageViews.map((page, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between border-b border-gray-800 py-2 last:border-0"
                    >
                      <span className="max-w-[200px] truncate text-gray-300">{page.path}</span>
                      <span className="font-mono text-sm text-gray-500">{page.count}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500">Ingen data än</p>
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
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: string;
}) {
  const colors: Record<string, string> = {
    blue: "bg-brand-blue/10 text-brand-blue",
    green: "bg-brand-teal/10 text-brand-teal",
    purple: "bg-brand-blue/10 text-brand-blue",
    amber: "bg-brand-amber/10 text-brand-amber",
    pink: "bg-brand-warm/10 text-brand-warm",
    cyan: "bg-brand-teal/10 text-brand-teal",
  };

  return (
    <div className="border border-gray-800 bg-black/50 p-4">
      <div className={`h-10 w-10 ${colors[color]} mb-3 flex items-center justify-center`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-2xl font-bold text-white">{value.toLocaleString()}</p>
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}
