import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { THEME_CLUSTERS } from "@/lib/builder/theme-presets";
import { repairGeneratedFiles } from "@/lib/gen/autofix/repair-generated-files";
import type { CodeFile } from "@/lib/gen/parser";
import {
  BUTTON_CONTRAST_FIXER_ID,
  BUTTON_TEXT_MIN_CONTRAST,
  countButtonContrastFixes,
  fixButtonContrast,
} from "./button-contrast-fixer";
import { WCAG_AA_NORMAL_TEXT, contrastRatio, parseCssColor } from "./color-contrast";
import { countParseErrors } from "./import-binding-ast";

const css = (tokens: Record<string, string>, extra = "") => `@import "tailwindcss";

@theme inline {
${Object.entries(tokens)
  .map(([name, value]) => `  --color-${name}: ${value};`)
  .join("\n")}
  --radius: 0.75rem;
}
${extra}`;

const file = (filePath: string, content: string): CodeFile => ({ path: filePath, content, language: "tsx" });

const page = (jsx: string) =>
  file(
    "app/page.tsx",
    `import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Page() {
  return (
    <main>
${jsx}
    </main>
  );
}
`,
  );

/** Café palette after «gör knapparna mörkgröna»: primary darkened, label kept dark. */
const DARKENED_PRIMARY = {
  background: "oklch(0.98 0.01 85)",
  foreground: "oklch(0.22 0.03 60)",
  primary: "oklch(0.35 0.07 150)",
  "primary-foreground": "oklch(0.24 0.03 60)",
  secondary: "oklch(0.93 0.02 85)",
  "secondary-foreground": "oklch(0.25 0.03 60)",
  muted: "oklch(0.94 0.01 85)",
  "muted-foreground": "oklch(0.5 0.02 60)",
};

/** Readable palette: every pair already passes AA. */
const READABLE = {
  background: "oklch(0.98 0.01 85)",
  foreground: "oklch(0.2 0.03 60)",
  primary: "oklch(0.38 0.08 150)",
  "primary-foreground": "oklch(0.98 0.01 85)",
  card: "oklch(1 0 0)",
  "card-foreground": "oklch(0.2 0.03 60)",
};

/** `src/lib/gen/scaffolds/landing-page/files/app/globals.css` (R2-1757's fixture). */
const LANDING_PAGE = {
  background: "oklch(0.99 0 0)",
  foreground: "oklch(0.15 0.004 0)",
  card: "oklch(1 0 0)",
  "card-foreground": "oklch(0.18 0.004 0)",
  primary: "oklch(0.58 0.16 258)",
  "primary-foreground": "oklch(0.98 0 0)",
  secondary: "oklch(0.96 0.004 0)",
  "secondary-foreground": "oklch(0.22 0.004 0)",
  muted: "oklch(0.955 0 0)",
  "muted-foreground": "oklch(0.45 0.004 0)",
  accent: "oklch(0.93 0.004 0)",
  "accent-foreground": "oklch(0.2 0.004 0)",
  border: "oklch(0.91 0.004 0)",
  ring: "oklch(0.58 0.16 258)",
};

/** R2-1757 repro B: dark primary, white label, white page. */
const DARK_PRIMARY = { background: "#ffffff", foreground: "#111111", primary: "#111111", "primary-foreground": "#ffffff" };

