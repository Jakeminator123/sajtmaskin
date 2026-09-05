import { describe, expect, it } from "vitest";
import {
  appendTurnSummary,
  buildTurnSummary,
  hasModelProseSummary,
  summarizeVersionChanges,
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

  it("describes an init build with pages, file count and building blocks in plain Swedish", () => {
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
    expect(summary).toContain('utifrån "Bygg en modern kundplattform för Content Online."');
    expect(summary).toContain("4 sidor: Overview, Subscriptions, Usage och Requests");
    // Housekeeping files (package.json, tsconfig.json) are not "files I made".
    expect(summary).toContain("3 filer skapades med byggblocken Dashboard-diagram");
    expect(summary).toContain("Jag rättade 20 småfel automatiskt");
    expect(summary).toMatch(/Förhandsvisningen startar till höger/);
    // No developer vocabulary.
    expect(summary).not.toMatch(/autofix|preflight|scaffold|dossier|tsx/i);
  });

  it("describes a follow-up by what actually changed, quoting the request", () => {
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
    expect(summary).toContain('uppdaterat sajten enligt "snyggare bara"');
    expect(summary).toContain("Ändrade globals.css, stats-card.tsx.");
    expect(summary).not.toContain("package.json");
    expect(summary).toMatch(/Vill du ändra något mer\?/);
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
    expect(summary).toContain("Ändrade layout.tsx; nya filer: floating-beer-can.tsx, three-canvas-shell.tsx.");
    expect(summary).toContain("Lade till byggblocket 3D-scen (React Three Fiber).");
    expect(summary).toContain("Jag rättade 2 småfel automatiskt");
  });

  it("truncates a long quoted prompt and caps the named file list", () => {
    const longPrompt = "Bygg ".repeat(40);
    const previous = Array.from({ length: 8 }, (_, i) => file(`components/c${i}.tsx`, "old"));
    const summary = buildTurnSummary({
      generationMode: "followUp",
      userPrompt: longPrompt,
      files: previous.map((f) => file(f.path, "new")),
      previousFiles: previous,
    });
    expect(summary).toMatch(/…"/);
    expect(summary).toContain("Ändrade c0.tsx, c1.tsx, c2.tsx och 5 till.");
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
    expect(summary).toContain("Inga filer behövde ändras");
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
    expect(summary).toContain("automatisk rättning av den senaste versionen och ändrade page.tsx");
    expect(summary).toContain("Förhandsvisningen kunde inte startas");
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
