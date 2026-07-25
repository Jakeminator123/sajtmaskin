"use client";

import { AlertCircle, RefreshCw, type LucideIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Semantic health state shared by every admin section. */
export type StatusTone = "ok" | "warn" | "error" | "off";

/**
 * Swedish thousands formatting that survives the API's mixed number shapes.
 *
 * `count(*)` comes back from Postgres as a **string** (`"42"`) even though the
 * route types it as `number`, so a naive `value.toLocaleString("sv-SE")` silently
 * printed the raw string. Coerce first, and fall back to the original value when
 * it genuinely isn't numeric.
 */
export function formatCount(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  return numeric.toLocaleString("sv-SE");
}

/** Numeric view of the same mixed-shape counters (for comparisons/disabled state). */
export function toCount(value: string | number | null | undefined): number {
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

const STATUS_CLASS: Record<StatusTone, string> = {
  ok: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  warn: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  error: "border-destructive/40 bg-destructive/10 text-destructive",
  off: "border-border bg-muted/40 text-muted-foreground",
};

export function StatusBadge({
  tone,
  children,
  className,
}: {
  tone: StatusTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn(STATUS_CLASS[tone], className)}>
      {children}
    </Badge>
  );
}

/** Card wrapper with a consistent header, optional icon and header action slot. */
export function SectionCard({
  title,
  description,
  icon: Icon,
  action,
  tone,
  children,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  icon?: LucideIcon;
  action?: React.ReactNode;
  tone?: StatusTone;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {Icon && (
            <span
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-md border",
                tone ? STATUS_CLASS[tone] : "border-border bg-muted/40 text-muted-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
          )}
          {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      {children && <CardContent>{children}</CardContent>}
    </Card>
  );
}

/** Big number + label, used for the metric rows. */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  tone?: StatusTone;
}) {
  return (
    <Card className="gap-2 py-4">
      <CardContent className="px-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-muted-foreground text-sm">{label}</p>
          {Icon && (
            <Icon
              className={cn(
                "h-4 w-4",
                tone === "error"
                  ? "text-destructive"
                  : tone === "warn"
                    ? "text-amber-400"
                    : "text-muted-foreground",
              )}
            />
          )}
        </div>
        <p className="mt-1 text-2xl font-semibold tracking-tight">{formatCount(value)}</p>
        {hint && <p className="text-muted-foreground mt-1 text-xs">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export function KeyValueGrid({
  items,
  columns = 2,
}: {
  items: { label: string; value: React.ReactNode; mono?: boolean }[];
  columns?: 1 | 2 | 3;
}) {
  return (
    <div
      className={cn(
        "grid gap-3",
        columns === 1 ? "grid-cols-1" : columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2",
      )}
    >
      {items.map((item) => (
        <div key={item.label} className="border-border bg-muted/30 rounded-md border px-3 py-2">
          <p className="text-muted-foreground text-xs">{item.label}</p>
          <p className={cn("text-sm break-words", item.mono && "font-mono text-xs")}>
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}

export function RefreshButton({
  onClick,
  loading,
  label = "Uppdatera",
}: {
  onClick: () => void;
  loading?: boolean;
  label?: string;
}) {
  return (
    <Button variant="outline" size="sm" className="gap-2" onClick={onClick} disabled={loading}>
      <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
      {label}
    </Button>
  );
}

/**
 * One consistent loading / error / empty envelope so no section falls back to a
 * bare "Laddar..." string (the old pattern) or renders a silent blank panel.
 */
export function DataState({
  loading,
  error,
  isEmpty,
  onRetry,
  emptyTitle = "Inget att visa",
  emptyDescription,
  emptyIcon,
  skeletonRows = 3,
  children,
}: {
  loading?: boolean;
  error?: string | null;
  isEmpty?: boolean;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: LucideIcon;
  skeletonRows?: number;
  children: React.ReactNode;
}) {
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Kunde inte hämta data</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-2">
          <span>{error}</span>
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              Försök igen
            </Button>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  if (loading) {
    return (
      <div className="space-y-2" aria-busy="true" aria-live="polite">
        {Array.from({ length: skeletonRows }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (isEmpty) {
    const Icon = emptyIcon;
    return (
      <Empty className="border-border rounded-md border border-dashed py-8">
        <EmptyHeader>
          {Icon && (
            <EmptyMedia variant="icon">
              <Icon />
            </EmptyMedia>
          )}
          <EmptyTitle>{emptyTitle}</EmptyTitle>
          {emptyDescription && <EmptyDescription>{emptyDescription}</EmptyDescription>}
        </EmptyHeader>
      </Empty>
    );
  }

  return <>{children}</>;
}

/** Collapsible "for the curious" block — keeps ids/paths/JSON out of the first surface. */
export function TechnicalDetails({
  summary = "Visa tekniska detaljer",
  children,
}: {
  summary?: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group">
      <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs select-none">
        {summary}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}
