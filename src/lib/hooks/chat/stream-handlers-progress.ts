import {
  isOwnEnginePostStreamPhaseId,
  ownEnginePostStreamStepLabelSv,
} from "@/lib/gen/stream/finalize-pipeline-contract";
import { appendToolPartToMessage } from "./helpers";
import type { SetMessages } from "./types";

const getProgressToolName = (step: string) => {
  if (isOwnEnginePostStreamPhaseId(step)) return ownEnginePostStreamStepLabelSv(step);
  if (step === "generation") return "Generering";
  if (step === "preview") return "Live-preview";
  if (step === "build-error") return "Byggfel";
  if (step === "element_guard") return "Ändringsskydd";
  return step;
};


const buildProgressSteps = (step: string, phase: string, payload: Record<string, unknown>) => {
  const durationMs =
    typeof payload.durationMs === "number" && Number.isFinite(payload.durationMs)
      ? payload.durationMs
      : null;
  const reasoningMs =
    typeof payload.reasoningMs === "number" && Number.isFinite(payload.reasoningMs)
      ? payload.reasoningMs
      : null;
  const outputMs =
    typeof payload.outputMs === "number" && Number.isFinite(payload.outputMs)
      ? payload.outputMs
      : null;
  const errorCount =
    typeof payload.errorCount === "number" && Number.isFinite(payload.errorCount)
      ? payload.errorCount
      : null;
  const pass = typeof payload.pass === "number" && Number.isFinite(payload.pass) ? payload.pass : null;
  const fixes = typeof payload.fixes === "number" && Number.isFinite(payload.fixes) ? payload.fixes : null;
  const warnings =
    typeof payload.warnings === "number" && Number.isFinite(payload.warnings) ? payload.warnings : null;
  const dependencies =
    typeof payload.dependencies === "number" && Number.isFinite(payload.dependencies)
      ? payload.dependencies
      : null;
  const errorsAfter =
    typeof payload.errorsAfter === "number" && Number.isFinite(payload.errorsAfter)
      ? payload.errorsAfter
      : null;
  const fixerUsed = payload.fixerUsed === true;
  const fileCount =
    typeof payload.fileCount === "number" && Number.isFinite(payload.fileCount) ? payload.fileCount : null;
  const versionId =
    typeof payload.versionId === "string" && payload.versionId.trim().length > 0
      ? payload.versionId.trim()
      : null;
  const fixers = Array.isArray(payload.fixers)
    ? payload.fixers
        .map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>) : null))
        .filter((item): item is Record<string, unknown> => Boolean(item))
    : [];
  const formatFixerLabel = (fixer: Record<string, unknown>) => {
    const name =
      typeof fixer.fixer === "string" && fixer.fixer.trim() ? fixer.fixer.trim() : "okänd fixer";
    const count =
      typeof fixer.count === "number" && Number.isFinite(fixer.count) ? fixer.count : 0;
    return `${name} ×${count}`;
  };
  const formatFixerExamples = () =>
    fixers
      .flatMap((fixer) =>
        Array.isArray(fixer.examples)
          ? fixer.examples.map((example) => String(example).trim()).filter(Boolean)
          : [],
      )
      .slice(0, 3);
  const formatSeconds = (ms: number) => `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)}s`;
  const doneSuffix = durationMs !== null ? ` (${formatSeconds(durationMs)})` : "";

  if (step === "generation") {
    if (phase === "start") return ["Startar own-engine-strömmen."];
    if (phase === "reasoning") {
      return ["Modellen analyserar uppgiften innan första synliga outputen kommer."];
    }
    if (phase === "reasoning-slow") {
      const elapsedMs =
        typeof payload.elapsedMs === "number" && Number.isFinite(payload.elapsedMs)
          ? payload.elapsedMs
          : null;
      return [
        elapsedMs !== null
          ? `Modellen analyserar fortfarande uppgiften (${formatSeconds(elapsedMs)}).`
          : "Modellen analyserar fortfarande uppgiften.",
      ];
    }
    if (phase === "awaiting-output") {
      return ["Väntar på första kod- eller textoutput från modellen."];
    }
    if (phase === "streaming") return ["Genererar innehåll och filer från prompten."];
    if (phase === "awaiting-input") {
      return ["Genereringen pausades eftersom modellen behöver mer input eller konfiguration."];
    }
    if (phase === "empty-output") {
      return ["Genereringen avslutades utan användbar kod eller preview-artifact."];
    }
    if (phase === "stream-without-version") {
      return [
        "Innehåll strömmades till chatten men kunde inte sparas som version. Texten ovan finns kvar.",
      ];
    }
    if (phase === "tool") {
      const toolName = typeof payload.toolName === "string" ? payload.toolName.trim() : "";
      return [
        toolName
          ? `Modellen kör verktyget "${toolName}" (integration, plan eller fråga).`
          : "Modellen kör ett verktyg — väntar på nästa kodoutput.",
      ];
    }
    if (phase === "done") {
      const lines = [`Generering klar${doneSuffix}. Startar efterkontroller och slutsteg.`];
      if (reasoningMs !== null || outputMs !== null) {
        lines.push(
          `Faser: reasoning ${formatSeconds(reasoningMs ?? 0)}, output ${formatSeconds(outputMs ?? 0)}.`,
        );
      }
      return lines;
    }
  }
  if (step === "autofix") {
    if (phase === "start") return ["Mekanisk autofix startad."];
    if (phase === "done") {
      const summary: string[] = [`Mekanisk autofix klar${doneSuffix}.`];
      if (fixes !== null || warnings !== null) {
        summary.push(
          `Fixar: ${fixes ?? 0}${warnings !== null ? `, varningar: ${warnings}` : ""}${dependencies !== null ? `, dependencies: ${dependencies}` : ""}.`,
        );
      }
      if ((fixes ?? 0) === 0 && fixers.length === 0) {
        summary.push("Inga mekaniska fixar behövdes.");
      } else if (fixers.length > 0) {
        summary.push(`Fixers: ${fixers.slice(0, 6).map(formatFixerLabel).join(", ")}.`);
        const examples = formatFixerExamples();
        if (examples.length > 0) summary.push(`Exempel: ${examples.join(" • ")}.`);
      }
      return summary;
    }
    if (phase === "error") return ["Mekanisk autofix misslyckades. Fortsätter med rått innehåll."];
  }
  if (step === "verifier") {
    if (phase === "start") {
      return ["Verifiering: läser av projektet efter syntax (ingen kodändring i detta steg)."];
    }
    if (phase === "done") {
      const bc =
        typeof payload.blockingCount === "number" && Number.isFinite(payload.blockingCount)
          ? payload.blockingCount
          : null;
      const qc =
        typeof payload.qualityCount === "number" && Number.isFinite(payload.qualityCount)
          ? payload.qualityCount
          : null;
      return [
        `Verifiering klar${doneSuffix}.${bc !== null ? ` Blockerande fynd: ${bc}.` : ""}${qc !== null ? ` Kvalitetsanteckningar: ${qc}.` : ""}`,
      ];
    }
    if (phase === "error") return ["Verifiering misslyckades; fortsätter med nuvarande kod."];
    if (phase === "skipped") return ["Verifiering hoppades över."];
  }
  if (step === "url_expand") {
    if (phase === "start") return ["Expanderar kortade URL:er till fulla adresser."];
    if (phase === "done") return [`URL-expansion klar${doneSuffix}.`];
  }
  if (step === "materialize_images") {
    if (phase === "start") return ["Materialiserar bildplatshållare (t.ex. riktiga bild-URL:er)…"];
    if (phase === "done") {
      const replaced =
        typeof payload.replacedCount === "number" && Number.isFinite(payload.replacedCount)
          ? payload.replacedCount
          : null;
      if (replaced !== null && replaced > 0) {
        return [`Bytte ut ${replaced} bildplatshållare${doneSuffix}.`];
      }
      return [`Inga bildplatshållare behövde bytas${doneSuffix}.`];
    }
    if (phase === "error") {
      return ["Bildmaterialisering misslyckades; platshållare kan kvarstå."];
    }
  }
  if (step === "validate_syntax") {
    if (phase === "start" || phase === "validating") {
      return [`Validerar genererad kod${pass ? ` (pass ${pass})` : ""}.`];
    }
    if (phase === "fixing") {
      // Tidigare: "Försöker reparera syntaxfel..." — gav intryck av att
      // något var allvarligt fel. Det här är normal autofix-poleringen
      // som körs på varje generation och nästan alltid lyckas inom
      // några sekunder. Neutralare formulering.
      return [
        `Polerar syntax${pass ? ` (pass ${pass})` : ""}${errorCount !== null ? `, ${errorCount} småfel` : ""}.`,
      ];
    }
    if (phase === "retrying") {
      return [`Kör om valideringen efter fixförsök${pass ? ` i pass ${pass}` : ""}.`];
    }
    if (phase === "passed") return ["Validering klar."];
    if (phase === "done") {
      const details = [`Syntaxvalidering klar${doneSuffix}.`];
      if (pass !== null || errorsAfter !== null) {
        details.push(
          `${pass ?? 1} pass, ${errorsAfter ?? errorCount ?? 0} kvarvarande fel${fixerUsed ? " efter fixförsök" : ""}.`,
        );
      }
      return details;
    }
    if (phase === "gave-up") {
      return [
        `Valideringen gav upp${errorCount !== null ? ` med ${errorCount} kvarvarande fel` : ""}.`,
      ];
    }
    if (phase === "error") return ["Valideringen misslyckades."];
  }
  if (step === "parse_merge_preflight") {
    if (phase === "start") return ["Finaliserar filer, gör project checks och sparar versionen."];
    if (phase === "done") {
      const details: string[] = [`Finalisering klar${doneSuffix}.`];
      if (fileCount !== null) details.push(`Filer i versionen: ${fileCount}.`);
      if (versionId) details.push(`Version: ${versionId}.`);
      details.push("Versionen sparades.");
      return details;
    }
  }
  if (step === "element_guard") {
    // M#p7a: the server's Element Preservation Guard / shrink-guard can
    // silently revert a follow-up file to the previous version (it protects
    // against token-truncation dropping <video>/<canvas>/<form> etc.). The
    // server emits `rejectedStructural`/`rejectedShrinks` on SSE `done`, but
    // no client surface consumed them — so the user's edit could vanish with
    // no explanation. Surface it explicitly here.
    const structural = Array.isArray(payload.rejectedStructural)
      ? (payload.rejectedStructural as Array<{
          file?: unknown;
          droppedElements?: Array<{ label?: unknown; kind?: unknown }>;
        }>)
      : [];
    const shrinks = Array.isArray(payload.rejectedShrinks)
      ? (payload.rejectedShrinks as Array<{ file?: unknown }>)
      : [];
    const lines: string[] = [];
    for (const entry of structural) {
      // Defensive: the SSE `done` callback must never throw on a malformed
      // payload (e.g. a null array entry), so skip non-object items.
      if (!entry || typeof entry !== "object") continue;
      const file = typeof entry.file === "string" ? entry.file : "okänd fil";
      const labels = Array.isArray(entry.droppedElements)
        ? entry.droppedElements
            .map((el) => (el && typeof el.label === "string" ? el.label : null))
            .filter((l): l is string => Boolean(l))
        : [];
      lines.push(
        `Ändringen i ${file} återställdes till föregående version för att bevara viktiga element${
          labels.length > 0 ? ` (${labels.join(", ")})` : ""
        }. Beskriv ändringen tydligare och försök igen om den var avsiktlig.`,
      );
    }
    for (const entry of shrinks) {
      if (!entry || typeof entry !== "object") continue;
      const file = typeof entry.file === "string" ? entry.file : "okänd fil";
      lines.push(
        `Ändringen i ${file} återställdes eftersom det nya innehållet var kraftigt förkortat (sannolik avhuggen output). Föregående version behölls, så inget gick förlorat — be om ändringen igen om den var avsiktlig.`,
      );
    }
    if (lines.length === 0) {
      lines.push("En eller flera follow-up-ändringar återställdes av ändringsskyddet.");
    }
    return lines;
  }
  if (step === "preview") {
    if (phase === "starting") {
      return ["Startar tier-2-preview (VM) ..."];
    }
    if (phase === "boot-queued") {
      return [
        "Preview-sessionen är skapad. Miljön fortsätter starta i previewytan.",
      ];
    }
    if (phase === "ready") {
      return ["Live-preview är klar."];
    }
    if (phase === "build-verified") {
      return ["Production build (npm run build) lyckades i verifierings-VM — separat från dev-preview."];
    }
    if (phase === "build-failed") {
      return [
        "Production build misslyckades i verifierings-VM. Dev-server-preview kan ändå vara användbar.",
      ];
    }
    if (phase === "error") {
      const message =
        typeof payload.message === "string" && payload.message.trim()
          ? payload.message.trim()
          : null;
      return [
        message
          ? `Live-preview kunde inte starta: ${message}`
          : "Live-preview kunde inte starta.",
      ];
    }
  }
  return [`${getProgressToolName(step)}: ${phase}`];
};

