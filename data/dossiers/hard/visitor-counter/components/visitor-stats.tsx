"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Wire shape returned by `/api/visits`. Mirrors `VisitStats` in
 * `lib/visits/config.ts`; declared here so the client bundle needs no import
 * from the server lib (and so the component mounts standalone).
 */
interface VisitDay {
  date: string;
  views: number;
  visitors: number;
}

interface VisitStats {
  today: VisitDay;
  total: { views: number; visitors: number };
  days: VisitDay[];
  demo: boolean;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; stats: VisitStats }
  | { kind: "error" };

interface VisitorStatsProps {
  className?: string;
}

const NUMBER = new Intl.NumberFormat("sv-SE");
const WEEKDAY = new Intl.DateTimeFormat("sv-SE", { weekday: "short", timeZone: "Europe/Stockholm" });

function weekdayLabel(isoDate: string): string {
  // Noon avoids the date flipping across the DST boundary.
  const label = WEEKDAY.format(new Date(`${isoDate}T12:00:00`));
  return label.replace(/\.$/, "");
}

/**
 * The owner's visitor statistics: today's numbers, running totals and a
 * 14-day bar chart of visits — read from `/api/visits`. In demo mode (no
 * store connected yet) it shows sample numbers with an honest notice, so the
 * page always looks finished and never pretends the sample is real traffic.
 */
export function VisitorStats({ className }: VisitorStatsProps) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/visits", { cache: "no-store" });
      const body = (await res.json()) as { ok?: boolean; stats?: VisitStats };
      if (!res.ok || !body?.ok || !body.stats) {
        setState({ kind: "error" });
        return;
      }
      setState({ kind: "ready", stats: body.stats });
    } catch {
      setState({ kind: "error" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.kind === "loading") {
    return (
      <div className={className} aria-busy="true">
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className={className}>
        <div role="status" className="rounded-xl border p-6 text-center">
          <p className="text-muted-foreground">Kunde inte hämta statistiken just nu.</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 inline-flex items-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Försök igen
          </button>
        </div>
      </div>
    );
  }

  const { stats } = state;
  const maxVisitors = Math.max(1, ...stats.days.map((day) => day.visitors));

  return (
    <div className={className}>
      {stats.demo ? (
        <p
          role="note"
          className="mb-4 rounded-md border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800"
        >
          Demoläge – visar exempelsiffror. Riktig räkning börjar när statistiklagringen är
          kopplad.
        </p>
      ) : null}

      <dl className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Besökare idag" value={stats.today.visitors} />
        <StatCard label="Sidvisningar idag" value={stats.today.views} />
        <StatCard label="Besökare totalt" value={stats.total.visitors} />
        <StatCard label="Sidvisningar totalt" value={stats.total.views} />
      </dl>

      <section className="mt-8" aria-labelledby="visitor-stats-chart-title">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 id="visitor-stats-chart-title" className="text-sm font-medium text-muted-foreground">
            Besökare per dag – senaste {stats.days.length} dagarna
          </h2>
          <button
            type="button"
            onClick={() => void load()}
            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            Uppdatera
          </button>
        </div>
        <ol
          className="flex h-40 items-end gap-1 rounded-xl border p-3 sm:gap-2"
          aria-label="Besökare per dag"
        >
          {stats.days.map((day) => {
            const height = Math.max(4, Math.round((day.visitors / maxVisitors) * 100));
            return (
              <li
                key={day.date}
                className="flex h-full flex-1 flex-col items-center justify-end gap-1"
                title={`${day.date}: ${NUMBER.format(day.visitors)} besökare, ${NUMBER.format(day.views)} sidvisningar`}
              >
                <span className="sr-only">
                  {day.date}: {NUMBER.format(day.visitors)} besökare
                </span>
                <div
                  aria-hidden="true"
                  className="w-full rounded-t bg-primary/80"
                  style={{ height: `${height}%` }}
                />
                <span aria-hidden="true" className="text-[10px] text-muted-foreground">
                  {weekdayLabel(day.date)}
                </span>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border p-5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-3xl font-semibold tabular-nums">{NUMBER.format(value)}</dd>
    </div>
  );
}
