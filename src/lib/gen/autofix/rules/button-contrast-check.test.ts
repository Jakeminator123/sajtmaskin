import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { THEME_CLUSTERS } from "@/lib/builder/theme-presets";
import type { CodeFile } from "@/lib/gen/parser";
import { BUTTON_TEXT_MIN_CONTRAST, findUnreadableButtons } from "./button-contrast-check";
import { WCAG_AA_NORMAL_TEXT, parseCssColor } from "./color-contrast";

const css = (tokens: Record<string, string>, extra = "") => `@import "tailwindcss";

@theme inline {
${Object.entries(tokens)
  .map(([name, value]) => `  --color-${name}: ${value};`)
  .join("\n")}
  --radius: 0.75rem;
}
${extra}`;

const file = (filePath: string, content: string): CodeFile => ({ path: filePath, content, language: "tsx" });

const page = (jsx: string, imports = `import { Button } from "@/components/ui/button";`) =>
  file(
    "app/page.tsx",
    `import Link from "next/link";
${imports}

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
};

/** Readable palette: every pair already passes AA. */
const READABLE = {
  background: "oklch(0.98 0.01 85)",
  foreground: "oklch(0.2 0.03 60)",
  primary: "oklch(0.38 0.08 150)",
  "primary-foreground": "oklch(0.98 0.01 85)",
};

/** `src/lib/gen/scaffolds/landing-page/files/app/globals.css` (R2-1757's fixture). */
const LANDING_PAGE = {
  background: "oklch(0.99 0 0)",
  foreground: "oklch(0.15 0.004 0)",
  primary: "oklch(0.58 0.16 258)",
  "primary-foreground": "oklch(0.98 0 0)",
  secondary: "oklch(0.96 0.004 0)",
  "secondary-foreground": "oklch(0.22 0.004 0)",
};

/** R2-1757 repro B: dark primary, white label, white page. */
const DARK_PRIMARY = { background: "#ffffff", foreground: "#111111", primary: "#111111", "primary-foreground": "#ffffff" };

/** Codex on promote #1763/#1767 and R2-1770: dark primary with an unreadable dark label. */
const DARK_PAIR = { background: "#ffffff", foreground: "#111111", primary: "#111111", "primary-foreground": "#222222" };

const run = (theme: string, pageFile: CodeFile) => findUnreadableButtons([file("app/globals.css", theme), pageFile]);

describe("findUnreadableButtons — detects", () => {
  it("the original case: a darkened primary with a dark label, on Button and on a filled link (SM-135)", () => {
    const findings = run(
      css(DARKENED_PRIMARY),
      page(`      <Button>Boka bord</Button>
      <a href="/meny" className="bg-primary text-primary-foreground px-4">Meny</a>`),
    );
    expect(findings).toEqual([
      expect.objectContaining({ file: "app/page.tsx", line: 7, tag: "Button", background: "variant default (bg-primary)", text: "variant default (text-primary-foreground)" }),
      expect.objectContaining({ file: "app/page.tsx", line: 8, tag: "a", background: "bg-primary", text: "text-primary-foreground" }),
    ]);
    for (const finding of findings) expect(finding.ratio).toBeLessThan(BUTTON_TEXT_MIN_CONTRAST);
  });

  it("an invented CTA token with a mismatched label («Hitta hit»)", () => {
    const findings = run(
      css({ ...READABLE, cta: "oklch(0.32 0.06 150)" }),
      page(`      <Link href="#hitta-hit" className="rounded-full bg-cta px-6 py-3 text-foreground hover:bg-cta/90">Hitta hit</Link>`),
    );
    expect(findings).toEqual([expect.objectContaining({ tag: "Link", background: "bg-cta", text: "text-foreground" })]);
  });

  it("a white label on a white pill, and arbitrary colors", () => {
    const findings = run(
      css(READABLE),
      page(`      <Link href="/kontakt" className="!text-primary-foreground rounded-full bg-white px-4">Kontakt</Link>
      <button type="button" className="bg-[rgb(48,75,56)] text-[#1f2a22] px-4">Hitta hit</button>`),
    );
    expect(findings.map((finding) => finding.tag)).toEqual(["Link", "button"]);
  });

  it("the bots' cases, whose resting label is unreadable (Codex #1763, #1767; R2-1757 N)", () => {
    expect(run(css({ ...DARK_PAIR, "primary-hover": "#eeeeee" }), page(`      <Button>Boka</Button>`))).toHaveLength(1);
    expect(run(css(DARK_PAIR), page(`      <button className="bg-primary text-primary-foreground hover:bg-white">Boka</button>`))).toHaveLength(1);
    expect(run(css(DARK_PRIMARY), page(`      <a href="#" className="bg-primary text-black hover:bg-white">Boka</a>`))).toHaveLength(1);
  });

  it("a Button imported by a relative path to components/ui/button", () => {
    const pageFile = file(
      "components/site/hero.tsx",
      `import { Button } from "../ui/button";
export function Hero() {
  return <Button>Boka</Button>;
}
`,
    );
    expect(findUnreadableButtons([file("app/globals.css", css(DARK_PAIR)), pageFile])).toHaveLength(1);
  });
});

/**
 * R2-1757 (A–O), R2-1770 (U1, U2), Codex and Bugbot: buttons whose colors are
 * not certain. None of them may raise an alarm.
 */
describe("findUnreadableButtons — stays silent when it cannot be certain or the label reads", () => {
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
  const v2InertOverride = css(
    { ...DARKENED_PRIMARY, button: "#7b292d" },
    `@layer base {
  [data-slot="button"], :is(a, button).bg-primary {
    --color-primary: var(--color-button);
  }
}
`,
  );
  const cta = css({ ...READABLE, cta: "oklch(0.3 0.08 25)" });

  const cases: Array<[string, string, CodeFile]> = [
    ["A outline + bg-transparent + text-white on a dark hero", css(LANDING_PAGE), page(`<section className="relative bg-black"><Button size="lg" variant="outline" className="border-white/40 bg-transparent text-white hover:bg-white/10">Läs mer</Button></section>`)],
    ["B outline + bg-transparent in a bg-primary band", css(LANDING_PAGE), page(`<section className="bg-primary text-primary-foreground"><Button variant="outline" className="bg-transparent text-primary-foreground">Kontakta oss</Button></section>`)],
    ["C secondary + bg-transparent + text-white", css(LANDING_PAGE), page(`<Button variant="secondary" className="bg-transparent text-white">Mer</Button>`)],
    ["D <a> bg-transparent text-white", css(LANDING_PAGE), page(`<a href="#" className="border border-white bg-transparent text-white">Läs mer</a>`)],
    ["E outline with an inline style background", css(LANDING_PAGE), page(`<Button variant="outline" style={{ backgroundColor: "#111" }} className="text-white">Boka</Button>`)],
    ["F outline + bg-none", css(LANDING_PAGE), page(`<Button variant="outline" className="bg-none text-white">Info</Button>`)],
    ["G default Button + bg-transparent + text-white", css(LANDING_PAGE), page(`<Button className="bg-transparent text-white">Start</Button>`)],
    ["H outline + palette bg-slate-900", css(LANDING_PAGE), page(`<Button variant="outline" className="bg-slate-900 text-white">Boka</Button>`)],
    ["I secondary + palette bg-emerald-700", css(LANDING_PAGE), page(`<Button variant="secondary" className="bg-emerald-700 text-white hover:bg-emerald-800">Boka</Button>`)],
    ["J outline + unknown var()", css(LANDING_PAGE), page(`<Button variant="outline" className="bg-[var(--brand)] text-white">Boka</Button>`)],
    ["K <a> palette bg-slate-900", css(LANDING_PAGE), page(`<a href="#" className="bg-slate-900 text-white">Boka</a>`)],
    ["L var() theme with a .dark switch", shadcnVarTheme, page(`<a href="#" className="bg-primary text-white">Boka</a>`)],
    ["M background and text in different branches", css(DARK_PRIMARY), page(`<a href="#" className={active ? "bg-primary" : "text-black"}>Flik</a>`)],
    ["O comparison operand", css(DARK_PRIMARY), page(`<a href="#" className={tone === "text-black" ? "bg-primary" : ""}>Flik</a>`)],
    ["U1 a self-made Button in the same file", css(DARK_PAIR), page(`<Button>Boka</Button>`, `import { cn } from "@/lib/utils";
function Button({ className, ...props }: React.ComponentProps<"button">) {
  return <button className={cn("bg-white text-black", className)} {...props} />;
}`)],
    ["U2 Button imported from a project file", css(DARK_PAIR), page(`<Button>Boka</Button>`, `import { Button } from "@/components/site/Button";`)],
    ["Button imported under another name", css(DARK_PAIR), page(`<Button>Boka</Button>`, `import { Button as UiButton } from "@/components/ui/button";
import Button from "@/components/site/cta";`)],
    ["Codex: <Button> palette bg-yellow-300", css(DARK_PRIMARY), page(`<Button className="bg-yellow-300 text-black">Boka</Button>`)],
    ["Bugbot: text-[color:var(--x)]", css(DARK_PRIMARY), page(`<a href="#" className="bg-primary text-[color:var(--label)]">Boka</a>`)],
    ["V-2: a token redefined outside @theme", v2InertOverride, page(`<a href="#" className="bg-primary text-foreground">Se vår meny</a>`)],
    ["R2 label: translucent bg-primary/10", css(DARK_PAIR), page(`<a href="/nytt" className="bg-primary/10 text-primary-foreground">Nytt</a>`)],
    ["condition inside cn()", cta, page(`<button className={cn(tone === "dark" && "rounded bg-cta", size === "lg" && "px-8")}>Beställ</button>`)],
    ["inherited text", cta, page(`<a href="#" className="rounded bg-cta px-4">Beställ</a>`)],
    ["spread props", cta, page(`<a {...props} className="bg-cta text-foreground">Beställ</a>`)],
    ["Button asChild and its child", cta, page(`<Button asChild className="bg-cta text-foreground"><Link href="/" className="bg-cta text-foreground">Beställ</Link></Button>`)],
    ["dark: color class", cta, page(`<a href="#" className="bg-cta text-foreground dark:bg-background">Beställ</a>`)],
    ["translucent fill", css(READABLE), page(`<a href="#" className="bg-white/10 text-white backdrop-blur">Glas</a>`)],
    ["gradient", css(READABLE), page(`<a href="#" className="bg-gradient-to-r from-primary to-background text-foreground">Gradient</a>`)],
    ["template interpolation", css(READABLE), page(`<button className={\`bg-\${tone} text-foreground\`}>Mall</button>`)],
    ["hover-only colors", css(READABLE), page(`<Link href="/" className="hover:bg-primary hover:text-foreground">Hover</Link>`)],
    ["computed variant", css(DARKENED_PRIMARY), page(`<Button variant={variant} className="text-foreground">Okänd</Button>`)],
    ["readable buttons", css(READABLE), page(`<Button>Boka</Button><a href="#" className="bg-primary text-primary-foreground">Meny</a>`)],
    ["between 3:1 and 4.5:1 (scaffold default blue, 4.10:1)", css(LANDING_PAGE), page(`<Button>Boka</Button>`)],
  ];

  it.each(cases)("%s", (_label, theme, pageFile) => {
    expect(run(theme, pageFile)).toEqual([]);
  });

  it("ignores the shadcn primitives under components/ui and a project without a theme file", () => {
    const primitive = file("components/ui/button.tsx", `export const x = <button className="bg-primary text-primary-foreground" />;`);
    expect(findUnreadableButtons([file("app/globals.css", css(DARK_PAIR)), primitive])).toEqual([]);
    expect(findUnreadableButtons([page(`<Button>Boka</Button>`)])).toEqual([]);
  });
});

