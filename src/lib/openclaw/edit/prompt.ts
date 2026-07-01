import type { CodeFile } from "@/lib/gen/parser";

export interface BuildEditOpsPromptInput {
  instruction: string;
  files: CodeFile[];
  /** Max total characters of file content to inline. Default 120k. */
  maxFileChars?: number;
}

export interface EditOpsPrompt {
  system: string;
  user: string;
  /** Paths actually inlined (in order) so callers can log/telemetry. */
  includedPaths: string[];
  /** True when at least one file was dropped to respect `maxFileChars`. */
  truncated: boolean;
}

const DEFAULT_MAX_FILE_CHARS = 120_000;

/**
 * The strict-JSON contract. The gateway must copy `find` VERBATIM from the file
 * content shown to it — this is the single hardest requirement (a fuzzy `find`
 * yields `no_match`/`ambiguous_match` from applyQuickEdits, which the route
 * surfaces rather than silently applying nothing).
 */
const SYSTEM_PROMPT = `Du översätter EN instruktion på naturligt språk till en minimal uppsättning DETERMINISTISKA filändringar för ett Next.js + Tailwind-projekt.

Svara ENBART med ett JSON-objekt. Ingen prosa, ingen markdown-fence:
{"ops":[ ... ],"summary":"<kort svensk sammanfattning av ändringen>"}

Varje op är exakt en av:
- {"kind":"replace_text","path":"<exakt filväg>","find":"<exakt delsträng som FINNS i filen just nu>","replace":"<ny delsträng>","occurrence":<1-baserat index, ENDAST om find förekommer flera gånger>}
- {"kind":"replace_content","path":"<exakt filväg>","content":"<hela nya filinnehållet>"}
- {"kind":"delete_file","path":"<exakt filväg>"}

Hårda regler:
- "find" MÅSTE kopieras ORDAGRANT från filinnehållet nedan (exakta tecken, inkl. blanksteg/versaler). Om en token förekommer flera gånger: välj en längre unik omgivande delsträng eller sätt "occurrence".
- Föredra minsta möjliga "replace_text". Använd "replace_content" bara när en hel fil måste skrivas om.
- Ändra BARA filer som visas nedan. Hitta aldrig på filvägar. Rör aldrig lockfiles, .env* eller hemligheter.
- Gör så få ops som möjligt för att uppfylla instruktionen. Formatera inte om orelaterad kod.
- Om instruktionen inte kan utföras med de visade filerna: svara med {"ops":[]} och en summary som förklarar varför.
- Håll projektet körbart (giltig TSX/CSS). Ta inte bort importer som fortfarande används.`;

/**
 * Build the system + user messages for the gateway ops step. Pure and
 * deterministic: inlines file content up to `maxFileChars`, preferring the
 * files in the given order, so `replace_text` can reference exact substrings.
 */
export function buildEditOpsPrompt(input: BuildEditOpsPromptInput): EditOpsPrompt {
  const maxChars = input.maxFileChars ?? DEFAULT_MAX_FILE_CHARS;
  const includedPaths: string[] = [];
  const parts: string[] = [];
  let used = 0;
  let truncated = false;

  for (const file of input.files) {
    const block = `--- ${file.path} ---\n${file.content}`;
    if (used + block.length > maxChars && includedPaths.length > 0) {
      truncated = true;
      continue;
    }
    parts.push(block);
    includedPaths.push(file.path);
    used += block.length;
  }

  const user = [
    "INSTRUKTION (från sajtägaren):",
    input.instruction.trim(),
    "",
    `AKTUELLA PROJEKTFILER (${includedPaths.length} fil(er)${truncated ? ", trunkerat" : ""}):`,
    parts.join("\n\n"),
  ].join("\n");

  return { system: SYSTEM_PROMPT, user, includedPaths, truncated };
}