export type ProgressPartState = "output-available" | "output-error" | "input-streaming";

/**
 * Maps an SSE progress `(step, phase)` onto the tool-part state the Agentlogg
 * renders. Exported purely so the classification is testable — the rest of the
 * progress plumbing lives in closures inside `createStreamHandlers`.
 *
 * `reverted` belongs with the completed phases. The Element Preservation /
 * shrink guard reverting a file is the guard succeeding: the run continues,
 * the version is saved and the preview boots. It is surfaced as a warning
 * (log line + toast), never as a failed step. Note that anything not listed
 * here renders as an in-progress spinner, so a phase that ends a step must be
 * classified as completed or failed — not simply dropped from `failed`.
 */
export function resolveProgressPartState(step: string, phase: string): ProgressPartState {
  const completed =
    phase === "passed" ||
    phase === "done" ||
    phase === "reverted" ||
    phase === "tsc-skipped" ||
    (step === "preview" &&
      (phase === "boot-queued" || phase === "ready" || phase === "build-verified"));
  if (completed) return "output-available";
  const failed =
    phase === "error" ||
    phase === "gave-up" ||
    phase === "fix-failed" ||
    (step === "preview" && phase === "build-failed");
  return failed ? "output-error" : "input-streaming";
}

export function appendProgressPart(
  setMessages: SetMessages,
  assistantMessageId: string,
  step: string,
  phase: string,
  payload: Record<string, unknown> = {},
) {
    appendToolPartToMessage(setMessages, assistantMessageId, {
      type: `tool:engine-${step}` as const,
      toolName: getProgressToolName(step),
      toolCallId: `progress:${step}`,
      state: resolveProgressPartState(step, phase),
      output: {
        step,
        phase,
        ...payload,
        steps: buildProgressSteps(step, phase, payload),
      },
    } as Parameters<typeof appendToolPartToMessage>[2]);
}