describe("findUnreadableButtons — reads, never writes", () => {
  it("leaves every input file exactly as it was", () => {
    const files = [file("app/globals.css", css(DARKENED_PRIMARY)), page(`      <Button>Boka bord</Button>`)];
    const snapshot = JSON.stringify(files);
    expect(findUnreadableButtons(files)).toHaveLength(1);
    expect(JSON.stringify(files)).toBe(snapshot);
  });
});

describe("findUnreadableButtons — scaffolds and curated palettes (SM-153)", () => {
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
  const variantThemes = (dir: string): Array<[string, string]> =>
    existsSync(dir)
      ? walk(dir, /\.json$/)
          .map((full) => [path.basename(full), (JSON.parse(readFileSync(full, "utf8")) as { themeTokens?: Record<string, unknown> }).themeTokens] as const)
          .filter((entry): entry is readonly [string, Record<string, unknown>] => Boolean(entry[1]))
          .map(([name, tokens]): [string, string] => [name, cssFromTokens(tokens)])
      : [];

  it("reports nearly invisible labels only: 3:1 for now, while the goal stays 4.5:1", () => {
    expect(BUTTON_TEXT_MIN_CONTRAST).toBe(3);
    expect(BUTTON_TEXT_MIN_CONTRAST).toBeLessThan(WCAG_AA_NORMAL_TEXT);
  });

  it("finds nothing on the scaffolds' real pages, with their own theme and every variant's", () => {
    expect(scaffoldIds.length).toBeGreaterThanOrEqual(10);
    const found: string[] = [];
    for (const id of scaffoldIds) {
      const filesDir = path.join(scaffoldsDir, id, "files");
      const files = walk(filesDir, /\.(css|tsx|jsx)$/).map((full) =>
        file(path.relative(filesDir, full).split(path.sep).join("/"), readFileSync(full, "utf8")),
      );
      const themes: Array<[string, string]> = [
        ["default", files.find((entry) => entry.path === "app/globals.css")!.content],
        ...variantThemes(path.join(root, "config/scaffold-variants", id)),
      ];
      for (const [theme, content] of themes) {
        const withTheme = files.map((entry) => (entry.path === "app/globals.css" ? { ...entry, content } : entry));
        for (const finding of findUnreadableButtons(withTheme)) found.push(`${id}/${theme}: ${finding.file}:${finding.line} ${finding.ratio}`);
      }
    }
    expect(found).toEqual([]);
  });

  /** A default and a secondary Button on every curated palette: none may be reported. */
  it("finds nothing for the default and secondary Button on every curated palette", () => {
    const themes: Array<[string, string]> = [
      ...scaffoldIds.map((id): [string, string] => [`scaffold:${id}`, readFileSync(path.join(scaffoldsDir, id, "files/app/globals.css"), "utf8")]),
      ...variantThemes(path.join(root, "config/scaffold-variants")),
      ...Object.entries(THEME_CLUSTERS).flatMap(([id, cluster]): Array<[string, string]> => [
        [`cluster:${id}:light`, cssFromTokens(cluster.light as unknown as Record<string, unknown>)],
        [`cluster:${id}:dark`, cssFromTokens(cluster.dark as unknown as Record<string, unknown>)],
      ]),
    ];
    expect(themes.length).toBeGreaterThanOrEqual(70);
    const buttons = page(`      <Button>Boka</Button>
      <Button variant="secondary">Mer</Button>`);
    const found = themes.flatMap(([label, theme]) => run(theme, buttons).map((finding) => `${label}: ${finding.background} ${finding.ratio}`));
    expect(found).toEqual([]);
  });
});
