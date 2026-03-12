"use client";

import { AlertCircle, Blocks, KeyRound, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  type PlanArtifact,
  type PlanPage,
  normalizePlanArtifact,
} from "@/lib/gen/plan-schema";

type Props = {
  rawPlan?: Record<string, unknown>;
  onApproveBuild?: (plan: Record<string, unknown>) => void | Promise<void>;
  approveDisabled?: boolean;
};

function openProjectEnvVarsPanel(envKeys?: string[]) {
  if (typeof window === "undefined") return;
  const payload = envKeys?.length ? { envKeys } : {};
  window.dispatchEvent(new CustomEvent("project-env-vars-open", { detail: payload }));
}

function openIntegrationsPanel() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("integrations-panel-open"));
}

function siteTypeLabel(value?: PlanArtifact["siteType"]) {
  switch (value) {
    case "one-page":
      return "One-page";
    case "brochure":
      return "Brochure";
    case "content-heavy":
      return "Content-heavy";
    case "app-shell":
      return "App shell";
    default:
      return null;
  }
}

function pageSummary(page: PlanPage) {
  const parts = [page.intent];
  if (page.primaryCta) parts.push(`CTA: ${page.primaryCta}`);
  return parts.filter(Boolean).join(" • ");
}

function renderProviderRow(label: string, value?: string) {
  if (!value) return null;
  return (
    <div className="rounded-md border border-border/60 bg-background/40 px-2.5 py-2 text-xs">
      <span className="text-muted-foreground">{label}:</span>{" "}
      <span className="text-foreground">{value}</span>
    </div>
  );
}

