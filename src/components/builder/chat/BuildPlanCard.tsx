"use client";

import { AlertCircle, Blocks, KeyRound, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type PlanArtifact, type PlanPage, normalizePlanArtifact } from "@/lib/gen/plan/schema";
import type { EngineVersionLifecycleStage } from "@/lib/db/engine-version-lifecycle";
import { openDossiersPanel } from "@/lib/builder/project-env-events";

type Props = {
  rawPlan?: Record<string, unknown>;
  onApproveBuild?: (plan: Record<string, unknown>) => void | Promise<void>;
  approveDisabled?: boolean;
  /**
   * F2 vs F3 lifecycle gate. Env / integrations panels only mount during
   * the F3 "integrations" stage; in F2 the matching action buttons are
   * hidden so they don't appear inert.
   */
  lifecycleStage?: EngineVersionLifecycleStage | null;
};

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
    <div className="border-border/60 bg-background/40 rounded-md border px-2.5 py-2 text-xs">
      <span className="text-muted-foreground">{label}:</span>{" "}
      <span className="text-foreground">{value}</span>
    </div>
  );
}

export function BuildPlanCard({
  rawPlan,
  onApproveBuild,
  approveDisabled = false,
  lifecycleStage = null,
}: Props) {
  const plan = normalizePlanArtifact(rawPlan);
  if (!plan) return null;

  const isIntegrations = lifecycleStage === "integrations";
  const requiredEnvKeys = (plan.contracts?.envVars ?? [])
    .filter((envVar) => envVar.required !== false)
    .map((envVar) => envVar.key);
  const unresolvedBlockers = plan.blockers.filter((blocker) => !blocker.resolved);

  return (
    <div className="border-border/70 bg-muted/20 mt-3 space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">Build plan</Badge>
        {siteTypeLabel(plan.siteType) ? (
          <Badge variant="secondary">{siteTypeLabel(plan.siteType)}</Badge>
        ) : null}
        {plan.pages.length > 0 ? <Badge variant="outline">{plan.pages.length} sidor</Badge> : null}
        {unresolvedBlockers.length > 0 ? (
          <Badge variant="destructive">{unresolvedBlockers.length} blockerare</Badge>
        ) : null}
        {plan.scaffold?.label ? <Badge variant="outline">{plan.scaffold.label}</Badge> : null}
      </div>

      {plan.pages.length > 0 ? (
        <section className="space-y-2">
          <div className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Sidplan
          </div>
          <div className="space-y-2">
            {plan.pages.map((page) => (
              <div
                key={`${page.id}-${page.path}`}
                className="border-border/60 bg-background/40 rounded-md border p-2.5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-foreground text-sm font-medium">{page.name}</span>
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
                  <div className="text-muted-foreground mt-1 text-xs">{pageSummary(page)}</div>
                ) : null}
                {page.sections.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {page.sections.map((section) => (
                      <Badge
                        key={`${page.id}-${section}`}
                        variant="outline"
                        className="text-[10px]"
                      >
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
          <div className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Förkontrakt
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <div className="border-border/60 bg-background/40 rounded-md border px-2.5 py-2 text-xs">
              <span className="text-muted-foreground">Datamode:</span>{" "}
              <span className="text-foreground">{plan.contracts.dataMode}</span>
            </div>
            {renderProviderRow("Databas", plan.contracts.databaseProvider)}
            {renderProviderRow("Auth", plan.contracts.authProvider)}
            {renderProviderRow("Betalning", plan.contracts.paymentProvider)}
          </div>

          {plan.contracts.integrations.length > 0 ? (
            <div className="space-y-2">
              <div className="text-foreground flex items-center gap-2 text-xs font-medium">
                <Blocks className="h-3.5 w-3.5" />
                Integrationer
              </div>
              <div className="space-y-2">
                {plan.contracts.integrations.map((integration) => (
                  <div
                    key={`${integration.provider}-${integration.name}`}
                    className="border-border/60 bg-background/40 rounded-md border p-2.5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-foreground text-sm font-medium">
                        {integration.name}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {integration.status}
                      </Badge>
                    </div>
                    {integration.reason ? (
                      <div className="text-muted-foreground mt-1 text-xs">{integration.reason}</div>
                    ) : null}
                    {integration.envVars?.length ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {integration.envVars.map((envVar) => (
                          <Badge
                            key={`${integration.provider}-${envVar}`}
                            variant="secondary"
                            className="font-mono text-[10px]"
                          >
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
              <div className="text-foreground flex items-center gap-2 text-xs font-medium">
                <KeyRound className="h-3.5 w-3.5" />
                Miljövariabler
              </div>
              <div className="flex flex-wrap gap-1.5">
                {plan.contracts.envVars.map((envVar) => (
                  <Badge
                    key={envVar.key}
                    variant={envVar.required === false ? "outline" : "secondary"}
                    className="font-mono text-[10px]"
                  >
                    {envVar.key}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}

          {isIntegrations &&
          (plan.contracts.integrations.length > 0 || requiredEnvKeys.length > 0) ? (
            <div className="flex flex-wrap gap-2">
              {requiredEnvKeys.length > 0 ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => openDossiersPanel(requiredEnvKeys)}
                >
                  <KeyRound className="mr-1 h-3.5 w-3.5" />
                  Öppna Byggblock
                </Button>
              ) : null}
              {plan.contracts.integrations.length > 0 ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => openDossiersPanel()}
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
          <div className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Scaffold-val
          </div>
          <div className="border-border/60 bg-background/40 rounded-md border p-2.5 text-xs">
            <div className="text-foreground text-sm font-medium">{plan.scaffold.label}</div>
            <div className="mt-1 flex flex-wrap gap-2">
              {plan.scaffold.id ? <Badge variant="outline">{plan.scaffold.id}</Badge> : null}
              {plan.scaffold.source ? (
                <Badge variant="secondary">{plan.scaffold.source}</Badge>
              ) : null}
            </div>
            {plan.scaffold.reason ? (
              <div className="text-muted-foreground mt-2">{plan.scaffold.reason}</div>
            ) : null}
          </div>
        </section>
      ) : null}

      {plan.variantTemplateReference ? (
        <section className="space-y-2">
          <div className="text-muted-foreground flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
            <Sparkles className="h-3.5 w-3.5" />
            Vald variantkälla
          </div>
          <div className="border-border/60 bg-background/40 rounded-md border p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-foreground text-sm font-medium">
                {plan.variantTemplateReference.title}
              </span>
              <Badge variant="outline">{plan.variantTemplateReference.category}</Badge>
              <Badge
                variant={
                  plan.variantTemplateReference.addendumState === "hit" ? "secondary" : "outline"
                }
              >
                addendum: {plan.variantTemplateReference.addendumState}
              </Badge>
            </div>
            <div className="text-muted-foreground mt-1 text-xs">
              Blob-ID: {plan.variantTemplateReference.templateId}. Strukturella utdrag:{" "}
              {plan.variantTemplateReference.hasStructuralReferences ? "ja" : "nej"}.
            </div>
          </div>
        </section>
      ) : null}

      {plan.steps.length > 0 ? (
        <section className="space-y-2">
          <div className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Byggfaser
          </div>
          <ol className="text-muted-foreground list-decimal space-y-1.5 pl-4 text-sm">
            {plan.steps.map((step) => (
              <li key={step.id}>
                <span className="text-foreground font-medium">{step.title}</span>
                <span className="text-muted-foreground/80"> — {step.description}</span>
                <span className="text-muted-foreground/60 ml-1 text-xs">({step.phase})</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {plan.assumptions.length > 0 ? (
        <section className="space-y-2">
          <div className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Antaganden
          </div>
          <div className="space-y-1.5">
            {plan.assumptions.map((assumption) => (
              <div
                key={assumption.id}
                className="border-border/60 bg-background/40 rounded-md border px-2.5 py-2 text-xs"
              >
                <div className="text-foreground">{assumption.description}</div>
                <div className="text-muted-foreground mt-0.5">{assumption.defaultValue}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {unresolvedBlockers.length > 0 ? (
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-amber-300 uppercase">
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
                  <Badge
                    variant="outline"
                    className="border-amber-500/40 text-[10px] text-amber-200"
                  >
                    {blocker.kind}
                  </Badge>
                </div>
                <div className="mt-1">{blocker.question}</div>
                {blocker.options?.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {blocker.options.map((option) => (
                      <Badge
                        key={`${blocker.id}-${option}`}
                        variant="secondary"
                        className="text-[10px]"
                      >
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
          <div className="text-muted-foreground self-center text-xs">
            Du kan också skriva egna ändringar i chatten om planen behöver justeras först.
          </div>
        </div>
      ) : null}
    </div>
  );
}
