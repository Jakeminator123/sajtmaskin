"use client";

import Link from "next/link";
import { Database, Eye, FolderOpen, Key, Server, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAdminResource } from "../../lib/use-admin-resource";
import {
  DataState,
  RefreshButton,
  SectionCard,
  StatCard,
  StatusBadge,
  formatCount,
} from "../ui-bits";
import { ADMIN_SECTIONS, ADMIN_SECTION_KIND_LABEL } from "../../admin-nav";
import type { AnalyticsStats, DatabaseStats, EnvStatusPayload } from "../types";

/**
 * Landing surface for `/admin`: is anything wrong right now, a few key numbers,
 * and a signposted way into each section. The old panel dropped you straight into
 * the statistics tab with no sense of overall state.
 */
export function OversiktSection() {
  const db = useAdminResource<DatabaseStats, { stats: DatabaseStats }>("/api/admin/database", {
    select: (json) => json.stats,
    errorMessage: "Kunde inte hämta databasstatus",
  });
  const env = useAdminResource<EnvStatusPayload>("/api/admin/env", {
    errorMessage: "Kunde inte hämta miljöstatus",
  });
  const week = useAdminResource<AnalyticsStats, { stats: AnalyticsStats }>("/api/analytics?days=7", {
    select: (json) => json.stats,
    errorMessage: "Kunde inte hämta statistiken",
  });

  const missingRequired = (env.data?.keys ?? []).filter((key) => key.required && !key.present);
  const redisConnected = Boolean(db.data?.redis?.connected);

  const health = [
    {
      title: "Databas",
      icon: Database,
      tone: db.error ? ("error" as const) : ("ok" as const),
      status: db.error ? "Svarar inte" : db.data ? "Ansluten" : "Kontrollerar…",
      detail: db.data ? `Storlek ${db.data.dbFileSize}` : "—",
    },
    {
      title: "Cache",
      icon: Server,
      tone: redisConnected ? ("ok" as const) : ("off" as const),
      status: redisConnected ? "Ansluten" : "Avstängd",
      detail: redisConnected
        ? `${formatCount(db.data?.redis?.totalKeys)} nycklar`
        : "Appen fungerar utan cache",
    },
    {
      title: "Nycklar",
      icon: Key,
      tone:
        env.error || missingRequired.length > 0 ? ("warn" as const) : ("ok" as const),
      status:
        missingRequired.length > 0
          ? `${missingRequired.length} saknas`
          : env.data
            ? "Alla på plats"
            : "Kontrollerar…",
      detail:
        missingRequired.length > 0
          ? missingRequired
              .slice(0, 3)
              .map((key) => key.key)
              .join(", ")
          : (env.data?.runtime.vercelEnv ?? env.data?.runtime.nodeEnv ?? "—"),
    },
    {
      title: "Uppladdat",
      icon: FolderOpen,
      tone: "off" as const,
      status: `${formatCount(db.data?.uploads?.fileCount ?? 0)} filer`,
      detail: db.data?.uploads?.totalSize ?? "0 B",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <RefreshButton
          onClick={() => {
            void db.reload();
            void env.reload();
            void week.reload();
          }}
          loading={db.loading || env.loading || week.loading}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {health.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.title} className="gap-2 py-4">
              <CardContent className="px-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-muted-foreground flex items-center gap-2 text-sm">
                    <Icon className="h-4 w-4" />
                    {item.title}
                  </p>
                  <StatusBadge tone={item.tone}>{item.status}</StatusBadge>
                </div>
                <p className="text-muted-foreground mt-2 truncate text-xs">{item.detail}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <SectionCard
        title="Senaste 7 dagarna"
        description="Snabb temperaturmätning. Fullständig statistik finns under Statistik."
        icon={Eye}
      >
        <DataState
          loading={week.loading && !week.data}
          error={week.error}
          isEmpty={!week.data}
          onRetry={() => void week.reload()}
          emptyTitle="Ingen statistik"
          skeletonRows={2}
        >
          {week.data && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="Sidvisningar" value={week.data.totalPageViews} icon={Eye} />
              <StatCard label="Unika besökare" value={week.data.uniqueVisitors} icon={Users} />
              <StatCard label="Nya konton" value={week.data.totalUsers} icon={Users} />
              <StatCard label="Nya projekt" value={week.data.totalProjects} icon={FolderOpen} />
            </div>
          )}
        </DataState>
      </SectionCard>

      <SectionCard
        title="Vad finns var"
        description="Kort om varje sektion — och om den bara visar eller kan ändra saker."
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {ADMIN_SECTIONS.filter((section) => section.href !== "/admin").map((section) => {
            const Icon = section.icon;
            return (
              <div
                key={section.href}
                className="border-border bg-muted/20 flex items-start gap-3 rounded-md border p-3"
              >
                <span className="border-border bg-background mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{section.label}</p>
                    <StatusBadge
                      tone={
                        section.kind === "danger" ? "error" : section.kind === "write" ? "warn" : "off"
                      }
                    >
                      {ADMIN_SECTION_KIND_LABEL[section.kind]}
                    </StatusBadge>
                  </div>
                  <p className="text-muted-foreground text-xs">{section.description}</p>
                  <Button asChild variant="link" size="sm" className="h-auto px-0 text-xs">
                    <Link href={section.href}>Öppna {section.label.toLowerCase()} →</Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}
