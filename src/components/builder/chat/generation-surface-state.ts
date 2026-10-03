import { extractToolSummaries, resolveToolLabels } from "./tooling/output-parsers";
import type { ToolPart } from "./tooling/types";

/** Presentation label for one assistant surface — not a backend event type. */
export type GenerationTurnKind = "initial" | "followup" | "repair";

/** Reviews belong in the shared detail drawer; user decisions stay visible. */
export function isGenerationReviewPart(part: ToolPart): boolean {
  if (part.tool.state === "approval-requested") return false;
  const { toolType } = resolveToolLabels(part.tool);
  return ["tool-post-check", "tool-quality-gate", "tool-live-review"].includes(toolType);
}

/**
 * Köad klientreparation är status, inte en kvarvarande varning.
 *
 * `autoFixQueued` betyder att en AUTO-FIX-tur har startats (eller ska startas).
 * Rubriken ägs av `hasQueuedAutoFix` — den får inte låna "Kontroller att se
 * över" när den enda signalen är att fixen redan är köad.
 */
export function hasQueuedAutoFix(toolParts: ToolPart[]): boolean {
  return toolParts.some(({ tool }) => {
    if (tool.state !== "output-available") return false;
    const { toolType } = resolveToolLabels(tool);
    const { postCheck } = extractToolSummaries(toolType, tool.output);
    return postCheck?.autoFixQueued === true;
  });
}

/** Presentation only. Never turns a finished stream into a readiness verdict. */
export function hasGenerationWarnings(toolParts: ToolPart[]): boolean {
  return toolParts.some(({ tool }) => {
    if (tool.state === "output-error") return true;
    if (tool.state !== "output-available") return false;
    const { toolType } = resolveToolLabels(tool);
    const { postCheck, qualityGate, liveReview } = extractToolSummaries(toolType, tool.output);
    return (
      (postCheck?.warnings ?? 0) > 0 ||
      // `provisional` without a pending verify-lane and without a queued autofix
      // means readiness FAILED terminally (degenerate output). Nothing will run
      // to clear it, so it is a warning — not the pending state below.
      (postCheck?.provisional === true &&
        !postCheck.qualityGatePending &&
        !postCheck.autoFixQueued) ||
      qualityGate?.retryPending === true ||
      Boolean(
        qualityGate &&
        !qualityGate.skipped &&
        (!qualityGate.passed || qualityGate.designAdvisory || qualityGate.qualityGateAdvisory),
      ) ||
      (liveReview?.status === "completed" && liveReview.decision.verdict !== "pass")
    );
  });
}

/**
 * Orsaksraden som prompt-strategy redan visar i arbetsloggen. Återanvänds så
 * reparationskortet kan lyfta den överst utan en andra sanning.
 */
export function readAutoRepairCause(toolParts: ToolPart[]): string | null {
  for (const { tool } of toolParts) {
    if (tool.state !== "output-available") continue;
    const { toolType } = resolveToolLabels(tool);
    if (toolType !== "tool-prompt-strategy") continue;
    const output = tool.output;
    if (!output || typeof output !== "object") continue;
    const steps = (output as { steps?: unknown }).steps;
    if (!Array.isArray(steps)) continue;
    for (const step of steps) {
      if (typeof step === "string" && step.startsWith("Orsak:")) {
        const cause = step.trim();
        if (cause.length > "Orsak:".length) return cause;
      }
    }
  }
  return null;
}

/**
 * Sant medan en efterkontroll fortfarande återstår för turen.
 *
 * Varför den inte är ett `some()` som de andra: post-checken bär
 * `qualityGatePending` från ögonblicket den skrevs och ändras aldrig i
 * efterhand, medan domen kommer i en SENARE `tool-quality-gate`-del. Delarna
 * läses därför i ordning — en landad dom stänger fönstret, en serverägd gate
 * lämnar det uttryckligen öppet (ReleaseGate körs av servern).
 *
 * Ett noll i varningsräknaren betydde tidigare "klart" i kortets rubrik även
 * när verify-lanen just hade startat (Sol-review på #1338). Pågående kontroll
 * är inte ett fel — den har ett eget, lugnt tillstånd.
 */
export function hasPendingVerification(toolParts: ToolPart[]): boolean {
  let pending = false;
  for (const { tool } of toolParts) {
    const { toolType } = resolveToolLabels(tool);
    if (toolType === "tool-post-check") {
      if (tool.state !== "output-available") continue;
      const { postCheck } = extractToolSummaries(toolType, tool.output);
      if (postCheck) pending = postCheck.qualityGatePending;
      continue;
    }
    if (toolType !== "tool-quality-gate") continue;
    if (tool.state === "output-error") {
      pending = false;
      continue;
    }
    if (tool.state !== "output-available") continue;
    const { qualityGate } = extractToolSummaries(toolType, tool.output);
    // `null` = the part is not a gate verdict at all (the server-repair card
    // shares this event type), so it must not close the window.
    if (!qualityGate) continue;
    pending = qualityGate.skipped && qualityGate.serverOwned === true;
  }
  return pending;
}

/**
 * Sant när en serverreparation ligger klar men inte är applicerad.
 *
 * Själva knappen bor i versionspanelen; det här är bara beskedet om att den
 * finns. Det måste synas med stängda detaljer, annars är en färdig fix
 * osynlig för den som inte öppnar lådan (Sol-review på #1338). En senare
 * reparationsrunda med annan status stänger beskedet.
 */
export function hasRepairAwaitingAccept(toolParts: ToolPart[]): boolean {
  let awaiting = false;
  for (const { tool } of toolParts) {
    if (tool.state !== "output-available") continue;
    const { toolType } = resolveToolLabels(tool);
    const { serverRepair } = extractToolSummaries(toolType, tool.output);
    if (!serverRepair) continue;
    awaiting = serverRepair.status === "repair_available";
  }
  return awaiting;
}
