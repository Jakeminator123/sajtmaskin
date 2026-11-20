import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { THEME_CLUSTERS } from "@/lib/builder/theme-presets";
import type { CodeFile } from "@/lib/gen/parser";
import {
  BUTTON_CONTRAST_FIXER_ID,
  BUTTON_TEXT_MIN_CONTRAST,
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

const file = (path: string, content: string): CodeFile => ({ path, content, language: "tsx" });

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
      expect.objectContaining({
        fixer: BUTTON_CONTRAST_FIXER_ID,
        category: "mechanical",
        file: "app/globals.css",
        line: 7,
      }),
    ]);
    // Everything else in the file is byte-identical.
    expect(after.replace(token(after, "primary-foreground"), "X")).toBe(
      before.replace(DARKENED_PRIMARY["primary-foreground"], "X"),
    );
  });

  it("leaves muted-foreground alone: it is secondary text on the page, not a label on bg-muted", () => {
    const tokens = { ...READABLE, muted: "oklch(0.6 0.02 85)", "muted-foreground": "oklch(0.5 0.02 60)" };
    const result = fixButtonContrast([file("app/globals.css", css(tokens))]);
    expect(result.fixes).toEqual([]);
  });

  it("does not rewrite var()-indirected tokens (an imported light/dark switch)", () => {
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

  it("is a no-op without a theme file and returns the same array", () => {
    const files = [file("app/page.tsx", `export default function P() { return <button className="bg-primary">x</button>; }`)];
    const result = fixButtonContrast(files);
    expect(result.files).toBe(files);
    expect(result.fixes).toEqual([]);
  });
});

describe("fixButtonContrast — filled buttons", () => {
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

  it("swaps a mismatched text class on an invented CTA token («Hitta hit», SM-135)", () => {
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

  it("adds a text class to a <Button> whose className overrides only the background", () => {
    const tokens = { ...READABLE, "primary-foreground": "oklch(0.2 0.03 60)", primary: "oklch(0.85 0.1 90)", cta: "oklch(0.3 0.08 25)" };
    const result = fixButtonContrast([
      file("app/globals.css", css(tokens)),
      page(`      <Button size="lg" className={cn("bg-cta hover:bg-cta/90", "rounded-full")}>Beställ</Button>`),
    ]);
    const out = result.files[1].content;
    expect(out).toContain(`cn("bg-cta hover:bg-cta/90 text-background", "rounded-full")`);
    expect(countParseErrors(out, "app/page.tsx")).toBe(0);
  });

  it("appends only into the literal that holds the bg class, never into a comparison operand", () => {
    const tokens = { ...READABLE, cta: "oklch(0.3 0.08 25)" };
    const result = fixButtonContrast([
      file("app/globals.css", css(tokens)),
      page(`      <button className={cn(tone === "dark" && "rounded bg-cta", size === "lg" && "px-8")}>Beställ</button>`),
    ]);
    const out = result.files[1].content;
    expect(out).toContain(`cn(tone === "dark" && "rounded bg-cta text-background", size === "lg" && "px-8")`);
    expect(result.fixes[0]?.description).toContain("inherited text");
  });

  it("fixes a white pill whose label is also white", () => {
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

  it("leaves readable, translucent, gradient, conditional and computed buttons untouched", () => {
    const files = [
      file("app/globals.css", css(READABLE)),
      page(`      <Button>Boka</Button>
      <Button variant="ghost" className="text-foreground">Mer</Button>
      <Link href="/" className="bg-primary text-primary-foreground">Start</Link>
      <a href="#" className="bg-white/10 text-white backdrop-blur">Glas</a>
      <a href="#" className="bg-gradient-to-r from-primary to-card text-foreground">Gradient</a>
      <Link href="/" className={active ? "bg-primary text-foreground" : "bg-card text-foreground"}>Flik</Link>
      <button className={\`bg-\${tone} text-foreground\`}>Mall</button>
      <Link href="/" className="hover:bg-primary hover:text-foreground">Hover</Link>
      <Button variant={variant}>Okänd</Button>`),
    ];
    const result = fixButtonContrast(files);
    expect(result.files).toBe(files);
    expect(result.fixes).toEqual([]);
  });

  it("never edits the shadcn primitives under components/ui", () => {
    const tokens = { ...READABLE, cta: "oklch(0.32 0.06 150)" };
    const primitive = file("components/ui/button.tsx", `export const x = <button className="bg-cta text-foreground" />;`);
    const result = fixButtonContrast([file("app/globals.css", css(tokens)), primitive]);
    expect(result.files[1]).toBe(primitive);
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

describe("fixButtonContrast — gate (orchestrator decision 2026-11-20, SM-153)", () => {
  it("repairs only nearly invisible labels: 3:1 for now, while the goal stays 4.5:1", () => {
    expect(BUTTON_TEXT_MIN_CONTRAST).toBe(3);
    expect(BUTTON_TEXT_MIN_CONTRAST).toBeLessThan(WCAG_AA_NORMAL_TEXT);
  });

  it("leaves a label between 3:1 and 4.5:1 alone (scaffold default blue, 4.10:1)", () => {
    const tokens = { ...READABLE, primary: "oklch(0.58 0.16 258)", "primary-foreground": "oklch(0.98 0 0)" };
    expect(ratio(tokens.primary, tokens["primary-foreground"])).toBeGreaterThan(BUTTON_TEXT_MIN_CONTRAST);
    expect(ratio(tokens.primary, tokens["primary-foreground"])).toBeLessThan(WCAG_AA_NORMAL_TEXT);
    const files = [
      file("app/globals.css", css(tokens)),
      file("app/page.tsx", `export default function P() { return <a href="/boka" className="bg-primary text-primary-foreground">Boka</a>; }`),
    ];
    const result = fixButtonContrast(files);
    expect(result.files).toBe(files);
    expect(result.fixes).toEqual([]);
  });

  /**
   * Curated palettes must not be restyled by a bug fix. Raising the gate to
   * 4.5:1 makes this fail until the palettes are fixed at source (SM-153).
   */
  it("leaves every curated palette untouched (scaffold defaults, variants, clusters)", () => {
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
    const sources: Array<[string, string]> = [];

    const scaffoldsDir = path.join(root, "src/lib/gen/scaffolds");
    for (const entry of readdirSync(scaffoldsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      try {
        sources.push([`scaffold:${entry.name}`, readFileSync(path.join(scaffoldsDir, entry.name, "files/app/globals.css"), "utf8")]);
      } catch {
        // scaffold without its own globals.css
      }
    }
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? walk(path.join(dir, entry.name)) : entry.name.endsWith(".json") ? [path.join(dir, entry.name)] : [],
      );
    for (const variantFile of walk(path.join(root, "config/scaffold-variants"))) {
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
});
