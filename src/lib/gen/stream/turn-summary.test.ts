import { describe, expect, it } from "vitest";
import { appendStreamWarning } from "@/lib/builder/stream-warning";
import {
  appendTurnSummary,
  buildTurnSummary,
  composePersistedAssistantContent,
  extractUsefulModelProse,
  hasModelProseSummary,
  summarizeVersionChanges,
  TURN_SUMMARY_TECHNICAL_PREFIX,
} from "./turn-summary";

const file = (path: string, content: string) => ({ path, content });

describe("hasModelProseSummary", () => {
  it("is false for pure CodeProject output", () => {
    const content =
      '```css file="app/globals.css"\n@import "tailwindcss";\n```\n\n```tsx file="app/page.tsx"\nexport default function Page() { return <main>Hej</main>; }\n```\n';
    expect(hasModelProseSummary(content)).toBe(false);
  });

  it("is false for stream-form file headers and <Thinking> leftovers", () => {
    const content =
      '<Thinking>plan plan plan plan plan plan plan plan</Thinking>\ntsx file="app/page.tsx"\nexport default function Page() {}\n';
    expect(hasModelProseSummary(content)).toBe(false);
  });

  it("is true when the model wrote a real explanation outside the code", () => {
    const content =
      'Jag har byggt en landningssida med hero, tjänster och kontaktformulär.\n\n```tsx file="app/page.tsx"\nexport default function Page() {}\n```\n';
    expect(hasModelProseSummary(content)).toBe(true);
  });
});

describe("summarizeVersionChanges", () => {
  it("splits created / modified / unchanged by path and content", () => {
    const previous = [file("app/page.tsx", "a"), file("app/globals.css", "b"), file("lib/x.ts", "c")];
    const next = [
      file("app/page.tsx", "a"),
      file("app/globals.css", "B"),
      file("lib/x.ts", "c"),
      file("components/new.tsx", "n"),
    ];
    expect(summarizeVersionChanges(next, previous)).toEqual({
      created: ["components/new.tsx"],
      modified: ["app/globals.css"],
      unchangedCount: 2,
    });
  });

  it("treats every file as created when there is no previous version", () => {
    const next = [file("app/page.tsx", "a"), file("./app/layout.tsx", "b")];
    expect(summarizeVersionChanges(next, null)).toEqual({
      created: ["app/page.tsx", "app/layout.tsx"],
      modified: [],
      unchangedCount: 0,
    });
  });
});

