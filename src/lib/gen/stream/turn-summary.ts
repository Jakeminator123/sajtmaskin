import { appendStreamWarning, splitTrailingStreamWarning } from "@/lib/builder/stream-warning";

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
 * When repair rebuilds the files and drops the model's explanation, an
 * adequate raw explanation is recovered onto the message only — never back
 * into the file serialization.
 *
 * Copy rules (UX-granskningen 2026-11-11): Swedish, first person ("jag"),
 * a few short sentences that say what changed in the owner's words
 * (startsidan, sidan /meny, sajtens stil), never the user's whole request
 * quoted back. The receipt only knows that the version is SAVED: it never
 * says the change is visible — the preview may show it minutes later.
 * Honest about what was NOT applied (shrink guard, structural guard), about
 * a blocked preview, and, on the first build, about invented business facts.
 * File names and automatic repairs go in a trailing paragraph that starts
 * with `TURN_SUMMARY_TECHNICAL_PREFIX`; the chat folds it into the
 * details drawer. Stored as plain text, so old messages render as before.
 */

/**
 * Prefix of the trailing technical paragraph. The chat (`GenerationSurface`)
 * moves a paragraph that starts with it into "Visa detaljer".
 */
export const TURN_SUMMARY_TECHNICAL_PREFIX = "Tekniska detaljer:";

/**
 * First build only: the generator fills gaps in the brief with plausible
 * examples. Until the owner decides how to handle that, the receipt says so.
 */
const EXAMPLE_FACTS_NOTE =
  "Kontrollera uppgifter som öppettider, priser, kontaktuppgifter och omdömen: det du inte själv har angett är exempel som du behöver byta ut.";

export type TurnSummaryFile = {
  path: string;
  content: string;
};

