/**
 * Kodnavigering för Sajtagenten: `read_files`.
 *
 * Agenten ser alltid filmanifestet för den öppna builderchatten (namn, typ,
 * storlek) och ber sedan om de filer den behöver läsa innan den svarar.
 * Klienten hämtar innehållet från filer-API:t (ägarverifierat) och skickar
 * tillbaka det som en intern tur `[Filinnehåll] …`, så modellen kan svara
 * med faktisk kod framför sig i stället för att gissa.
 *
 * Ren modul: urval, budget och formatering är testbara utan nätverk. Reglerna:
 * högst {@link READ_FILES_MAX_PATHS} filer per runda, högst
 * {@link READ_FILES_MAX_ROUNDS} rundor per användarfråga, och en teckenbudget
 * som klipper stora filer i stället för att svälla prompten.
 *
 * Budgeten härleds från chat-transportens tak per meddelande
 * (`OPENCLAW_CHAT_MAX_CONTENT_CHARS`): klienten klipper varje meddelande där
 * och servern avvisar allt över. En tur som är större skulle klippas TYST, och
 * modellen få beskedet att den läst allt. Därför ligger hela turen — rubrik,
 * filhuvuden och innehåll — under taket, och det låses av ett test.
 */

import { OPENCLAW_CHAT_MAX_CONTENT_CHARS } from "./message-validation";

export const READ_FILES_MAX_PATHS = 4;
export const READ_FILES_MAX_ROUNDS = 3;
/** Rubrik + filhuvuden + saknade-rad ryms i marginalen. */
const READ_FILES_TURN_OVERHEAD_CHARS = 800;
export const READ_FILES_MAX_TOTAL_CHARS =
  OPENCLAW_CHAT_MAX_CONTENT_CHARS - READ_FILES_TURN_OVERHEAD_CHARS;
export const READ_FILES_MAX_CHARS_PER_FILE = 6_000;

/** Prefix för den interna turen; `agent-message-kind.ts` visar den som statusrad. */
export const READ_FILES_TURN_PREFIX = "[Filinnehåll]";

export interface ReadableFile {
  name: string;
  content: string;
}

export interface SelectedFile {
  name: string;
  content: string;
  truncated: boolean;
}

export interface ReadFilesSelection {
  files: SelectedFile[];
  missing: string[];
}

/** Samma normalisering som manifestet: inga inledande `./`, `/` eller backslash. */
export function normalizeReadPath(raw: string): string {
  return raw
    .replace(/\\/g, "/")
    .trim()
    .replace(/^(\.\/)+/, "")
    .replace(/^\/+/, "");
}

/**
 * Plocka ut de begärda filerna ur versionens fillista. Okända sökvägar
 * rapporteras som saknade (modellen ska inte få tro att de lästes). Budgeten
 * klipper per fil och totalt; en klippt fil markeras så svaret kan säga det.
 */
export function selectRequestedFiles(
  files: readonly ReadableFile[],
  requestedPaths: readonly string[],
  limits: {
    maxPaths?: number;
    maxCharsPerFile?: number;
    maxTotalChars?: number;
  } = {},
): ReadFilesSelection {
  const maxPaths = limits.maxPaths ?? READ_FILES_MAX_PATHS;
  const maxCharsPerFile = limits.maxCharsPerFile ?? READ_FILES_MAX_CHARS_PER_FILE;
  const maxTotalChars = limits.maxTotalChars ?? READ_FILES_MAX_TOTAL_CHARS;
  const byName = new Map(files.map((file) => [normalizeReadPath(file.name), file]));
  const seen = new Set<string>();
  const selected: SelectedFile[] = [];
  const missing: string[] = [];
  let used = 0;

  for (const raw of requestedPaths) {
    const path = normalizeReadPath(raw);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    if (selected.length + missing.length >= maxPaths) break;
    const file = byName.get(path);
    if (!file) {
      missing.push(path);
      continue;
    }
    const remaining = Math.max(0, maxTotalChars - used);
    const budget = Math.min(maxCharsPerFile, remaining);
    const truncated = file.content.length > budget;
    const content = truncated ? file.content.slice(0, budget) : file.content;
    used += content.length;
    selected.push({ name: path, content, truncated });
    if (used >= maxTotalChars) break;
  }

  return { files: selected, missing };
}

const TURN_INTRO = `${READ_FILES_TURN_PREFIX} Här är innehållet i de filer du bad om. Svara nu på användarens fråga med koden framför dig; citera sökvägar.`;
const TRUNCATED_MARK = " (klippt vid teckenbudgeten — be om resten i en ny runda om det behövs)";
const PART_SEPARATOR = "\n\n";

function fileHeader(name: string, truncated: boolean): string {
  return `--- ${name}${truncated ? TRUNCATED_MARK : ""} ---\n`;
}

/**
 * Den interna turen modellen får tillbaka. Får inte tolkas som armering/stopp.
 *
 * Taket gäller den FÄRDIGA turen, inte bara filinnehållet: rubriken,
 * filhuvudena (med sina sökvägar, som kan vara långa) och raden om saknade
 * filer räknas av först, och innehållet får det som blir över. Därför kan
 * ingen kombination av namnlängder och klippningar trycka turen över
 * `OPENCLAW_CHAT_MAX_CONTENT_CHARS` — det låses av ett test.
 */
export function buildReadFilesTurn(selection: ReadFilesSelection): string {
  if (selection.files.length === 0) {
    return (
      `${READ_FILES_TURN_PREFIX} Ingen av de begärda filerna finns i versionen.` +
      (selection.missing.length > 0 ? ` Saknas: ${selection.missing.join(", ")}.` : "") +
      " Svara utifrån manifestet och säg vad du inte kunde läsa."
    );
  }
  const missingLine =
    selection.missing.length > 0
      ? `Filer som inte finns i versionen: ${selection.missing.join(", ")}.`
      : null;

  // Fasta kostnader: intro, separatorer, varje filhuvud (räknat som klippt,
  // så markören alltid får plats) och saknade-raden.
  let fixed = TURN_INTRO.length + (missingLine ? PART_SEPARATOR.length + missingLine.length : 0);
  for (const file of selection.files) {
    fixed += PART_SEPARATOR.length + fileHeader(file.name, true).length;
  }
  let remaining = Math.max(0, OPENCLAW_CHAT_MAX_CONTENT_CHARS - fixed);

  const parts: string[] = [TURN_INTRO];
  for (const file of selection.files) {
    const budget = Math.min(file.content.length, remaining);
    const truncated = file.truncated || budget < file.content.length;
    const content = truncated ? file.content.slice(0, budget) : file.content;
    remaining -= content.length;
    parts.push(`${fileHeader(file.name, truncated)}${content}`);
  }
  if (missingLine) parts.push(missingLine);
  return parts.join(PART_SEPARATOR);
}

/** Beskedet när agenten slagit i rundtaket för en och samma användarfråga. */
export function buildReadFilesLimitTurn(): string {
  return (
    `${READ_FILES_TURN_PREFIX} Gränsen på ${READ_FILES_MAX_ROUNDS} läsrundor per fråga är nådd.` +
    " Svara nu med det du redan har läst, och säg om något behöver läsas i en ny fråga."
  );
}