function token(content: string, name: string): string {
  const match = content.match(new RegExp(`--color-${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`--color-${name} missing`);
  return match[1].trim();
}

function ratio(a: string, b: string): number {
  return contrastRatio(parseCssColor(a)!, parseCssColor(b)!);
}

describe("fixButtonContrast — theme pairs", () => {
  it("raises a foreground that a recolored primary left unreadable, and keeps the brand color", () => {
    const before = css(DARKENED_PRIMARY);
    expect(ratio(token(before, "primary"), token(before, "primary-foreground"))).toBeLessThan(2);

    const result = fixButtonContrast([file("app/globals.css", before)]);
    const after = result.files[0].content;

    expect(token(after, "primary")).toBe(DARKENED_PRIMARY.primary);
    expect(ratio(token(after, "primary"), token(after, "primary-foreground"))).toBeGreaterThanOrEqual(
      WCAG_AA_NORMAL_TEXT,
    );
    expect(result.fixes).toEqual([
      expect.objectContaining({ fixer: BUTTON_CONTRAST_FIXER_ID, category: "mechanical", file: "app/globals.css", line: 7 }),
    ]);
    expect(after.replace(token(after, "primary-foreground"), "X")).toBe(
      before.replace(DARKENED_PRIMARY["primary-foreground"], "X"),
    );
  });

  it("leaves muted, card and popover pairs and the page text alone", () => {
    const tokens = {
      ...READABLE,
      foreground: "oklch(0.9 0 0)",
      muted: "oklch(0.6 0.02 85)",
      "muted-foreground": "oklch(0.58 0.02 60)",
      card: "oklch(0.3 0 0)",
      "card-foreground": "oklch(0.32 0 0)",
    };
    expect(fixButtonContrast([file("app/globals.css", css(tokens))]).fixes).toEqual([]);
  });

  it("does not touch var()-indirected tokens (an imported light/dark switch)", () => {
    const content = `:root {
  --primary: oklch(0.35 0.07 150);
  --primary-foreground: oklch(0.22 0.03 60);
}
.dark {
  --primary: oklch(0.8 0.1 150);
}
@theme inline {
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
}
`;
    const result = fixButtonContrast([file("app/globals.css", content)]);
    expect(result.files[0].content).toBe(content);
    expect(result.fixes).toEqual([]);
  });

  /**
   * V-2 (prod 2026-11-20): `--color-primary` redefined in `@layer base` for
   * buttons never reaches `bg-primary` under `@theme inline`. A token declared
   * outside `@theme` is uncertain, so nothing that reads it is touched.
   */
  it("treats a token redeclared outside @theme as unknown", () => {
    const content = css(
      { ...DARKENED_PRIMARY, button: "#7b292d" },
      `@layer base {
  [data-slot="button"], :is(a, button).bg-primary {
    --color-primary: var(--color-button);
  }
}
`,
    );
    const files = [
      file("app/globals.css", content),
      page(`      <a href="#" className="bg-primary text-foreground">Se vår meny</a>`),
    ];
    const result = fixButtonContrast(files);
    expect(result.files).toBe(files);
    expect(result.fixes).toEqual([]);
  });

  /**
   * Promote #1763, Codex P2: raising primary-foreground for the base fill
   * dropped the default Button's hover (`hover:bg-primary-hover`) from 13.71:1
   * to 1.11:1. The label must read on every state fill, or stay as it is.
   */
  it("leaves the token alone when no label reads on both the fill and its hover fill (Codex case)", () => {
    const content = css({ background: "#ffffff", foreground: "#111111", primary: "#111111", "primary-foreground": "#222222", "primary-hover": "#eeeeee" });
    const files = [file("app/globals.css", content), page(`      <Button>Boka</Button>`)];
    const result = fixButtonContrast(files);
    expect(result.files).toBe(files);
    expect(result.fixes).toEqual([]);
  });

  it("raises the label on the fill alone when the theme has no hover token", () => {
    const content = css({ background: "#ffffff", foreground: "#111111", primary: "#111111", "primary-foreground": "#222222" });
    const after = fixButtonContrast([file("app/globals.css", content)]).files[0].content;
    expect(ratio("#111111", token(after, "primary-foreground"))).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
  });

  it("picks a label that reads on the fill and on every state token", () => {
    const content = css({
      background: "#ffffff",
      foreground: "#111111",
      primary: "#111111",
      "primary-foreground": "#222222",
      "primary-hover": "#333333",
      "primary-active": "#2a2a2a",
    });
    const after = fixButtonContrast([file("app/globals.css", content)]).files[0].content;
    const label = token(after, "primary-foreground");
    for (const fill of ["#111111", "#333333", "#2a2a2a"]) {
      expect(ratio(fill, label)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    }
  });

  it("leaves the token alone when a state fill cannot be read", () => {
    const content = css(
      { background: "#ffffff", foreground: "#111111", primary: "#111111", "primary-foreground": "#222222", "primary-hover": "#333333" },
      `:root { --color-primary-hover: #eeeeee; }\n`,
    );
    const result = fixButtonContrast([file("app/globals.css", content)]);
    expect(result.files[0].content).toBe(content);
    expect(result.fixes).toEqual([]);
  });

  it("checks the secondary Button's own hover fill (secondary/80)", () => {
    // Dark secondary with a dark label: a light label must also read on 80 % of it over any backdrop.
    const content = css({ background: "#ffffff", foreground: "#111111", secondary: "#1a1a1a", "secondary-foreground": "#262626" });
    const after = fixButtonContrast([file("app/globals.css", content)]).files[0].content;
    const label = token(after, "secondary-foreground");
    expect(label).not.toBe("#262626");
    expect(ratio("#1a1a1a", label)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
  });

  it("is a no-op without a theme file and returns the same array", () => {
    const files = [page(`      <button className="bg-primary">x</button>`)];
    const result = fixButtonContrast(files);
    expect(result.files).toBe(files);
    expect(result.fixes).toEqual([]);
  });
});

