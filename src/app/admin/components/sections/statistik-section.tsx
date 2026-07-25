"use client";

import { useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Coins, Eye, FolderOpen, Link2, MousePointerClick, Users, Wand2 } from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminResource } from "../../lib/use-admin-resource";
import {
  DataState,
  RefreshButton,
  SectionCard,
  StatCard,
  formatCount,
  toCount,
} from "../ui-bits";
import type { AnalyticsStats } from "../types";

const PERIODS = [
  { value: "7", label: "Senaste 7 dagarna" },
  { value: "30", label: "Senaste 30 dagarna" },
  { value: "90", label: "Senaste 90 dagarna" },
  { value: "365", label: "Senaste året" },
];

const chartConfig = {
  views: { label: "Sidvisningar", color: "hsl(var(--primary))" },
  unique: { label: "Unika besökare", color: "hsl(var(--accent))" },
} satisfies ChartConfig;

export function StatistikSection() {
  const [days, setDays] = useState("30");

  const { data, loading, error, reload } = useAdminResource<AnalyticsStats, { stats: AnalyticsStats }>(
    `/api/analytics?days=${days}`,
    {
      select: (json) => json.stats,
      errorMessage: "Kunde inte hämta statistiken",
    },
  );

  const periodLabel = `senaste ${data?.days ?? Number(days)} dagarna`;
  const scopeHint = (scope: "period" | "all_time") =>
    scope === "period" ? periodLabel : "totalt sedan start";

  // Coerce before charting: the counters arrive as strings from Postgres, and
  // recharts needs real numbers to scale the axis.
  const chartData = (data?.dailyViews ?? []).slice(-30).map((day) => ({
    date: day.date,
    label: day.date.slice(5),
    views: toCount(day.views),
    unique: toCount(day.unique),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-56" aria-label="Välj period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODS.map((period) => (
              <SelectItem key={period.value} value={period.value}>
                {period.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <RefreshButton onClick={() => void reload()} loading={loading} />
      </div>

      <DataState
        loading={loading && !data}
        error={error}
        isEmpty={!data}
        onRetry={() => void reload()}
        emptyTitle="Ingen statistik ännu"
        emptyDescription="Det finns inga sidvisningar att visa för den valda perioden."
        emptyIcon={Eye}
        skeletonRows={4}
      >
        {data && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              <StatCard
                label="Sidvisningar"
                value={data.totalPageViews}
                hint={scopeHint(data.metricScopes.totalPageViews)}
                icon={Eye}
              />
              <StatCard
                label="Unika besökare"
                value={data.uniqueVisitors}
                hint={scopeHint(data.metricScopes.uniqueVisitors)}
                icon={Users}
              />
              <StatCard
                label="Nya konton"
                value={data.totalUsers}
                hint={scopeHint(data.metricScopes.totalUsers)}
                icon={Users}
              />
              <StatCard
                label="Nya projekt"
                value={data.totalProjects}
                hint={scopeHint(data.metricScopes.totalProjects)}
                icon={FolderOpen}
              />
              <StatCard
                label="Gästbyggen"
                value={data.totalGenerations}
                hint={scopeHint(data.metricScopes.totalGenerations)}
                icon={Wand2}
              />
              <StatCard
                label="Gäständringar"
                value={data.totalRefines}
                hint={scopeHint(data.metricScopes.totalRefines)}
                icon={Coins}
              />
            </div>

            <p className="text-muted-foreground text-xs">
              Gästbyggen och gäständringar räknas totalt sedan start — de lagras som en räknare per
              gästsession, inte per dag.
            </p>

            <SectionCard
              title="Besök över tid"
              description={`Sidvisningar och unika besökare, ${periodLabel}.`}
              icon={MousePointerClick}
            >
              {chartData.length === 0 ? (
                <p className="text-muted-foreground text-sm">Ingen data för perioden.</p>
              ) : (
                <ChartContainer config={chartConfig} className="h-[260px] w-full">
                  <AreaChart data={chartData} margin={{ left: 4, right: 8, top: 8 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      minTickGap={16}
                    />
                    <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
                    <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                    <Area
                      type="monotone"
                      dataKey="views"
                      stroke="var(--color-views)"
                      fill="var(--color-views)"
                      fillOpacity={0.18}
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="unique"
                      stroke="var(--color-unique)"
                      fill="var(--color-unique)"
                      fillOpacity={0.12}
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ChartContainer>
              )}
            </SectionCard>

            <div className="grid gap-4 lg:grid-cols-2">
              <SectionCard
                title="Populäraste sidor"
                description={`Mest besökta sidor, ${periodLabel}.`}
                icon={Eye}
              >
                <DataState
                  isEmpty={data.recentPageViews.length === 0}
                  emptyTitle="Inga sidvisningar"
                  emptyDescription="Ingen sida har besökts under perioden."
                >
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sida</TableHead>
                        <TableHead className="text-right">Besök</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.recentPageViews.map((page) => (
                        <TableRow key={page.path}>
                          <TableCell className="max-w-[260px] truncate font-mono text-xs">
                            {page.path}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCount(page.count)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </DataState>
              </SectionCard>

              <SectionCard
                title="Varifrån kommer besöken"
                description={`Hänvisande källor, ${periodLabel}.`}
                icon={Link2}
              >
                <DataState
                  isEmpty={data.topReferrers.length === 0}
                  emptyTitle="Inga hänvisningar"
                  emptyDescription="Besökarna kom utan hänvisande källa (direkttrafik)."
                >
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Källa</TableHead>
                        <TableHead className="text-right">Besök</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.topReferrers.map((referrer) => (
                        <TableRow key={referrer.referrer}>
                          <TableCell className="max-w-[260px] truncate text-sm">
                            {referrer.referrer || "Direkt"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCount(referrer.count)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </DataState>
              </SectionCard>
            </div>
          </>
        )}
      </DataState>
    </div>
  );
}
