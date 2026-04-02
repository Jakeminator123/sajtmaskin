import { PAGE_BLOCKS_TARGET_FILE_CANDIDATES } from "@/lib/builder/page-blocks-catalog";

export type PageBlockPatchResult =
  | { ok: true; content: string }
  | { ok: false; reason: string };

type FlatFile = { name: string; content?: string | null };

/**
 * Välj startsidans fil från versionens fillista.
 */
export function resolveHomePageFilePath(files: FlatFile[]): string | null {
  const names = new Set(files.map((f) => f.name));
  for (const candidate of PAGE_BLOCKS_TARGET_FILE_CANDIDATES) {
    if (names.has(candidate)) return candidate;
  }
  return null;
}

/**
 * Deterministisk infogning i landningssidan.
 *
 * - `top` / `bottom`: säkra när `<main>...</main>` finns.
 * - Övriga placeringar (t.ex. `after-hero`): returnerar `ok: false` så anroparen kan använda AI-fallback.
 */
export function tryInsertPageBlockIntoHomePage(
  pageContent: string,
  jsxSnippet: string,
  placement: string,
): PageBlockPatchResult {
  const trimmed = jsxSnippet.trimEnd();
  if (!trimmed) {
    return { ok: false, reason: "Tomt block." };
  }

  if (placement !== "top" && placement !== "bottom") {
    return {
      ok: false,
      reason: `Placering "${placement}" stöds inte för direkt patch ännu — använd AI.`,
    };
  }

  const mainOpen = pageContent.match(/<main\b[^>]*>/i);
  const mainClose = pageContent.lastIndexOf("</main>");
  if (!mainOpen || mainClose < 0 || mainClose <= mainOpen.index!) {
    return {
      ok: false,
      reason: "Hittade inte välformad <main>...</main> — använd AI.",
    };
  }

  const openEnd = mainOpen.index! + mainOpen[0].length;

  if (placement === "top") {
    const next = `${pageContent.slice(0, openEnd)}\n${trimmed}\n${pageContent.slice(openEnd)}`;
    return { ok: true, content: next };
  }

  const next = `${pageContent.slice(0, mainClose)}\n${trimmed}\n${pageContent.slice(mainClose)}`;
  return { ok: true, content: next };
}