describe("fixButtonContrast — filled buttons it is certain about", () => {
  it("swaps a mismatched text class on an invented CTA token, checking the hover fill too («Hitta hit»)", () => {
    const tokens = { ...READABLE, cta: "oklch(0.32 0.06 150)" };
    const result = fixButtonContrast([
      file("app/globals.css", css(tokens)),
      page(`      <Link href="#hitta-hit" className="rounded-full bg-cta px-6 py-3 text-foreground hover:bg-cta/90">Hitta hit</Link>`),
    ]);
    const out = result.files[1].content;
    expect(out).toContain(`className="rounded-full bg-cta px-6 py-3 text-background hover:bg-cta/90"`);
    expect(result.fixes[0]?.description).toMatch(/bg-cta with text-foreground was 1\.\d+:1, now text-background/);
    expect(result.fixes[0]?.line).toBe(7);
    expect(countParseErrors(out, "app/page.tsx")).toBe(0);
  });

  it("prefers the matching *-foreground token when it exists", () => {
    const tokens = { ...READABLE, cta: "oklch(0.32 0.06 150)", "cta-foreground": "oklch(0.97 0.01 85)" };
    const result = fixButtonContrast([
      file("app/globals.css", css(tokens)),
      page(`      <a href="/boka" className="bg-cta text-primary px-4">Boka bord</a>`),
    ]);
    expect(result.files[1].content).toContain(`className="bg-cta text-cta-foreground px-4"`);
  });

  it("adds a text class to a default <Button> whose unconditional cn() overrides only the background", () => {
    const tokens = { ...READABLE, "primary-foreground": "oklch(0.2 0.03 60)", primary: "oklch(0.85 0.1 90)", cta: "oklch(0.3 0.08 25)" };
    const result = fixButtonContrast([
      file("app/globals.css", css(tokens)),
      page(`      <Button size="lg" className={cn("bg-cta hover:bg-cta/90", "rounded-full")}>Beställ</Button>`),
    ]);
    const out = result.files[1].content;
    expect(out).toContain(`cn("bg-cta hover:bg-cta/90 text-background", "rounded-full")`);
    expect(result.fixes[0]?.description).toContain("with text-primary-foreground");
    expect(countParseErrors(out, "app/page.tsx")).toBe(0);
  });

  it("fixes a white pill whose label is also white, keeping !important", () => {
    const result = fixButtonContrast([
      file("app/globals.css", css(READABLE)),
      page(`      <Link href="/kontakt" className="!text-primary-foreground rounded-full bg-white px-4">Kontakt</Link>`),
    ]);
    expect(result.files[1].content).toContain(`className="!text-foreground rounded-full bg-white px-4"`);
  });

  it("reads arbitrary color values", () => {
    const result = fixButtonContrast([
      file("app/globals.css", css(READABLE)),
      page(`      <button type="button" className="bg-[rgb(48,75,56)] text-[#1f2a22] px-4">Hitta hit</button>`),
    ]);
    expect(result.files[1].content).toContain(`className="bg-[rgb(48,75,56)] text-background px-4"`);
  });

  it("is idempotent", () => {
    const tokens = { ...DARKENED_PRIMARY, cta: "oklch(0.32 0.06 150)" };
    const first = fixButtonContrast([
      file("app/globals.css", css(tokens)),
      page(`      <Link href="#karta" className="bg-cta text-foreground">Hitta hit</Link>
      <Button>Boka bord</Button>`),
    ]);
    expect(first.fixes.length).toBeGreaterThan(0);
    const second = fixButtonContrast(first.files);
    expect(second.fixes).toEqual([]);
    expect(second.files).toBe(first.files);
  });
});