export function BuildPlanCard({ rawPlan, onApproveBuild, approveDisabled = false }: Props) {
  const plan = normalizePlanArtifact(rawPlan);
  if (!plan) return null;

  const requiredEnvKeys = (plan.contracts?.envVars ?? [])
    .filter((envVar) => envVar.required !== false)
    .map((envVar) => envVar.key);
  const unresolvedBlockers = plan.blockers.filter((blocker) => !blocker.resolved);

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-border/70 bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">Build plan</Badge>
        {siteTypeLabel(plan.siteType) ? (
          <Badge variant="secondary">{siteTypeLabel(plan.siteType)}</Badge>
        ) : null}
        {plan.pages.length > 0 ? (
          <Badge variant="outline">{plan.pages.length} sidor</Badge>
        ) : null}
        {unresolvedBlockers.length > 0 ? (
          <Badge variant="destructive">{unresolvedBlockers.length} blockerare</Badge>
        ) : null}
        {plan.scaffold?.label ? <Badge variant="outline">{plan.scaffold.label}</Badge> : null}
      </div>

      {plan.pages.length > 0 ? (
        <section className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Sidplan
          </div>
          <div className="space-y-2">
            {plan.pages.map((page) => (
              <div
                key={`${page.id}-${page.path}`}
                className="rounded-md border border-border/60 bg-background/40 p-2.5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{page.name}</span>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {page.path}
                  </Badge>
                  {page.inNavigation ? (
                    <Badge variant="secondary" className="text-[10px]">
                      I navigation
                    </Badge>
                  ) : null}
                </div>
                {pageSummary(page) ? (
                  <div className="mt-1 text-xs text-muted-foreground">{pageSummary(page)}</div>
                ) : null}
                {page.sections.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {page.sections.map((section) => (
                      <Badge key={`${page.id}-${section}`} variant="outline" className="text-[10px]">
                        {section}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {plan.contracts ? (
        <section className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Förkontrakt
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <div className="rounded-md border border-border/60 bg-background/40 px-2.5 py-2 text-xs">
              <span className="text-muted-foreground">Datamode:</span>{" "}
              <span className="text-foreground">{plan.contracts.dataMode}</span>
            </div>
            {renderProviderRow("Databas", plan.contracts.databaseProvider)}
            {renderProviderRow("Auth", plan.contracts.authProvider)}
            {renderProviderRow("Betalning", plan.contracts.paymentProvider)}
          </div>

          {plan.contracts.integrations.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                <Blocks className="h-3.5 w-3.5" />
                Integrationer
              </div>
              <div className="space-y-2">
                {plan.contracts.integrations.map((integration) => (
                  <div
                    key={`${integration.provider}-${integration.name}`}
                    className="rounded-md border border-border/60 bg-background/40 p-2.5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{integration.name}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {integration.status}
                      </Badge>
                    </div>
                    {integration.reason ? (
                      <div className="mt-1 text-xs text-muted-foreground">{integration.reason}</div>
                    ) : null}
                    {integration.envVars?.length ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {integration.envVars.map((envVar) => (
                          <Badge key={`${integration.provider}-${envVar}`} variant="secondary" className="font-mono text-[10px]">
                            {envVar}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {plan.contracts.envVars.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                <KeyRound className="h-3.5 w-3.5" />
                Miljövariabler
              </div>
              <div className="flex flex-wrap gap-1.5">
                {plan.contracts.envVars.map((envVar) => (
                  <Badge key={envVar.key} variant={envVar.required === false ? "outline" : "secondary"} className="font-mono text-[10px]">
                    {envVar.key}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}

          {(plan.contracts.integrations.length > 0 || requiredEnvKeys.length > 0) ? (
            <div className="flex flex-wrap gap-2">
              {requiredEnvKeys.length > 0 ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => openProjectEnvVarsPanel(requiredEnvKeys)}
                >
                  <KeyRound className="mr-1 h-3.5 w-3.5" />
                  Konfigurera env
                </Button>
              ) : null}
              {plan.contracts.integrations.length > 0 ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[11px]"
                  onClick={openIntegrationsPanel}
                >
                  <Blocks className="mr-1 h-3.5 w-3.5" />
                  Visa integrationer
                </Button>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {plan.scaffold ? (
        <section className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Scaffold-val
          </div>
          <div className="rounded-md border border-border/60 bg-background/40 p-2.5 text-xs">
            <div className="text-sm font-medium text-foreground">{plan.scaffold.label}</div>
            <div className="mt-1 flex flex-wrap gap-2">
              {plan.scaffold.family ? <Badge variant="outline">{plan.scaffold.family}</Badge> : null}
              {plan.scaffold.source ? <Badge variant="secondary">{plan.scaffold.source}</Badge> : null}
            </div>
            {plan.scaffold.reason ? (
              <div className="mt-2 text-muted-foreground">{plan.scaffold.reason}</div>
            ) : null}
          </div>
        </section>
      ) : null}

      {plan.templateRecommendations && plan.templateRecommendations.length > 0 ? (
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            Mallrekommendationer
          </div>
          <div className="space-y-2">
            {plan.templateRecommendations.slice(0, 4).map((recommendation, index) => (
              <div
                key={`${recommendation.id || recommendation.title}-${index}`}
                className="rounded-md border border-border/60 bg-background/40 p-2.5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{recommendation.title}</span>
                  {typeof recommendation.qualityScore === "number" ? (
                    <Badge variant="outline">{Math.round(recommendation.qualityScore * 100)}%</Badge>
                  ) : null}
                </div>
                {recommendation.reason ? (
                  <div className="mt-1 text-xs text-muted-foreground">{recommendation.reason}</div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {plan.steps.length > 0 ? (
        <section className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Byggfaser
          </div>
          <ol className="list-decimal space-y-1.5 pl-4 text-sm text-muted-foreground">
            {plan.steps.map((step) => (
              <li key={step.id}>
                <span className="font-medium text-foreground">{step.title}</span>
                <span className="text-muted-foreground/80"> — {step.description}</span>
                <span className="ml-1 text-xs text-muted-foreground/60">({step.phase})</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {plan.assumptions.length > 0 ? (
        <section className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Antaganden
          </div>
          <div className="space-y-1.5">
            {plan.assumptions.map((assumption) => (
              <div
                key={assumption.id}
                className="rounded-md border border-border/60 bg-background/40 px-2.5 py-2 text-xs"
              >
                <div className="text-foreground">{assumption.description}</div>
                <div className="mt-0.5 text-muted-foreground">{assumption.defaultValue}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {unresolvedBlockers.length > 0 ? (
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-300">
            <AlertCircle className="h-3.5 w-3.5" />
            Öppna frågor
          </div>
          <div className="space-y-2">
            {unresolvedBlockers.map((blocker) => (
              <div
                key={blocker.id}
                className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-100"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="border-amber-500/40 text-[10px] text-amber-200">
                    {blocker.kind}
                  </Badge>
                </div>
                <div className="mt-1">{blocker.question}</div>
                {blocker.options?.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {blocker.options.map((option) => (
                      <Badge key={`${blocker.id}-${option}`} variant="secondary" className="text-[10px]">
                        {option}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {rawPlan && unresolvedBlockers.length === 0 && onApproveBuild ? (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" onClick={() => void onApproveBuild(rawPlan)} disabled={approveDisabled}>
            Godkänn plan och bygg
          </Button>
          <div className="self-center text-xs text-muted-foreground">
            Du kan också skriva egna ändringar i chatten om planen behöver justeras först.
          </div>
        </div>
      ) : null}
    </div>
  );
}
