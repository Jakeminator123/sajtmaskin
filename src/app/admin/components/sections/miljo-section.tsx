"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Bot,
  FolderOpen,
  Key,
  Plug,
  Server,
  ShieldCheck,
  ToggleLeft,
  Users,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { DangerAction } from "../danger-action";
import {
  DataState,
  KeyValueGrid,
  RefreshButton,
  SectionCard,
  StatusBadge,
  TechnicalDetails,
} from "../ui-bits";
import { EnvCompare } from "../env-compare";
import type {
  EnvStatusPayload,
  IntegrationStatus,
  TeamStatus,
  VercelEnvVar,
  VercelProject,
  VercelProjectsPayload,
} from "../types";

export function MiljoSection() {
  const env = useAdminResource<EnvStatusPayload>("/api/admin/env", {
    errorMessage: "Kunde inte hämta miljöstatus",
  });
  const integrations = useAdminResource<IntegrationStatus>("/api/integrations/status", {
    errorMessage: "Kunde inte hämta integrationsstatus",
  });
  const teams = useAdminResource<TeamStatus>("/api/admin/vercel/team-status", {
    errorMessage: "Kunde inte hämta Vercel-team",
  });
  const projects = useAdminResource<VercelProjectsPayload, VercelProjectsPayload>(
    "/api/admin/vercel/projects",
    {
      select: (json) => ({
        projects: json.projects ?? [],
        selfProjectKnown: json.selfProjectKnown,
        selfProjectIdSource: json.selfProjectIdSource,
      }),
      errorMessage: "Kunde inte hämta Vercel-projekt",
    },
  );
  const projectList = projects.data?.projects ?? [];
  // The API disables deletion entirely when it cannot identify its own project —
  // mirror that here instead of showing buttons the API will reject.
  const selfProjectUnknown = projects.data?.selfProjectKnown === false;

  /**
   * The Vercel routes answer 503 when no token is configured. That is an expected
   * state (local dev, non-integrated environments) — show it as a calm empty
   * state, not a red failure.
   */
  const vercelNotConfigured = (resourceStatus: number | null) => resourceStatus === 503;

  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [keyFilter, setKeyFilter] = useState("");
  const [keyScope, setKeyScope] = useState<"attention" | "set" | "all">("attention");

  const projectId = selectedProjectId || env.data?.vercel.projectId || "";
  const projectEnv = useAdminResource<VercelEnvVar[], { envs: VercelEnvVar[] }>(
    projectId ? `/api/admin/vercel/env?projectId=${encodeURIComponent(projectId)}` : null,
    {
      select: (json) => json.envs ?? [],
      errorMessage: "Kunde inte hämta env-variabler för projektet",
    },
  );

  const envData = env.data;
  const allKeys = useMemo(() => envData?.keys ?? [], [envData]);
  const missingRequired = allKeys.filter((k) => k.required && !k.present);

  const keyScopeCounts = {
    attention: allKeys.filter((k) => k.required || k.present).length,
    set: allKeys.filter((k) => k.present).length,
    all: allKeys.length,
  };

  /**
   * The policy knows ~200 keys; showing them all by default would bury the few
   * that matter. Default scope is "required or already set", with the full list
   * one click away.
   */
  const filteredKeys = useMemo(() => {
    const scoped =
      keyScope === "all"
        ? allKeys
        : keyScope === "set"
          ? allKeys.filter((item) => item.present)
          : allKeys.filter((item) => item.required || item.present);
    const needle = keyFilter.trim().toLowerCase();
    const matched = needle
      ? scoped.filter((item) => item.key.toLowerCase().includes(needle))
      : scoped;
    // Missing-but-required first, then missing, then the rest alphabetically.
    return [...matched].sort((a, b) => {
      const rank = (item: typeof a) => (item.required && !item.present ? 0 : item.present ? 2 : 1);
      return rank(a) - rank(b) || a.key.localeCompare(b.key);
    });
  }, [allKeys, keyFilter, keyScope]);
  const featureEntries = Object.entries(env.data?.features ?? {});
  const openclaw = env.data?.openclaw;

  /** Returns false on failure so the confirm dialog stays open. */
  const deleteProject = async (project: VercelProject): Promise<boolean> => {
    const response = await fetch(`/api/admin/vercel/projects/${encodeURIComponent(project.id)}`, {
      method: "DELETE",
    });
    const data = (await response.json().catch(() => null)) as
      | { success?: boolean; error?: string }
      | null;
    if (!response.ok || data?.success === false) {
      toast.error(data?.error || "Kunde inte radera projektet");
      return false;
    }
    toast.success(`Raderade Vercel-projektet ${project.name}`);
    if (selectedProjectId === project.id) setSelectedProjectId("");
    await projects.reload();
    return true;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <RefreshButton
          onClick={() => {
            void env.reload();
            void integrations.reload();
            void teams.reload();
            void projects.reload();
          }}
          loading={env.loading || integrations.loading || projects.loading}
        />
      </div>

      <SectionCard
        title="Körläge"
        description="Vilken miljö appen kör i just nu."
        icon={Server}
        tone={env.error ? "error" : "ok"}
      >
        <DataState
          loading={env.loading && !env.data}
          error={env.error}
          isEmpty={!env.data}
          onRetry={() => void env.reload()}
          emptyTitle="Ingen miljöstatus"
        >
          {env.data && (
            <KeyValueGrid
              items={[
                { label: "Läge", value: env.data.runtime.nodeEnv || "okänt" },
                { label: "Vercel-miljö", value: env.data.runtime.vercelEnv || "lokal" },
                { label: "Adress", value: env.data.runtime.baseUrl, mono: true },
                {
                  label: "Vercel-adress",
                  value: env.data.runtime.vercelUrl || "ej tillgänglig",
                  mono: true,
                },
              ]}
            />
          )}
        </DataState>
      </SectionCard>

      <SectionCard
        title="Nycklar"
        description={
          missingRequired.length > 0
            ? `${missingRequired.length} nödvändig${missingRequired.length === 1 ? "" : "a"} nyckel saknas.`
            : "Alla nödvändiga nycklar är satta. Värden visas aldrig — bara om nyckeln finns."
        }
        icon={Key}
        tone={missingRequired.length > 0 ? "warn" : "ok"}
        action={
          <Input
            value={keyFilter}
            onChange={(event) => setKeyFilter(event.target.value)}
            placeholder="Sök nyckel"
            className="h-8 w-40"
            aria-label="Sök nyckel"
          />
        }
      >
        <div className="mb-3 flex flex-wrap gap-2">
          {(
            [
              ["attention", "Nödvändiga och satta"],
              ["set", "Bara satta"],
              ["all", "Alla kända"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              variant={keyScope === value ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setKeyScope(value)}
            >
              {label} ({keyScopeCounts[value]})
            </Button>
          ))}
        </div>
        <DataState
          loading={env.loading && !env.data}
          error={env.error}
          isEmpty={filteredKeys.length === 0}
          onRetry={() => void env.reload()}
          emptyTitle="Ingen nyckel matchar"
          emptyDescription="Rensa sökfältet för att se alla nycklar."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nyckel</TableHead>
                <TableHead>Används till</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredKeys.map((item) => (
                <TableRow key={item.key}>
                  <TableCell className="font-mono text-xs">{item.key}</TableCell>
                  <TableCell className="text-muted-foreground max-w-[420px] text-xs">
                    {item.notes || "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {item.present ? (
                      <StatusBadge tone="ok">Satt</StatusBadge>
                    ) : item.required ? (
                      <StatusBadge tone="error">Saknas</StatusBadge>
                    ) : (
                      <StatusBadge tone="off">Valfri</StatusBadge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataState>
      </SectionCard>

      <SectionCard
        title="Integrationer"
        description="Tjänster appen kan använda och om de är påslagna."
        icon={Plug}
      >
        <DataState
          loading={integrations.loading && !integrations.data}
          error={integrations.error}
          isEmpty={!integrations.data?.items?.length}
          onRetry={() => void integrations.reload()}
          emptyTitle="Ingen integrationsstatus"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Integration</TableHead>
                <TableHead>Påverkar</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(integrations.data?.items ?? []).map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <p className="font-medium">{item.label}</p>
                    {item.notes && (
                      <p className="text-muted-foreground text-xs">{item.notes}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">{item.affects}</TableCell>
                  <TableCell className="text-right">
                    {item.enabled ? (
                      <StatusBadge tone="ok">På</StatusBadge>
                    ) : item.required ? (
                      <StatusBadge tone="error">Saknas</StatusBadge>
                    ) : (
                      <StatusBadge tone="off">Av</StatusBadge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {integrations.data?.updatedAt && (
            <TechnicalDetails summary="Visa tekniska detaljer">
              <p className="text-muted-foreground text-xs">
                Statusen lästes {new Date(integrations.data.updatedAt).toLocaleString("sv-SE")} från{" "}
                <span className="font-mono">/api/integrations/status</span>. Nycklar per
                integration:
              </p>
              <ul className="text-muted-foreground mt-2 space-y-1 text-xs">
                {(integrations.data.items ?? []).map((item) => (
                  <li key={item.id}>
                    <span className="font-medium">{item.label}:</span>{" "}
                    <span className="font-mono">
                      {item.requiredEnv.length > 0 ? item.requiredEnv.join(", ") : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            </TechnicalDetails>
          )}
        </DataState>
      </SectionCard>

      {openclaw && (
        <SectionCard
          title="OpenClaw-gateway"
          description="Statusen för den externa agent-gatewayen."
          icon={Bot}
          tone={
            openclaw.status === "ok"
              ? "ok"
              : openclaw.status === "unconfigured"
                ? "off"
                : "warn"
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              tone={
                openclaw.status === "ok"
                  ? "ok"
                  : openclaw.status === "unconfigured"
                    ? "off"
                    : "warn"
              }
            >
              {openclaw.status === "ok"
                ? "Svarar"
                : openclaw.status === "unconfigured"
                  ? "Inte konfigurerad"
                  : openclaw.status === "unhealthy"
                    ? `Fel (${openclaw.upstream ?? "?"})`
                    : "Går inte att nå"}
            </StatusBadge>
            {openclaw.surfaceEnabled ? (
              <Badge variant="outline">Ytan är påslagen</Badge>
            ) : (
              <Badge variant="outline">Ytan är avstängd</Badge>
            )}
            {openclaw.debugEnabled && <Badge variant="outline">Debugläge</Badge>}
            {openclaw.editEnabled && <Badge variant="outline">Editläge</Badge>}
          </div>
          {openclaw.blockers.length > 0 && (
            <div className="mt-3">
              <TechnicalDetails summary={`Vad som saknas (${openclaw.blockers.length})`}>
                <ul className="text-muted-foreground space-y-1 text-xs">
                  {openclaw.blockers.map((blocker) => (
                    <li key={blocker} className="font-mono">
                      {blocker}
                    </li>
                  ))}
                </ul>
              </TechnicalDetails>
            </div>
          )}
        </SectionCard>
      )}

      {featureEntries.length > 0 && (
        <SectionCard
          title="Funktionsflaggor"
          description="Påslagna och avstängda funktioner i den här miljön."
          icon={ToggleLeft}
        >
          <div className="flex flex-wrap gap-2">
            {featureEntries.map(([name, enabled]) => (
              <StatusBadge key={name} tone={enabled ? "ok" : "off"} className="font-mono text-xs">
                {name}
              </StatusBadge>
            ))}
          </div>
        </SectionCard>
      )}

      <EnvCompare />

      <SectionCard
        title="Vercel-team"
        description="Vilket team appen är kopplad till och vilken plan det har."
        icon={Users}
      >
        <DataState
          loading={teams.loading && !teams.data}
          error={vercelNotConfigured(teams.status) ? null : teams.error}
          isEmpty={!teams.data?.teams?.length}
          onRetry={() => void teams.reload()}
          emptyTitle={
            vercelNotConfigured(teams.status) ? "Vercel är inte kopplat" : "Inga team hittades"
          }
          emptyDescription={
            vercelNotConfigured(teams.status)
              ? "Den här miljön har ingen Vercel-åtkomst (ingen token). Team och planer visas när kopplingen finns."
              : "Token saknar åtkomst till något team."
          }
          emptyIcon={Users}
        >
          {(teams.data?.warnings ?? []).length > 0 && (
            <ul className="mb-3 space-y-1">
              {(teams.data?.warnings ?? []).map((warning) => (
                <li key={warning} className="text-amber-400 text-xs">
                  {warning}
                </li>
              ))}
            </ul>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Team</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead className="text-right">Kopplat</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(teams.data?.teams ?? []).map((team) => (
                <TableRow key={team.id}>
                  <TableCell>
                    <p className="font-medium">{team.name}</p>
                    <p className="text-muted-foreground font-mono text-xs">{team.slug}</p>
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={team.isFree ? "warn" : "ok"}>
                      {team.plan === "hobby" ? "Gratis (Hobby)" : team.plan}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="text-right">
                    {team.id === teams.data?.configuredTeamId ? (
                      <StatusBadge tone="ok">Ja</StatusBadge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataState>
      </SectionCard>

      <SectionCard
        title="Vercel-projekt"
        description="Projekt som åtkomsttoken ser. Sajtmaskins eget projekt kan inte raderas härifrån."
        icon={FolderOpen}
        action={<RefreshButton onClick={() => void projects.reload()} loading={projects.loading} />}
      >
        {selfProjectUnknown && (
          <Alert className="mb-3">
            <ShieldCheck className="h-4 w-4" />
            <AlertTitle>Radering är avstängd</AlertTitle>
            <AlertDescription>
              <p>
                Appen kan inte avgöra vilket av projekten som är dess eget, så inget projekt kan
                raderas härifrån. Sätt <code className="font-mono text-xs">VERCEL_PROJECT_ID</code>{" "}
                så skyddas appens projekt och radering av kundprojekt öppnas igen.
              </p>
            </AlertDescription>
          </Alert>
        )}
        <DataState
          loading={projects.loading && !projects.data}
          error={vercelNotConfigured(projects.status) ? null : projects.error}
          isEmpty={projectList.length === 0}
          onRetry={() => void projects.reload()}
          emptyTitle={
            vercelNotConfigured(projects.status) ? "Vercel är inte kopplat" : "Inga projekt"
          }
          emptyDescription={
            vercelNotConfigured(projects.status)
              ? "Ingen Vercel-token i den här miljön, så det finns inga projekt att visa eller radera."
              : "Token ser inga projekt."
          }
          emptyIcon={FolderOpen}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Projekt</TableHead>
                <TableHead>Senast ändrat</TableHead>
                <TableHead className="w-px" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {projectList.map((project) => (
                <TableRow key={project.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{project.name}</span>
                      {project.isSelf && (
                        <StatusBadge tone="ok" className="gap-1">
                          <ShieldCheck className="h-3 w-3" />
                          Appen själv
                        </StatusBadge>
                      )}
                    </div>
                    <p className="text-muted-foreground font-mono text-xs">{project.id}</p>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {project.updatedAt
                      ? new Date(project.updatedAt).toLocaleString("sv-SE")
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedProjectId(project.id)}
                      >
                        Visa nycklar
                      </Button>
                      {project.deletable === false || project.isSelf ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled
                          title={
                            project.isSelf
                              ? "Appens eget projekt — skyddat"
                              : "Radering avstängd tills appens eget projekt kan identifieras"
                          }
                        >
                          Skyddat
                        </Button>
                      ) : (
                        <DangerAction
                          label="Radera"
                          title={`Radera Vercel-projektet ${project.name}?`}
                          description="Projektet och dess driftsättningar tas bort hos Vercel. Sajten slutar fungera direkt."
                          impact="Kan inte ångras. Kontrollera att projektet inte är en kunds live-sajt."
                          confirmWord={project.name}
                          onConfirm={() => deleteProject(project)}
                        />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataState>
      </SectionCard>

      <SectionCard
        title="Nycklar i valt Vercel-projekt"
        description="Vilka env-variabler som finns och för vilka miljöer. Värden visas aldrig."
        icon={Key}
        action={
          projectList.length > 0 ? (
            <Select value={projectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger className="w-56" aria-label="Välj projekt">
                <SelectValue placeholder="Välj projekt" />
              </SelectTrigger>
              <SelectContent>
                {projectList.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : undefined
        }
      >
        <DataState
          loading={projectEnv.loading && !projectEnv.data}
          error={vercelNotConfigured(projectEnv.status) ? null : projectEnv.error}
          isEmpty={!projectId || !projectEnv.data?.length}
          onRetry={() => void projectEnv.reload()}
          emptyTitle={
            vercelNotConfigured(projectEnv.status)
              ? "Vercel är inte kopplat"
              : projectId
                ? "Inga env-variabler"
                : "Välj ett projekt"
          }
          emptyDescription={
            projectId
              ? "Projektet har inga env-variabler, eller så saknar token åtkomst."
              : "Välj ett projekt i listan för att se dess nycklar."
          }
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nyckel</TableHead>
                <TableHead className="text-right">Miljöer</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(projectEnv.data ?? []).map((envVar) => (
                <TableRow key={envVar.id || envVar.key}>
                  <TableCell className="font-mono text-xs">{envVar.key}</TableCell>
                  <TableCell className="text-muted-foreground text-right text-xs">
                    {envVar.target.length > 0 ? envVar.target.join(", ") : "ingen"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataState>
      </SectionCard>
    </div>
  );
}