/**
 * R2-1757 (head 5a185e47) ran these against the PR and got a readable label
 * made unreadable, a branch rewritten or logic changed. Bots: Codex (yellow,
 * var() switch, branches, comparison, hover) and Bugbot (`color:` and
 * unresolved `bg-` on <Button>). Each must now stay exactly as written.
 */
describe("fixButtonContrast — leaves every uncertain button alone (R2-1757 A–O, Codex, Bugbot)", () => {
  const shadcnVarTheme = `@import "tailwindcss";
:root {
  --background: #ffffff;
  --foreground: #333333;
  --primary: #777777;
}
.dark {
  --background: #0a0a0a;
  --foreground: #fafafa;
  --primary: #111111;
}
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
}
`;

  const cases: Array<[string, string, string]> = [
    ["A outline + bg-transparent + text-white on a dark hero", css(LANDING_PAGE), `<section className="relative bg-black"><Button size="lg" variant="outline" className="border-white/40 bg-transparent text-white hover:bg-white/10">Läs mer</Button></section>`],
    ["B outline + bg-transparent in a bg-primary band", css(LANDING_PAGE), `<section className="bg-primary text-primary-foreground"><Button variant="outline" className="bg-transparent text-primary-foreground">Kontakta oss</Button></section>`],
    ["C secondary + bg-transparent + text-white", css(LANDING_PAGE), `<Button variant="secondary" className="bg-transparent text-white">Mer</Button>`],
    ["D <a> bg-transparent text-white", css(LANDING_PAGE), `<a href="#" className="border border-white bg-transparent text-white">Läs mer</a>`],
    ["E outline with an inline style background", css(LANDING_PAGE), `<Button variant="outline" style={{ backgroundColor: "#111" }} className="text-white">Boka</Button>`],
    ["F outline + bg-none", css(LANDING_PAGE), `<Button variant="outline" className="bg-none text-white">Info</Button>`],
    ["G default Button + bg-transparent + text-white", css(LANDING_PAGE), `<Button className="bg-transparent text-white">Start</Button>`],
    ["H outline + palette bg-slate-900", css(LANDING_PAGE), `<Button variant="outline" className="bg-slate-900 text-white">Boka</Button>`],
    ["I secondary + palette bg-emerald-700", css(LANDING_PAGE), `<Button variant="secondary" className="bg-emerald-700 text-white hover:bg-emerald-800">Boka</Button>`],
    ["J outline + unknown var()", css(LANDING_PAGE), `<Button variant="outline" className="bg-[var(--brand)] text-white">Boka</Button>`],
    ["K <a> palette bg-slate-900", css(LANDING_PAGE), `<a href="#" className="bg-slate-900 text-white">Boka</a>`],
    ["L var() theme with a .dark switch", shadcnVarTheme, `<a href="#" className="bg-primary text-white">Boka</a>`],
    ["M background and text in different branches", css(DARK_PRIMARY), `<a href="#" className={active ? "bg-primary" : "text-black"}>Flik</a>`],
    ["N hover:bg-white would hide the new label", css(DARK_PRIMARY), `<a href="#" className="bg-primary text-black hover:bg-white">Boka</a>`],
    ["O comparison operand", css(DARK_PRIMARY), `<a href="#" className={tone === "text-black" ? "bg-primary" : ""}>Flik</a>`],
    ["Codex: <Button> palette bg-yellow-300", css(DARK_PRIMARY), `<Button className="bg-yellow-300 text-black">Boka</Button>`],
    ["Bugbot: text-[color:var(--x)]", css(DARK_PRIMARY), `<a href="#" className="bg-primary text-[color:var(--label)]">Boka</a>`],
    ["condition inside cn()", css({ ...READABLE, cta: "oklch(0.3 0.08 25)" }), `<button className={cn(tone === "dark" && "rounded bg-cta", size === "lg" && "px-8")}>Beställ</button>`],
    ["inherited text", css({ ...READABLE, cta: "oklch(0.3 0.08 25)" }), `<a href="#" className="rounded bg-cta px-4">Beställ</a>`],
    ["spread props", css({ ...READABLE, cta: "oklch(0.3 0.08 25)" }), `<a {...props} className="bg-cta text-foreground">Beställ</a>`],
    ["Button asChild and its child", css({ ...READABLE, cta: "oklch(0.3 0.08 25)" }), `<Button asChild className="bg-cta text-foreground"><Link href="/" className="bg-cta text-foreground">Beställ</Link></Button>`],
    ["dark: color class", css({ ...READABLE, cta: "oklch(0.3 0.08 25)" }), `<a href="#" className="bg-cta text-foreground dark:bg-background">Beställ</a>`],
    ["translucent fill", css(READABLE), `<a href="#" className="bg-white/10 text-white backdrop-blur">Glas</a>`],
    ["gradient", css(READABLE), `<a href="#" className="bg-gradient-to-r from-primary to-card text-foreground">Gradient</a>`],
    ["template interpolation", css(READABLE), `<button className={\`bg-\${tone} text-foreground\`}>Mall</button>`],
    ["hover-only colors", css(READABLE), `<Link href="/" className="hover:bg-primary hover:text-foreground">Hover</Link>`],
    ["computed variant", css(DARKENED_PRIMARY), `<Button variant={variant} className="text-foreground">Okänd</Button>`],
  ];

  it.each(cases)("%s", (_label, theme, jsx) => {
    const pageFile = page(`      ${jsx}`);
    const result = fixButtonContrast([file("app/globals.css", theme), pageFile]);
    expect(result.files[1]).toBe(pageFile);
    expect(result.fixes.filter((fix) => fix.file === "app/page.tsx")).toEqual([]);
  });

  it("never edits the shadcn primitives under components/ui", () => {
    const tokens = { ...READABLE, cta: "oklch(0.32 0.06 150)" };
    const primitive = file("components/ui/button.tsx", `export const x = <button className="bg-cta text-foreground" />;`);
    const result = fixButtonContrast([file("app/globals.css", css(tokens)), primitive]);
    expect(result.files[1]).toBe(primitive);
  });
});

