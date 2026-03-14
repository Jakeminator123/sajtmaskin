export function buildPreviewBaseCss(): string {
  return [
    ":root {",
    "  --background: hsl(222 47% 11%);",
    "  --foreground: hsl(210 40% 98%);",
    "  --card: hsl(222 47% 14%);",
    "  --card-foreground: hsl(210 40% 98%);",
    "  --popover: hsl(222 47% 14%);",
    "  --popover-foreground: hsl(210 40% 98%);",
    "  --primary: hsl(217 91% 60%);",
    "  --primary-foreground: hsl(0 0% 100%);",
    "  --secondary: hsl(215 28% 17%);",
    "  --secondary-foreground: hsl(210 40% 98%);",
    "  --muted: hsl(217 33% 17%);",
    "  --muted-foreground: hsl(215 20% 70%);",
    "  --accent: hsl(159 64% 46%);",
    "  --accent-foreground: hsl(222 47% 11%);",
    "  --destructive: hsl(0 72% 51%);",
    "  --destructive-foreground: hsl(0 0% 100%);",
    "  --border: hsl(217 22% 26%);",
    "  --ring: hsl(217 91% 60%);",
    "}",
    "html, body, #root {",
    "  min-height: 100%;",
    "}",
    "html {",
    "  background-color: var(--background);",
    "  color: var(--foreground);",
    "}",
    "body {",
    "  margin: 0;",
    "  background-color: var(--background);",
    "  color: var(--foreground);",
    "}",
    ".bg-background { background-color: var(--background) !important; }",
    ".text-foreground { color: var(--foreground) !important; }",
    ".text-primary { color: var(--primary) !important; }",
    ".bg-card { background-color: var(--card) !important; }",
    ".text-card-foreground { color: var(--card-foreground) !important; }",
    ".bg-popover { background-color: var(--popover) !important; }",
    ".text-popover-foreground { color: var(--popover-foreground) !important; }",
    ".bg-primary { background-color: var(--primary) !important; }",
    ".text-primary-foreground { color: var(--primary-foreground) !important; }",
    ".bg-secondary { background-color: var(--secondary) !important; }",
    ".text-secondary-foreground { color: var(--secondary-foreground) !important; }",
    ".bg-muted { background-color: var(--muted) !important; }",
    ".text-muted-foreground { color: var(--muted-foreground) !important; }",
    ".bg-accent { background-color: var(--accent) !important; }",
    ".text-accent-foreground { color: var(--accent-foreground) !important; }",
    ".bg-destructive { background-color: var(--destructive) !important; }",
    ".text-destructive-foreground { color: var(--destructive-foreground) !important; }",
    ".border, .border-border { border-color: var(--border) !important; }",
    ".border-primary { border-color: var(--primary) !important; }",
    ".ring-ring { --tw-ring-color: var(--ring) !important; }",
    ".bg-muted\\/30 { background-color: color-mix(in oklab, var(--muted) 30%, transparent) !important; }",
    ".bg-muted\\/50 { background-color: color-mix(in oklab, var(--muted) 50%, transparent) !important; }",
    ".bg-primary\\/10 { background-color: color-mix(in oklab, var(--primary) 10%, transparent) !important; }",
    ".bg-primary\\/20 { background-color: color-mix(in oklab, var(--primary) 20%, transparent) !important; }",
    ".bg-primary\\/25 { background-color: color-mix(in oklab, var(--primary) 25%, transparent) !important; }",
    ".bg-accent\\/20 { background-color: color-mix(in oklab, var(--accent) 20%, transparent) !important; }",
    ".border-primary\\/40 { border-color: color-mix(in oklab, var(--primary) 40%, transparent) !important; }",
    ".border-primary\\/50 { border-color: color-mix(in oklab, var(--primary) 50%, transparent) !important; }",
  ].join("\n");
}

function buildThemeAliasLines(): string[] {
  return [
    "--background: var(--color-background);",
    "--foreground: var(--color-foreground);",
    "--card: var(--color-card);",
    "--card-foreground: var(--color-card-foreground);",
    "--popover: var(--color-card);",
    "--popover-foreground: var(--color-card-foreground);",
    "--primary: var(--color-primary);",
    "--primary-foreground: var(--color-primary-foreground);",
    "--secondary: var(--color-secondary);",
    "--secondary-foreground: var(--color-secondary-foreground);",
    "--muted: var(--color-muted);",
    "--muted-foreground: var(--color-muted-foreground);",
    "--accent: var(--color-accent);",
    "--accent-foreground: var(--color-accent-foreground);",
    "--border: var(--color-border);",
    "--ring: var(--color-ring);",
  ];
}

export function normalizePreviewCss(input: string): string {
  return input
    .replace(/@import\s+["']tailwindcss["'];?\s*/g, "")
    .replace(/@theme\s+inline\s*\{([\s\S]*?)\}/g, (_match, themeBody: string) => {
      const body = themeBody.trim();
      const aliasLines = buildThemeAliasLines();
      return [":root {", body, ...aliasLines.map((line) => `  ${line}`), "}"].join("\n");
    });
}