describe("buildTurnSummary", () => {
  it("returns null when there are no files", () => {
    expect(buildTurnSummary({ generationMode: "init", files: [] })).toBeNull();
  });

  // Omskrivet 2026-11-11 (UX-granskningen): kvittot citerar inte längre
  // beställningen, lovar inte att ändringen syns och lägger filnamn och
  // automatiska rättningar i ett eget stycke som chatten fäller ihop.
  it("describes an init build with pages and building blocks in plain Swedish", () => {
    const summary = buildTurnSummary({
      generationMode: "init",
      userPrompt: "Bygg en modern kundplattform för Content Online.",
      files: [
        file("app/page.tsx", "x"),
        file("app/usage/page.tsx", "x"),
        file("components/stats-card.tsx", "x"),
        file("package.json", "{}"),
        file("tsconfig.json", "{}"),
      ],
      routeNames: ["Overview", "Subscriptions", "Usage", "Requests"],
      dossierLabels: ["Dashboard-diagram"],
      autofixFixCount: 20,
    });
    expect(summary).not.toBeNull();
    const [main, technical] = (summary as string).split(`\n\n${TURN_SUMMARY_TECHNICAL_PREFIX} `);
    expect(main).toMatch(/^Klart — jag har byggt en första version av sajten och sparat den\./);
    expect(main).not.toContain("Content Online");
    expect(main).toContain("4 sidor: Overview, Subscriptions, Usage och Requests");
    expect(main).toContain("Den använder byggblocket Dashboard-diagram.");
    // Ärlig om exempeluppgifter som generatorn fyllt i.
    expect(main).toContain("öppettider, priser, kontaktuppgifter och omdömen");
    expect(main).toContain("exempel");
    expect(main).toMatch(/Förhandsvisningen startar till höger och kan ta en stund/);
    // No developer vocabulary in the visible part.
    expect(main).not.toMatch(/autofix|preflight|scaffold|dossier|tsx|småfel|filer/i);
    // Housekeeping files (package.json, tsconfig.json) are not "files I made".
    expect(technical).toBe(
      "Projektet har nu 3 filer totalt. Jag rättade 20 småfel i koden automatiskt (sådant som saknade importer).",
    );
  });

  it("names common English routes in Swedish and counts the whole project, not the answer (V-12)", () => {
    const summary = buildTurnSummary({
      generationMode: "init",
      files: [file("app/page.tsx", "x"), file("app/pricing/page.tsx", "x")],
      routeNames: ["Startsida", "About us", "Pricing", "Contact", "Våra bullar"],
    });
    expect(summary).toContain("5 sidor: Startsida, Om oss, Priser, Kontakt och Våra bullar.");
    expect(summary).toContain("Projektet har nu 2 filer totalt.");
    expect(summary).not.toContain("skapades");
  });

  it("describes a follow-up by the parts of the site that changed, without quoting the request", () => {
    const previous = [
      file("app/globals.css", "old"),
      file("components/stats-card.tsx", "old"),
      file("app/page.tsx", "same"),
      file("package.json", "{}"),
    ];
    const summary = buildTurnSummary({
      generationMode: "followUp",
      userPrompt: "snyggare bara",
      files: [
        file("app/globals.css", "new"),
        file("components/stats-card.tsx", "new"),
        file("app/page.tsx", "same"),
        file("package.json", '{"x":1}'),
      ],
      previousFiles: previous,
    });
    expect(summary).not.toContain("snyggare bara");
    expect(summary).toContain("Jag ändrade sajtens gemensamma stil och en annan del av sajten.");
    expect(summary).toContain(`${TURN_SUMMARY_TECHNICAL_PREFIX} Ändrade filer: globals.css och stats-card.tsx.`);
    expect(summary).not.toContain("package.json");
    expect(summary).toMatch(/Vill du ändra något mer\?/);
  });

  it("describes the Café Lindgren receipt honestly (preview test 2026-11-11)", () => {
    const previous = [file("app/globals.css", "old"), file("app/page.tsx", "old")];
    const summary = buildTurnSummary({
      generationMode: "followUp",
      userPrompt:
        "Lägg till en sektion med tre kundomdömen på startsidan och gör knapparna mörkgröna.",
      files: [file("app/globals.css", "new"), file("app/page.tsx", "new")],
      previousFiles: previous,
      autofixFixCount: 1,
    });
    expect(summary).toBe(
      "Klart — jag har sparat en ny version av sajten. Jag ändrade startsidan och sajtens gemensamma stil. " +
        "Förhandsvisningen byter till den nya versionen när den är redo, vilket kan ta en stund. Vill du ändra något mer?" +
        `\n\n${TURN_SUMMARY_TECHNICAL_PREFIX} Ändrade filer: globals.css och page.tsx. ` +
        "Jag rättade ett småfel i koden automatiskt (sådant som saknade importer).",
    );
    // Lovar inte att ändringen redan syns.
    expect(summary).not.toMatch(/uppdateras till höger|syns nu|visas nu/);
  });

  it("names pages by route and new pages as added", () => {
    const previous = [file("app/page.tsx", "old"), file("app/(site)/meny/page.tsx", "old")];
    const summary = buildTurnSummary({
      generationMode: "followUp",
      files: [
        file("app/page.tsx", "old"),
        file("app/(site)/meny/page.tsx", "new"),
        file("src/app/priser/page.tsx", "x"),
      ],
      previousFiles: previous,
    });
    expect(summary).toContain("Jag ändrade sidan /meny, och lade till sidan /priser.");
  });

  it("lists new files and the added building block for a capability follow-up", () => {
    const previous = [file("app/layout.tsx", "old"), file("package.json", "{}")];
    const summary = buildTurnSummary({
      generationMode: "followUp",
      userPrompt: "Gör en liten 3d-grejj på en ölburk som hoovrar i miten på alla idr",
      files: [
        file("app/layout.tsx", "new"),
        file("components/floating-beer-can.tsx", "x"),
        file("components/three-canvas-shell.tsx", "x"),
        file("package.json", '{"three":"1"}'),
      ],
      previousFiles: previous,
      dossierLabels: ["3D-scen (React Three Fiber)"],
      autofixFixCount: 2,
    });
    expect(summary).toContain("Jag ändrade den gemensamma layouten, och lade till 2 nya delar.");
    expect(summary).toContain("Jag lade till byggblocket 3D-scen (React Three Fiber).");
    expect(summary).toContain(
      "Ändrade filer: layout.tsx. Nya filer: floating-beer-can.tsx och three-canvas-shell.tsx.",
    );
    expect(summary).toContain("Jag rättade 2 småfel i koden automatiskt");
  });

  it("never quotes a long request and caps the named file list", () => {
    const longPrompt = "Bygg ".repeat(40);
    const previous = Array.from({ length: 8 }, (_, i) => file(`components/c${i}.tsx`, "old"));
    const summary = buildTurnSummary({
      generationMode: "followUp",
      userPrompt: longPrompt,
      files: previous.map((f) => file(f.path, "new")),
      previousFiles: previous,
    });
    expect(summary).not.toContain("Bygg Bygg");
    expect(summary).toContain("Jag ändrade 8 delar av sajten.");
    expect(summary).toContain("Ändrade filer: c0.tsx, c1.tsx, c2.tsx och 5 till.");
  });

  it("is honest about files kept by the shrink/structural guards", () => {
    const previous = [file("app/page.tsx", "old"), file("components/hero.tsx", "old")];
    const summary = buildTurnSummary({
      generationMode: "followUp",
      userPrompt: "byt hero till intro",
      files: [file("app/page.tsx", "new"), file("components/hero.tsx", "old")],
      previousFiles: previous,
      rejectedStructural: [{ file: "components/hero.tsx" }],
    });
    expect(summary).toContain("jag behöll den tidigare versionen av hero.tsx");
  });

  it("says so when nothing changed", () => {
    const previous = [file("app/page.tsx", "same")];
    const summary = buildTurnSummary({
      generationMode: "followUp",
      files: [file("app/page.tsx", "same")],
      previousFiles: previous,
    });
    expect(summary).toContain("inga filer behövde ändras");
    expect(summary).not.toContain("Förhandsvisningen");
    expect(summary).not.toContain(TURN_SUMMARY_TECHNICAL_PREFIX);
  });

  it("describes a repair pass and a blocked preview", () => {
    const previous = [file("app/page.tsx", "old")];
    const summary = buildTurnSummary({
      generationMode: "followUp",
      repairPassIndex: 1,
      files: [file("app/page.tsx", "fixed")],
      previousFiles: previous,
      previewBlocked: true,
    });
    expect(summary).toContain("Jag har gjort en automatisk rättning av den senaste versionen.");
    expect(summary).toContain(`${TURN_SUMMARY_TECHNICAL_PREFIX} Rättade filer: page.tsx.`);
    // Viktiga fel ligger kvar i den synliga delen.
    const main = (summary as string).split("\n\n")[0];
    expect(main).toContain("Förhandsvisningen kunde inte startas");
  });

  it("writes one small fix in correct Swedish", () => {
    const summary = buildTurnSummary({
      generationMode: "init",
      files: [file("app/page.tsx", "x")],
      autofixFixCount: 1,
    });
    expect(summary).toContain("Jag rättade ett småfel i koden automatiskt");
    expect(summary).not.toContain("1 småfel");
  });
});

