/**
 * Deterministic end-of-turn summary for the builder chat.
 *
 * The codegen model answers in CodeProject format ("write code, not prose"),
 * so the assistant turn in the chat used to be nothing but a collapsed
 * "Genererat 53 filer" card. The site owner never got a plain-language
 * account of what was built or changed, and could not tell how a vague
 * request was interpreted (prod chat 28af0778: "snyggare bara" → 2 files
 * rewritten, no explanation).
 *
 * This module builds that account from facts the finalize pipeline already
 * knows — no extra LLM call, no cost, always present. It is appended to the
 * persisted assistant message and streamed as the last `content` chunk, so
 * `GenerationSummary` renders it as the prose bubble above the file card.
 *
 * Copy rules: Swedish, first person ("jag"), 2–4 sentences, no file paths
 * beyond short basenames, no telemetry vocabulary. Honest about what was
 * NOT applied (shrink guard, structural guard) and never claims the preview
 * is verified — that verdict arrives later from the preview host.
 */

export type TurnSummaryFile = {
  path: string;
  content: string;
};

export type TurnSummaryInput = {
  generationMode: "init" | "followUp";
  /** 0 = user-triggered generation, 1+ = automatic repair pass. */
  repairPassIndex?: number;
  /** The user's request for this turn (already stripped of wrapper sections). */
  userPrompt?: string | null;
  /** Full merged project after this turn. */
  files: ReadonlyArray<TurnSummaryFile>;
  /** Full project before this turn (follow-up only). */
  previousFiles?: ReadonlyArray<TurnSummaryFile> | null;
  /** Route plan names for the site (init). */
  routeNames?: ReadonlyArray<string> | null;
  /** Human labels of building blocks (dossiers) selected for this turn. */
  dossierLabels?: ReadonlyArray<string> | null;
  /** Deterministic autofix count (mechanical repairs such as missing imports). */
  autofixFixCount?: number;
  /** Files whose new content was rejected because it shrank too much. */
  rejectedShrinks?: ReadonlyArray<{ file: string }> | null;
  /** Files reverted by the element-preservation guard. */
  rejectedStructural?: ReadonlyArray<{ file: string }> | null;
  /** Preview was blocked before boot (preflight). */
  previewBlocked?: boolean;
};

/** Lenient `files_json` reader: bad JSON or a non-array yields no files (→ no summary). */
export function parseTurnSummaryFiles(filesJson: string): TurnSummaryFile[] {
  try {
    const parsed: unknown = JSON.parse(filesJson);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const { path, content } = entry as { path?: unknown; content?: unknown };
      if (typeof path !== "string" || !path.trim()) return [];
      return [{ path, content: typeof content === "string" ? content : "" }];
    });
  } catch {
    return [];
  }
}

export type TurnSummaryChanges = {
  created: string[];
  modified: string[];
  unchangedCount: number;
};

/** Characters of user prompt quoted back in the summary. */
const PROMPT_QUOTE_MAX = 90;
/** Named files before falling back to "och N till". */
const NAMED_FILES_MAX = 4;
/**
 * Prose outside code fences shorter than this is treated as "no summary":
 * a stray word or a leftover heading is not an explanation.
 */
const MODEL_PROSE_MIN_CHARS = 40;

const CODE_FENCE_RE = /```[\s\S]*?```/g;
const THINKING_RE = /<Thinking>[\s\S]*?<\/Thinking>/gi;

/**
 * `true` when the model already wrote a readable explanation outside the
 * code blocks. Then the deterministic summary stays out of the way.
 */
export function hasModelProseSummary(content: string): boolean {
  const residual = String(content ?? "")
    .replace(CODE_FENCE_RE, "")
    .replace(THINKING_RE, "")
    .replace(/(?:^|\n)[a-z0-9]+ file="[^"]+"[^\n]*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return residual.length >= MODEL_PROSE_MIN_CHARS;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.?\//, "");
}

function basename(path: string): string {
  const normalized = normalizePath(path);
  return normalized.split("/").pop() || normalized;
}

/** Files nobody would call "a change" in a chat summary. */
const HOUSEKEEPING_FILE_RE =
  /(^|\/)(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lock[b]?|next-env\.d\.ts|tsconfig\.json|next\.config\.[cm]?[jt]s|postcss\.config\.[cm]?js|eslint\.config\.[cm]?js|\.gitignore|env\.example|robots\.ts|sitemap\.ts)$/i;

export function summarizeVersionChanges(
  files: ReadonlyArray<TurnSummaryFile>,
  previousFiles: ReadonlyArray<TurnSummaryFile> | null | undefined,
): TurnSummaryChanges {
  const previous = new Map<string, string>();
  for (const file of previousFiles ?? []) {
    previous.set(normalizePath(file.path), file.content);
  }
  const created: string[] = [];
  const modified: string[] = [];
  let unchangedCount = 0;
  for (const file of files) {
    const path = normalizePath(file.path);
    if (!previous.has(path)) {
      created.push(path);
      continue;
    }
    if (previous.get(path) !== file.content) modified.push(path);
    else unchangedCount += 1;
  }
  return { created, modified, unchangedCount };
}

