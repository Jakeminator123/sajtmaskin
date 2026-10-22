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

/** Den interna turen modellen får tillbaka. Får inte tolkas som armering/stopp. */
export function buildReadFilesTurn(selection: ReadFilesSelection): string {
  const parts: string[] = [];
  if (selection.files.length === 0) {
    parts.push(
      `${READ_FILES_TURN_PREFIX} Ingen av de begärda filerna finns i versionen.` +
        (selection.missing.length > 0 ? ` Saknas: ${selection.missing.join(", ")}.` : "") +
        " Svara utifrån manifestet och säg vad du inte kunde läsa.",
    );
    return parts.join("\n");
  }
  parts.push(
    `${READ_FILES_TURN_PREFIX} Här är innehållet i de filer du bad om. Svara nu på användarens fråga med koden framför dig; citera sökvägar.`,
  );
  for (const file of selection.files) {
    parts.push(
      `--- ${file.name}${file.truncated ? " (klippt vid teckenbudgeten — be om resten i en ny runda om det behövs)" : ""} ---\n${file.content}`,
    );
  }
  if (selection.missing.length > 0) {
    parts.push(`Filer som inte finns i versionen: ${selection.missing.join(", ")}.`);
  }
  return parts.join("\n\n");
}

/** Beskedet när agenten slagit i rundtaket för en och samma användarfråga. */
export function buildReadFilesLimitTurn(): string {
  return (
    `${READ_FILES_TURN_PREFIX} Gränsen på ${READ_FILES_MAX_ROUNDS} läsrundor per fråga är nådd.` +
    " Svara nu med det du redan har läst, och säg om något behöver läsas i en ny fråga."
  );
}