describe("countButtonContrastFixes", () => {
  it("separates theme tokens from individual buttons and ignores other fixers", () => {
    expect(
      countButtonContrastFixes([
        { fixer: BUTTON_CONTRAST_FIXER_ID, file: "app/globals.css" },
        { fixer: BUTTON_CONTRAST_FIXER_ID, file: "app/page.tsx" },
        { fixer: BUTTON_CONTRAST_FIXER_ID, file: "components/site-header.tsx" },
        { fixer: "react-import-fixer", file: "app/page.tsx" },
      ]),
    ).toEqual({ tokens: 1, buttons: 2 });
  });
});

describe("fixButtonContrast — gate and curated palettes (orchestrator decision 2026-11-20, SM-153)", () => {
  const root = process.cwd();
  const kebab = (key: string) => key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
  const cssFromTokens = (tokens: Record<string, unknown>) =>
    css(
      Object.fromEntries(
        Object.entries(tokens)
          .filter(([, value]) => typeof value === "string" && parseCssColor(value) !== null)
          .map(([key, value]) => [kebab(key), value as string]),
      ),
    );
  const walk = (dir: string, match: RegExp): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? walk(path.join(dir, entry.name), match) : match.test(entry.name) ? [path.join(dir, entry.name)] : [],
    );
  const scaffoldsDir = path.join(root, "src/lib/gen/scaffolds");
  const scaffoldIds = readdirSync(scaffoldsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(path.join(scaffoldsDir, entry.name, "files/app/globals.css")))
    .map((entry) => entry.name);
  const scaffoldFiles = (id: string): CodeFile[] => {
    const filesDir = path.join(scaffoldsDir, id, "files");
    return walk(filesDir, /\.(css|tsx|jsx)$/).map((full) =>
      file(path.relative(filesDir, full).split(path.sep).join("/"), readFileSync(full, "utf8")),
    );
  };
  const variantsOf = (id: string): Array<[string, Record<string, unknown>]> => {
    const dir = path.join(root, "config/scaffold-variants", id);
    if (!existsSync(dir)) return [];
    return walk(dir, /\.json$/)
      .map((full) => [path.basename(full), (JSON.parse(readFileSync(full, "utf8")) as { themeTokens?: Record<string, unknown> }).themeTokens] as const)
      .filter((entry): entry is [string, Record<string, unknown>] => Boolean(entry[1]));
  };

  it("repairs only nearly invisible labels: 3:1 for now, while the goal stays 4.5:1", () => {
    expect(BUTTON_TEXT_MIN_CONTRAST).toBe(3);
    expect(BUTTON_TEXT_MIN_CONTRAST).toBeLessThan(WCAG_AA_NORMAL_TEXT);
  });

  it("leaves a label between 3:1 and 4.5:1 alone (scaffold default blue, 4.10:1)", () => {
    const files = [
      file("app/globals.css", css(LANDING_PAGE)),
      page(`      <a href="/boka" className="bg-primary text-primary-foreground">Boka</a>`),
    ];
    const result = fixButtonContrast(files);
    expect(result.files).toBe(files);
  });

  /**
   * Curated palettes must not be restyled by a bug fix. Raising the gate to
   * 4.5:1 makes this fail until the palettes are fixed at source (SM-153).
   */
  it("leaves every curated palette untouched (scaffold defaults, variants, clusters)", () => {
    const sources: Array<[string, string]> = [];
    for (const id of scaffoldIds) {
      sources.push([`scaffold:${id}`, readFileSync(path.join(scaffoldsDir, id, "files/app/globals.css"), "utf8")]);
    }
    for (const variantFile of walk(path.join(root, "config/scaffold-variants"), /\.json$/)) {
      const json = JSON.parse(readFileSync(variantFile, "utf8")) as { themeTokens?: Record<string, unknown> };
      if (json.themeTokens) sources.push([`variant:${path.basename(variantFile)}`, cssFromTokens(json.themeTokens)]);
    }
    for (const [id, cluster] of Object.entries(THEME_CLUSTERS)) {
      sources.push([`cluster:${id}:light`, cssFromTokens(cluster.light as unknown as Record<string, unknown>)]);
      sources.push([`cluster:${id}:dark`, cssFromTokens(cluster.dark as unknown as Record<string, unknown>)]);
    }
    expect(sources.filter(([label]) => label.startsWith("scaffold:")).length).toBeGreaterThanOrEqual(10);
    expect(sources.filter(([label]) => label.startsWith("variant:")).length).toBeGreaterThanOrEqual(40);
    const restyled = sources
      .map(([label, content]) => ({ label, fixes: fixButtonContrast([file("app/globals.css", content)]).fixes }))
      .filter((entry) => entry.fixes.length > 0)
      .map((entry) => `${entry.label}: ${entry.fixes.map((fix) => fix.description).join("; ")}`);
    expect(restyled).toEqual([]);
  });

  it("changes nothing on the scaffolds' real pages, with their own theme and every variant's", () => {
    expect(scaffoldIds.length).toBeGreaterThanOrEqual(10);
    const changed: string[] = [];
    for (const id of scaffoldIds) {
      const files = scaffoldFiles(id);
      const themes: Array<[string, string]> = [
        ["default", files.find((entry) => entry.path === "app/globals.css")!.content],
        ...variantsOf(id).map(([name, tokens]): [string, string] => [name, cssFromTokens(tokens)]),
      ];
      for (const [theme, content] of themes) {
        const withTheme = files.map((entry) => (entry.path === "app/globals.css" ? { ...entry, content } : entry));
        for (const fix of fixButtonContrast(withTheme).fixes) changed.push(`${id}/${theme}: ${fix.file}:${fix.line} ${fix.description}`);
      }
    }
    expect(changed).toEqual([]);
  });
});

describe("where it runs", () => {
  /**
   * `repairGeneratedFiles` also runs at preview start, export and download on
   * versions nobody is changing; the contrast pass belongs to a new version
   * only (`finalize-preflight/runner.ts`, covered in finalize-preflight.test.ts).
   */
  it("is not part of repairGeneratedFiles", () => {
    const files = [
      file("app/globals.css", css(DARKENED_PRIMARY)),
      page(`      <Link href="#karta" className="bg-primary text-foreground">Hitta hit</Link>`),
    ];
    const result = repairGeneratedFiles(files);
    expect(result.fixes.some((fix) => fix.fixer === BUTTON_CONTRAST_FIXER_ID)).toBe(false);
    expect(result.files.find((entry) => entry.path === "app/globals.css")?.content).toBe(files[0].content);
  });
});