function listFiles(paths: ReadonlyArray<string>): string {
  const visible = paths.filter((path) => !HOUSEKEEPING_FILE_RE.test(path));
  const names = Array.from(new Set(visible.map(basename)));
  if (names.length === 0) return "";
  if (names.length <= NAMED_FILES_MAX) return names.join(", ");
  const head = names.slice(0, NAMED_FILES_MAX - 1).join(", ");
  return `${head} och ${names.length - (NAMED_FILES_MAX - 1)} till`;
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function quotePrompt(prompt: string | null | undefined): string | null {
  const text = String(prompt ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  if (text.length <= PROMPT_QUOTE_MAX) return text;
  return `${text.slice(0, PROMPT_QUOTE_MAX - 1).trimEnd()}…`;
}

function uniqueLabels(labels: ReadonlyArray<string> | null | undefined): string[] {
  return Array.from(
    new Set((labels ?? []).map((label) => String(label ?? "").trim()).filter(Boolean)),
  );
}

function joinSwedish(items: ReadonlyArray<string>): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} och ${items[items.length - 1]}`;
}

/**
 * Build the summary. Returns `null` when there is nothing meaningful to say
 * (no files at all), so callers can skip the append instead of persisting an
 * empty paragraph.
 */
export function buildTurnSummary(input: TurnSummaryInput): string | null {
  const {
    generationMode,
    repairPassIndex = 0,
    userPrompt,
    files,
    previousFiles,
    routeNames,
    dossierLabels,
    autofixFixCount = 0,
    rejectedShrinks,
    rejectedStructural,
    previewBlocked = false,
  } = input;

  if (!files || files.length === 0) return null;

  const changes = summarizeVersionChanges(files, previousFiles);
  const sentences: string[] = [];
  const dossiers = uniqueLabels(dossierLabels);
  const quote = quotePrompt(userPrompt);

  if (repairPassIndex > 0) {
    const touched = listFiles([...changes.created, ...changes.modified]);
    sentences.push(
      touched
        ? `Jag har gjort en automatisk rättning av den senaste versionen och ändrade ${touched}.`
        : "Jag har gjort en automatisk rättning av den senaste versionen.",
    );
  } else if (generationMode === "init" || !previousFiles || previousFiles.length === 0) {
    const routes = uniqueLabels(routeNames);
    const authored = files.filter((file) => !HOUSEKEEPING_FILE_RE.test(normalizePath(file.path)));
    const opening = quote
      ? `Klart — jag har byggt en första version utifrån "${quote}".`
      : "Klart — jag har byggt en första version av sajten.";
    sentences.push(opening);
    if (routes.length > 0) {
      sentences.push(
        `Sajten har ${countLabel(routes.length, "sida", "sidor")}: ${joinSwedish(routes)}.`,
      );
    }
    const parts: string[] = [];
    parts.push(`${countLabel(authored.length, "fil", "filer")} skapades`);
    if (dossiers.length > 0) parts.push(`med byggblocken ${joinSwedish(dossiers)}`);
    sentences.push(`${parts.join(" ")}.`);
  } else {
    const modified = listFiles(changes.modified);
    const created = listFiles(changes.created);
    const opening = quote
      ? `Klart — jag har uppdaterat sajten enligt "${quote}".`
      : "Klart — jag har uppdaterat sajten.";
    sentences.push(opening);
    const detail: string[] = [];
    if (modified) detail.push(`Ändrade ${modified}`);
    if (created) detail.push(`${modified ? "nya filer" : "Nya filer"}: ${created}`);
    if (detail.length > 0) {
      sentences.push(`${detail.join("; ")}.`);
    } else if (changes.created.length + changes.modified.length > 0) {
      sentences.push("Ändringarna rörde bara konfigurationsfiler.");
    } else {
      sentences.push("Inga filer behövde ändras — sajten är densamma som förut.");
    }
    if (dossiers.length > 0) {
      sentences.push(`Lade till byggblocket ${joinSwedish(dossiers)}.`);
    }
  }

  const kept = uniqueLabels([
    ...(rejectedShrinks ?? []).map((entry) => basename(entry.file)),
    ...(rejectedStructural ?? []).map((entry) => basename(entry.file)),
  ]);
  if (kept.length > 0) {
    sentences.push(
      `Obs: jag behöll den tidigare versionen av ${joinSwedish(kept)} eftersom den nya såg ut att ta bort befintligt innehåll — säg till om du faktiskt vill ha bort det.`,
    );
  }

  if (autofixFixCount > 0) {
    sentences.push(
      `Jag rättade ${countLabel(autofixFixCount, "småfel", "småfel")} automatiskt (t.ex. saknade importer).`,
    );
  }

  if (previewBlocked) {
    sentences.push(
      "Förhandsvisningen kunde inte startas för den här versionen — jag behöver rätta koden först.",
    );
  } else {
    sentences.push(
      repairPassIndex > 0 || generationMode === "followUp"
        ? "Förhandsvisningen uppdateras till höger. Vill du ändra något mer?"
        : "Förhandsvisningen startar till höger. Säg vad du vill ändra härnäst — färger, texter, en ny sektion eller något helt annat.",
    );
  }

  return sentences.join(" ");
}

/**
 * Append the summary to the model output so the persisted assistant message
 * carries it. Separated by a blank line: `GenerationSummary`'s parser treats
 * anything outside code fences as prose, and code parsers ignore trailing
 * text, so the files are unaffected.
 */
export function appendTurnSummary(content: string, summary: string | null): string {
  if (!summary) return content;
  const base = String(content ?? "").replace(/\s+$/, "");
  return base ? `${base}\n\n${summary}\n` : `${summary}\n`;
}
