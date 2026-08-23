"use client";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { AlertTriangle, Check, ChevronDown, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ToolUIPart } from "ai";
import type { AgentLogItem, ToolPart } from "./types";
import { getToolStateLabel, resolveToolLabels } from "./output-parsers";

const PRE_STREAM_ACTIVITY = "Förbereder byggunderlag och startar own-engine.";
const BETWEEN_PHASES_ACTIVITY = "Fortsätter med nästa byggsteg.";

export function AgentLogCard({
  items,
  activeLabel,
  isActive = false,
}: {
  items: AgentLogItem[];
  activeLabel?: string | null;
  isActive?: boolean;
}) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const activeStartedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isActive) return undefined;
    if (activeStartedAtRef.current === null) {
      activeStartedAtRef.current = Date.now();
    }
    const timer = window.setInterval(() => {
      const startedAt = activeStartedAtRef.current;
      if (startedAt !== null) {
        setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
      }
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [isActive]);

  if (items.length === 0 && !isActive) return null;
  return (
    <AgentLogCardContent
      key={isActive ? "active" : "complete"}
      items={items}
      activeLabel={activeLabel}
      isActive={isActive}
      elapsedSeconds={elapsedSeconds}
    />
  );
}

function AgentLogCardContent({
  items,
  activeLabel,
  isActive,
  elapsedSeconds,
}: {
  items: AgentLogItem[];
  activeLabel?: string | null;
  isActive: boolean;
  elapsedSeconds: number;
}) {
  const [open, setOpen] = useState(isActive);

  const currentLabel =
    activeLabel?.trim() ||
    (items.length === 0 ? PRE_STREAM_ACTIVITY : BETWEEN_PHASES_ACTIVITY);
  const matchingActiveIndex = isActive
    ? items.map((item) => item.label).lastIndexOf(currentLabel)
    : -1;
  const visibleItems =
    isActive && matchingActiveIndex === -1
      ? [...items, { label: currentLabel }]
      : items;
  const activeItemIndex =
    isActive && matchingActiveIndex === -1 ? visibleItems.length - 1 : matchingActiveIndex;
  const hasFailures = items.some((item) => item.failed);
  const activeItemFailed =
    activeItemIndex >= 0 && visibleItems[activeItemIndex]?.failed === true;
  const surfaceFailure = hasFailures;

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn(
        "mb-3 overflow-hidden rounded-lg border transition-colors",
        surfaceFailure
          ? "border-destructive/35 bg-destructive/5"
          : isActive
            ? "border-primary/35 bg-primary/5"
            : "border-border bg-muted/30",
      )}
    >
      <CollapsibleTrigger className="hover:bg-muted/40 flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors">
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
            surfaceFailure
              ? "bg-destructive/15 text-destructive"
              : isActive
                ? "bg-primary/15 text-primary"
                : "bg-muted text-muted-foreground",
          )}
        >
          {surfaceFailure ? (
            <AlertTriangle className="h-3.5 w-3.5" aria-label="Ett byggsteg misslyckades" />
          ) : isActive ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Check className="h-3.5 w-3.5" aria-hidden />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-xs font-semibold">
            {isActive
              ? activeItemFailed
                ? "Ett byggsteg misslyckades"
                : hasFailures
                  ? "Arbetar vidare efter fel"
                  : "Arbetar med din sajt"
              : `Slutsteg (${items.length})${hasFailures ? " · fel" : ""}`}
            {isActive ? (
              <span className="text-muted-foreground font-normal tabular-nums">
                {elapsedSeconds}s
              </span>
            ) : null}
          </span>
          <span
            className={cn(
              "mt-0.5 block truncate text-xs",
              isActive ? "text-foreground/80" : "text-muted-foreground",
            )}
            aria-live="polite"
          >
            {isActive
              ? currentLabel
              : open
                ? "Dölj detaljer"
                : hasFailures
                  ? "Fel upptäcktes — visa detaljer"
                  : "Visa detaljer"}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "text-muted-foreground h-4 w-4 shrink-0 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="border-border/60 space-y-1 border-t px-3 py-2.5 text-xs">
          {visibleItems.length === 0 ? (
            <li className="text-foreground/80 flex items-center gap-2 py-1">
              <Loader2 className="text-primary h-3.5 w-3.5 animate-spin" aria-hidden />
              <span>{currentLabel}</span>
            </li>
          ) : (
            visibleItems.map((item, index) => {
              const itemIsActive = isActive && index === activeItemIndex;
              return (
                <li
                  key={`agent-${index}`}
                  className={cn(
                    "flex items-start gap-2 rounded-md px-2 py-1.5 transition-colors",
                    item.failed
                      ? "bg-destructive/10 text-destructive"
                      : itemIsActive
                        ? "bg-primary/10 text-foreground"
                        : "text-muted-foreground",
                  )}
                >
                  {item.failed ? (
                    <AlertTriangle
                      className="text-destructive mt-0.5 h-3.5 w-3.5 shrink-0"
                      aria-label="Steget misslyckades"
                    />
                  ) : itemIsActive ? (
                    <Loader2
                      className="text-primary mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin"
                      aria-hidden
                    />
                  ) : (
                    <Check
                      className="text-muted-foreground/70 mt-0.5 h-3.5 w-3.5 shrink-0"
                      aria-hidden
                    />
                  )}
                  {item.detail ? (
                    <AgentLogDetailRow label={item.label} detail={item.detail} />
                  ) : (
                    <span className="min-w-0 flex-1">{item.label}</span>
                  )}
                  {item.failed ? (
                    <span className="text-destructive shrink-0 text-[10px] font-medium uppercase tracking-wide">
                      Fel
                    </span>
                  ) : itemIsActive ? (
                    <span className="text-primary shrink-0 text-[10px] font-medium uppercase tracking-wide">
                      Pågår
                    </span>
                  ) : null}
                </li>
              );
            })
          )}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

function AgentLogDetailRow({ label, detail }: { label: string; detail: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="min-w-0 flex-1"
    >
      <CollapsibleTrigger
        className="hover:text-foreground flex w-full items-center gap-1 text-left"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="min-w-0 flex-1">{label}</span>
        <ChevronDown
          className={cn(
            "text-muted-foreground h-3 w-3 shrink-0 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <p className="text-foreground/80 mt-1 whitespace-pre-wrap break-words text-[11px] leading-relaxed">
          {detail}
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}

function readDeepBriefVisibilityItem(
  tool: Partial<ToolUIPart> & { type?: string },
): AgentLogItem | null {
  const output = tool.output;
  if (!output || typeof output !== "object") return null;
  const rec = output as Record<string, unknown>;
  const reasoning =
    typeof rec.deepBriefReasoning === "string" && rec.deepBriefReasoning.trim()
      ? rec.deepBriefReasoning.trim()
      : null;
  if (reasoning) {
    return { label: "Deep Brief (resonemang)", detail: reasoning };
  }
  const blueprint =
    typeof rec.deepBriefBlueprint === "string" && rec.deepBriefBlueprint.trim()
      ? rec.deepBriefBlueprint.trim()
      : null;
  if (blueprint) {
    return { label: "Deep Brief (ritning)", detail: blueprint };
  }
  return null;
}

function isDeepBriefFactStep(step: string): boolean {
  return step.startsWith("Deep Brief-") || step.startsWith("Deep brief-");
}

export function buildAgentLogItems(toolParts: ToolPart[]) {
  const items: AgentLogItem[] = [];
  toolParts.forEach((part) => {
    const tool = part.tool as Partial<ToolUIPart> & { type?: string; input?: unknown };
    const toolState = (
      typeof tool.state === "string" ? tool.state : "input-available"
    ) as ToolUIPart["state"];
    const { toolTitle } = resolveToolLabels(tool);
    const steps = extractToolSteps(tool);

    const toolFailed = toolState === "output-error";

    if (steps.length > 0) {
      const visibility = readDeepBriefVisibilityItem(tool);
      let visibilityInserted = false;
      steps.forEach((step, stepIndex) => {
        const isLastStep = stepIndex === steps.length - 1;
        items.push(
          toolFailed && isLastStep ? { label: step, failed: true } : { label: step },
        );
        if (
          visibility &&
          !visibilityInserted &&
          isDeepBriefFactStep(step) &&
          (isLastStep || !isDeepBriefFactStep(steps[stepIndex + 1] ?? ""))
        ) {
          items.push(visibility);
          visibilityInserted = true;
        }
      });
      if (visibility && !visibilityInserted) {
        items.push(visibility);
      }
    } else {
      const label = `${toolTitle} • ${getToolStateLabel(toolState)}`;
      items.push(toolFailed ? { label, failed: true } : { label });
    }
  });

  return items;
}

export function getActiveAgentLogLabel(
  toolParts: ToolPart[],
  options: { includePipelineProgress?: boolean } = {},
): string | null {
  const includePipelineProgress = options.includePipelineProgress !== false;
  for (let index = toolParts.length - 1; index >= 0; index -= 1) {
    const tool = toolParts[index]?.tool as Partial<ToolUIPart> & {
      type?: string;
      input?: unknown;
    };
    if (tool?.state !== "input-streaming") continue;
    const toolType = String(tool.type ?? "");
    if (
      !includePipelineProgress &&
      toolType.startsWith("tool:engine-") &&
      toolType !== "tool:engine-preview"
    ) {
      continue;
    }
    const steps = extractToolSteps(tool);
    const latestStep = steps.at(-1)?.trim();
    if (latestStep) return latestStep;
    const { toolTitle } = resolveToolLabels(tool);
    return `${toolTitle} • ${getToolStateLabel(tool.state)}`;
  }
  return null;
}

function extractToolSteps(tool: Partial<ToolUIPart> & { input?: unknown }) {
  const output = tool.output;
  if (typeof output === "string") {
    return splitToSteps(output);
  }
  if (Array.isArray(output)) {
    return output
      .map((item) => extractStepFromValue(item))
      .filter((item): item is string => Boolean(item));
  }
  if (output && typeof output === "object") {
    const obj = output as Record<string, unknown>;
    const listFromKeys = coerceStringArray(
      obj.steps ?? obj.actions ?? obj.results ?? obj.messages ?? obj.items,
    );
    if (listFromKeys.length > 0) return listFromKeys;

    if (Array.isArray(obj.files)) {
      const fileSteps = obj.files
        .map((item) => extractStepFromValue(item))
        .filter((item): item is string => Boolean(item));
      if (fileSteps.length > 0) return fileSteps;
    }

    if (Array.isArray(obj.images) || Array.isArray(obj.assets)) {
      const assets = (obj.images ?? obj.assets) as unknown[];
      if (assets.length > 0) {
        return assets
          .map((item) => extractStepFromValue(item))
          .filter((item): item is string => Boolean(item));
      }
    }

    if (typeof obj.repaired === "boolean") {
      const lines: string[] = [
        obj.repaired ? "Server repair lyckades." : "Server repair blev inte fullständig.",
      ];
      if (typeof obj.method === "string" && obj.method.trim()) {
        lines.push(`Metod: ${obj.method.trim()}`);
      }
      const syntaxCleanGateFailed = obj.syntaxCleanGateFailed === true;
      if (syntaxCleanGateFailed) {
        lines.push("Kvarvarande fel: 0 syntaxfel (esbuild) — men quality gate (typecheck/build) failar fortfarande");
      } else if (typeof obj.remainingErrors === "number" && Number.isFinite(obj.remainingErrors)) {
        const sourceLabel =
          obj.remainingErrorsSource === "esbuild_syntax"
            ? "syntax (esbuild)"
            : obj.remainingErrorsSource === "quality_gate"
              ? "quality gate"
              : null;
        lines.push(
          sourceLabel
            ? `Kvarvarande fel: ${obj.remainingErrors} (${sourceLabel})`
            : `Kvarvarande fel: ${obj.remainingErrors}`,
        );
      }
      if (typeof obj.improvedSyntax === "boolean") {
        lines.push(`Syntax förbättrades: ${obj.improvedSyntax ? "ja" : "nej"}`);
      }
      if (typeof obj.earlyStopReason === "string" && obj.earlyStopReason.trim()) {
        lines.push(`Stopporsak: ${obj.earlyStopReason.trim()}`);
      }
      if (typeof obj.newVersionId === "string" && obj.newVersionId.trim()) {
        lines.push(`Ny version: ${obj.newVersionId.trim()}`);
      }
      return lines;
    }
  }

  const input = tool.input;
  if (input && typeof input === "object") {
    const inputObj = input as Record<string, unknown>;
    const integrationName =
      (typeof inputObj.integration === "string" && inputObj.integration) ||
      (typeof inputObj.provider === "string" && inputObj.provider) ||
      (typeof inputObj.service === "string" && inputObj.service) ||
      (typeof inputObj.name === "string" && inputObj.name) ||
      null;
    if (integrationName) {
      return [`Begär integration: ${integrationName}`];
    }
  }

  return [];
}

function extractStepFromValue(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const label =
      (typeof obj.label === "string" && obj.label) ||
      (typeof obj.title === "string" && obj.title) ||
      (typeof obj.name === "string" && obj.name) ||
      (typeof obj.status === "string" && obj.status) ||
      null;
    return label ? String(label) : null;
  }
  return null;
}

function splitToSteps(text: string) {
  const normalized = text.trim();
  if (!normalized) return [];
  const lines = normalized
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines.length > 0 ? lines : [normalized];
}

function coerceStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter((item) => item.trim().length > 0);
}