export type TurnSummaryInput = {
  generationMode: "init" | "followUp";
  /** 0 = user-triggered generation, 1+ = automatic repair pass. */
  repairPassIndex?: number;
  /**
   * The user's request for this turn. Not quoted back since 2026-11-11: the
   * chat already shows it right above, and a quote read as a promise that
   * everything in it was done.
   */
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

/** Named files before falling back to "och N till". */
const NAMED_FILES_MAX = 4;
/** Named pages before falling back to "N sidor". */
const NAMED_PAGES_MAX = 3;
/**
 * Prose outside code fences shorter than this is treated as "no summary":
 * a stray word or a leftover heading is not an explanation.
 */
const MODEL_PROSE_MIN_CHARS = 40;

const HUMAN_LETTER_RE = /\p{L}/u;

/**
 * Same residual as the chat bubble: drop closed fences and thinking, then cut
 * at the earliest open fence or bare `lang file="…"` tail. Keep paragraphs.
 */
function stripGeneratedCodeResidue(body: string): string {
  let residual = body
    .replace(/```[^\n]*\n[\s\S]*?^```[ \t]*\r?$/gm, "")
    .replace(/<Thinking>[\s\S]*?<\/Thinking>/gi, "");
  const unclosedThinking = /<Thinking>/i.exec(residual);
  if (unclosedThinking) residual = residual.slice(0, unclosedThinking.index);

  const fenceMatch = /```[^\n]*(?:\n|$)/.exec(residual);
  const streamMatch = /(?:^|\n)[a-z0-9]+ file="[^"]+"[^\n]*(?:\n|$)/.exec(residual);
  const candidates: number[] = [];
  if (fenceMatch) candidates.push(fenceMatch.index);
  if (streamMatch) {
    candidates.push(streamMatch.index + (streamMatch[0].startsWith("\n") ? 1 : 0));
  }
  if (candidates.length > 0) residual = residual.slice(0, Math.min(...candidates));
  return residual.replace(/\n{3,}/g, "\n\n").trim();
}

function proseIsAdequate(prose: string): boolean {
  const collapsed = prose.replace(/\s+/g, " ").trim();
  return collapsed.length >= MODEL_PROSE_MIN_CHARS && HUMAN_LETTER_RE.test(collapsed);
}

/**
 * Explanation outside the files. `null` when nothing adequate remains, so a
 * code tail cannot suppress or replace the deterministic summary.
 */
export function extractUsefulModelProse(content: string): string | null {
  const { body } = splitTrailingStreamWarning(String(content ?? ""));
  const prose = stripGeneratedCodeResidue(body);
  return proseIsAdequate(prose) ? prose : null;
}

/**
 * `true` when the model already wrote a readable explanation outside the
 * code blocks. Then the deterministic summary stays out of the way.
 */
export function hasModelProseSummary(content: string): boolean {
  return extractUsefulModelProse(content) !== null;
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
  if (names.length <= NAMED_FILES_MAX) return joinSwedish(names);
  const head = names.slice(0, NAMED_FILES_MAX - 1).join(", ");
  return `${head} och ${names.length - (NAMED_FILES_MAX - 1)} till`;
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

const PAGE_FILE_RE = /^app\/(?:(.+)\/)?page\.(?:tsx|jsx|ts|js|mdx)$/;
const STYLE_FILE_RE = /(?:\.(?:css|scss|sass)|^tailwind\.config\.[cm]?[jt]s)$/;
const ROOT_LAYOUT_RE = /^app\/layout\.(?:tsx|jsx|ts|js)$/;

/**
 * The parts of the site a set of files touches, in the owner's words: pages
 * by route, the shared style, the root layout, and a count for the rest.
 * Derived from paths only — it never claims WHAT changed inside a file.
 */
function describeSiteAreas(paths: ReadonlyArray<string>, kind: "modified" | "created"): string[] {
  const pages: string[] = [];
  let style = false;
  let layout = false;
  const others = new Set<string>();
  for (const raw of paths) {
    const path = normalizePath(raw).replace(/^src\//, "");
    if (HOUSEKEEPING_FILE_RE.test(path)) continue;
    const page = PAGE_FILE_RE.exec(path);
    if (page) {
      const route = (page[1] ?? "")
        .split("/")
        .filter((segment) => segment && !/^\(.*\)$/.test(segment) && !segment.startsWith("@"))
        .join("/");
      const label = route ? `sidan /${route}` : "startsidan";
      if (!pages.includes(label)) pages.push(label);
    } else if (STYLE_FILE_RE.test(path)) {
      style = true;
    } else if (ROOT_LAYOUT_RE.test(path)) {
      layout = true;
    } else {
      others.add(path);
    }
  }
  const areas: string[] =
    pages.length > NAMED_PAGES_MAX ? [countLabel(pages.length, "sida", "sidor")] : [...pages];
  if (style) areas.push("sajtens gemensamma stil");
  if (layout) areas.push("den gemensamma layouten");
  if (others.size > 0) {
    const n = others.size;
    if (kind === "created") areas.push(n === 1 ? "en ny del" : `${n} nya delar`);
    else if (areas.length === 0) areas.push(n === 1 ? "en del av sajten" : `${n} delar av sajten`);
    else areas.push(n === 1 ? "en annan del av sajten" : `${n} andra delar av sajten`);
  }
  return areas;
}

function smallFixesSentence(count: number): string {
  return `Jag rättade ${count === 1 ? "ett småfel" : `${count} småfel`} i koden automatiskt (sådant som saknade importer).`;
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
  const technical: string[] = [];
  const dossiers = uniqueLabels(dossierLabels);
  const dossierPhrase =
    dossiers.length === 1 ? `byggblocket ${dossiers[0]}` : `byggblocken ${joinSwedish(dossiers)}`;
  const isRepair = repairPassIndex > 0;
  const isInit = !isRepair && (generationMode === "init" || !previousFiles || previousFiles.length === 0);
  let nothingChanged = false;

  if (isRepair) {
    sentences.push("Jag har gjort en automatisk rättning av den senaste versionen.");
    const touched = listFiles([...changes.created, ...changes.modified]);
    if (touched) technical.push(`Rättade filer: ${touched}.`);
  } else if (isInit) {
    const routes = uniqueLabels(routeNames);
    const authored = files.filter((file) => !HOUSEKEEPING_FILE_RE.test(normalizePath(file.path)));
    sentences.push("Klart — jag har byggt en första version av sajten och sparat den.");
    if (routes.length > 0) {
      sentences.push(
        `Sajten har ${countLabel(routes.length, "sida", "sidor")}: ${joinSwedish(routes)}.`,
      );
    }
    if (dossiers.length > 0) sentences.push(`Den använder ${dossierPhrase}.`);
    sentences.push(EXAMPLE_FACTS_NOTE);
    technical.push(`${countLabel(authored.length, "fil", "filer")} skapades.`);
  } else {
    const touchedCount = changes.created.length + changes.modified.length;
    const modifiedAreas = describeSiteAreas(changes.modified, "modified");
    const createdAreas = describeSiteAreas(changes.created, "created");
    if (touchedCount === 0) {
      nothingChanged = true;
      sentences.push("Klart — inga filer behövde ändras, så sajten är densamma som förut.");
    } else {
      sentences.push("Klart — jag har sparat en ny version av sajten.");
      const parts: string[] = [];
      if (modifiedAreas.length > 0) parts.push(`ändrade ${joinSwedish(modifiedAreas)}`);
      if (createdAreas.length > 0) parts.push(`lade till ${joinSwedish(createdAreas)}`);
      sentences.push(
        parts.length > 0
          ? `Jag ${parts.join(", och ")}.`
          : "Ändringarna rörde bara tekniska inställningar.",
      );
    }
    if (dossiers.length > 0) sentences.push(`Jag lade till ${dossierPhrase}.`);
    const modified = listFiles(changes.modified);
    const created = listFiles(changes.created);
    if (modified) technical.push(`Ändrade filer: ${modified}.`);
    if (created) technical.push(`Nya filer: ${created}.`);
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

  if (autofixFixCount > 0) technical.push(smallFixesSentence(autofixFixCount));

  // The receipt knows the version is saved, not that the preview shows it.
  if (previewBlocked) {
    sentences.push(
      "Förhandsvisningen kunde inte startas för den här versionen — jag behöver rätta koden först.",
    );
  } else if (isInit) {
    sentences.push(
      "Förhandsvisningen startar till höger och kan ta en stund. Säg sedan vad du vill ändra — färger, texter, en ny sektion eller något helt annat.",
    );
  } else if (isRepair) {
    sentences.push("Förhandsvisningen byter till den rättade versionen när den är redo.");
  } else if (!nothingChanged) {
    sentences.push(
      "Förhandsvisningen byter till den nya versionen när den är redo, vilket kan ta en stund. Vill du ändra något mer?",
    );
  }

  const body = sentences.join(" ");
  return technical.length > 0
    ? `${body}\n\n${TURN_SUMMARY_TECHNICAL_PREFIX} ${technical.join(" ")}`
    : body;
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

function joinExplanationAndFiles(explanation: string, files: string): string {
  const prose = explanation.replace(/\s+$/, "");
  const code = files.replace(/^\s+/, "");
  if (!prose) return files;
  if (!code) return prose;
  if (code === prose || code.startsWith(`${prose}\n`)) return code;
  return `${prose}\n\n${code}`;
}

function attachStreamWarningOnce(body: string, warning: string | null): string {
  if (!warning) return body;
  const normalized = body.replace(/\s+$/, "");
  if (normalized === warning || normalized.endsWith(`\n${warning}`)) return normalized;
  const message = warning.replace(/^Varning:\s*/u, "");
  return appendStreamWarning(normalized, message);
}

/**
 * Chat message = explanation (final prose, else adequate raw prose, else the
 * fallback) kept apart from the rebuilt files. A trailing stream warning is
 * attached once. File bytes stay in `rebuiltContent`.
 */
export function composePersistedAssistantContent(input: {
  rawContent: string;
  rebuiltContent: string;
  fallbackSummary: string | null;
}): { content: string; turnSummary: string | null } {
  const raw = splitTrailingStreamWarning(String(input.rawContent ?? ""));
  const rebuilt = splitTrailingStreamWarning(String(input.rebuiltContent ?? ""));
  const finalProse = extractUsefulModelProse(rebuilt.body);
  const recoveredProse = finalProse ? null : extractUsefulModelProse(raw.body);
  const turnSummary = finalProse || recoveredProse ? null : input.fallbackSummary;

  let body = rebuilt.body;
  if (!finalProse && recoveredProse) body = joinExplanationAndFiles(recoveredProse, rebuilt.body);
  else if (!finalProse) body = appendTurnSummary(rebuilt.body, turnSummary);

  return {
    content: attachStreamWarningOnce(body, rebuilt.warning ?? raw.warning),
    turnSummary,
  };
}