describe("appendTurnSummary", () => {
  it("appends the summary after a blank line and leaves code untouched", () => {
    const code = '```tsx file="app/page.tsx"\nexport default function Page() {}\n```\n\n';
    const out = appendTurnSummary(code, "Klart — jag har byggt sajten.");
    expect(out).toBe(
      '```tsx file="app/page.tsx"\nexport default function Page() {}\n```\n\nKlart — jag har byggt sajten.\n',
    );
  });

  it("is a no-op for a null summary", () => {
    expect(appendTurnSummary("abc", null)).toBe("abc");
  });
});

const BEFORE = "Jag har byggt en landningssida med hero, tjänster och kontaktformulär.";
const AFTER = "Hör av dig om du vill ändra färgerna eller texterna.";
const EXPLANATION = `${BEFORE}\n\n${AFTER}`;
const SECRET = "SECRET_MARKER=sk_live_should_not_leak";
const WARNING = "Anslutningen bröts innan svaret var klart.";
const FALLBACK = "Klart — jag har byggt en första version av sajten.";

function fence(lang: string, path: string, body: string): string {
  return `\`\`\`${lang} file="${path}"\n${body}\n\`\`\``;
}

function times(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("extractUsefulModelProse", () => {
  it("does not recover file contents after an inline fence inside generated code", () => {
    const raw = `${EXPLANATION}\n\n${fence("tsx", "app/page.tsx", 'const markdownFence = "```";\nconst RAW_FILE_CONTENT = "must stay inside the file";')}`;
    expect(extractUsefulModelProse(raw)).toBe(EXPLANATION);
  });

  it("keeps Swedish paragraphs before and after a closed fence", () => {
    const raw = `${BEFORE}\n\n${fence("tsx", "app/page.tsx", "export default function Page() { return null; }")}\n\n${AFTER}`;
    expect(extractUsefulModelProse(raw)).toBe(EXPLANATION);
  });

  it("drops a closed thinking block and keeps the explanation", () => {
    const plan = "Planera hero, tjänster och formulär utan att visa kedjan. ".repeat(3);
    const raw = `<Thinking>${plan}</Thinking>\n\n${EXPLANATION}`;
    const prose = extractUsefulModelProse(raw);
    expect(prose).toBe(EXPLANATION);
    expect(prose).not.toContain("Planera");
    expect(prose).not.toContain("Thinking");
  });

  it("cuts an open code fence and does not keep its tail", () => {
    const tail = `const OPEN_FENCE_TAIL = ${"x".repeat(80)};`;
    const raw = `${EXPLANATION}\n\n\`\`\`tsx file="app/page.tsx"\n${tail}`;
    const prose = extractUsefulModelProse(raw);
    expect(prose).toBe(EXPLANATION);
    expect(prose).not.toContain("OPEN_FENCE_TAIL");
    expect(hasModelProseSummary(raw)).toBe(true);
  });

  it("cuts a bare stream header and does not treat the long code tail as prose", () => {
    const tail = `const BARE_STREAM_TAIL = ${"y".repeat(160)};`;
    const onlyCode = `tsx file="app/page.tsx"\n${tail}`;
    expect(extractUsefulModelProse(onlyCode)).toBeNull();
    expect(hasModelProseSummary(onlyCode)).toBe(false);

    const withProse = `${EXPLANATION}\n${onlyCode}`;
    const prose = extractUsefulModelProse(withProse);
    expect(prose).toBe(EXPLANATION);
    expect(prose).not.toContain("BARE_STREAM_TAIL");
  });

  it("keeps a Swedish sentence that mentions file=\"…\" mid-line", () => {
    const sentence =
      'Jag la logiken i file="app/page.tsx" så att den körs på servern och inte bara i klienten.';
    expect(extractUsefulModelProse(sentence)).toBe(sentence);
  });

  it("omits an env-file secret from fenced and bare stream tails", () => {
    const fenced = [
      EXPLANATION,
      fence("env", ".env.local", SECRET),
      fence("tsx", "app/page.tsx", "export default function Page() { return null; }"),
    ].join("\n\n");
    const bare = `${BEFORE}\n\nenv file=".env.local"\n${SECRET}\nNEXT_PUBLIC_DEMO=1\n`;
    expect(extractUsefulModelProse(fenced)).toBe(EXPLANATION);
    expect(extractUsefulModelProse(fenced)).not.toContain("SECRET_MARKER");
    expect(extractUsefulModelProse(fenced)).not.toContain("sk_live");
    expect(extractUsefulModelProse(bare)).toBe(BEFORE);
    expect(extractUsefulModelProse(bare)).not.toContain("SECRET_MARKER");
  });
});

describe("composePersistedAssistantContent", () => {
  const repaired = fence("tsx", "src/app/page.tsx", "export default function Page() { return <h1>REPAIRED_FINAL_HERO</h1>; }");
  const original = fence("tsx", "src/app/page.tsx", "export default function Page() { return <h1>ORIGINAL_UNREPAIRED_HERO</h1>; }");

  it("does not repeat final prose or pull raw code back in", () => {
    const extra = "Den här råtexten ska inte läggas till när final redan förklarar.";
    const rebuilt = `${EXPLANATION}\n\n${repaired}`;
    const raw = `${EXPLANATION}\n\n${extra}\n\n${original}`;
    const { content, turnSummary } = composePersistedAssistantContent({
      rawContent: raw,
      rebuiltContent: rebuilt,
      fallbackSummary: FALLBACK,
    });
    expect(turnSummary).toBeNull();
    expect(times(content, EXPLANATION)).toBe(1);
    expect(content).not.toContain(extra);
    expect(content).not.toContain("ORIGINAL_UNREPAIRED_HERO");
    expect(content).toContain("REPAIRED_FINAL_HERO");
    expect(content).not.toContain("Klart — jag har byggt");
  });

  it("recovers adequate raw prose once and keeps a stream warning once", () => {
    const raw = appendStreamWarning(
      [
        `<Thinking>${"hemlig kedja ".repeat(8)}</Thinking>`,
        EXPLANATION,
        fence("env", ".env.local", SECRET),
        original,
        `\`\`\`tsx file="app/open.tsx"\nconst OPEN_FENCE_TAIL = ${"z".repeat(40)};`,
      ].join("\n\n"),
      WARNING,
    );
    const { content, turnSummary } = composePersistedAssistantContent({
      rawContent: raw,
      rebuiltContent: repaired,
      fallbackSummary: FALLBACK,
    });
    expect(turnSummary).toBeNull();
    expect(times(content, EXPLANATION)).toBe(1);
    expect(content.startsWith(`${EXPLANATION}\n\n`)).toBe(true);
    expect(content).toContain("REPAIRED_FINAL_HERO");
    expect(content.trimEnd().endsWith(`Varning: ${WARNING}`)).toBe(true);
    expect(times(content, `Varning: ${WARNING}`)).toBe(1);
    expect(content).not.toContain("Klart — jag har byggt");
    expect(content).not.toContain("ORIGINAL_UNREPAIRED_HERO");
    expect(content).not.toContain("SECRET_MARKER");
    expect(content).not.toContain("OPEN_FENCE_TAIL");
    expect(content).not.toContain("hemlig kedja");
  });

  it("appends the fallback once when a long code tail and a warning are not an explanation", () => {
    const raw = appendStreamWarning(
      `tsx file="app/page.tsx"\nconst BARE_STREAM_TAIL = ${"q".repeat(180)};`,
      WARNING,
    );
    const rebuilt = appendStreamWarning(repaired, WARNING);
    const { content, turnSummary } = composePersistedAssistantContent({
      rawContent: raw,
      rebuiltContent: rebuilt,
      fallbackSummary: FALLBACK,
    });
    expect(turnSummary).toBe(FALLBACK);
    expect(times(content, FALLBACK)).toBe(1);
    expect(times(content, `Varning: ${WARNING}`)).toBe(1);
    expect(content.trimEnd().endsWith(`Varning: ${WARNING}`)).toBe(true);
    expect(content).toContain("REPAIRED_FINAL_HERO");
    expect(content).not.toContain("BARE_STREAM_TAIL");
    expect(hasModelProseSummary(raw)).toBe(false);
  });
});
