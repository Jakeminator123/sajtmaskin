import type { ScaffoldManifest } from "../types";

export const baseNextjsManifest: ScaffoldManifest = {
  id: "base-nextjs",
  family: "base-nextjs",
  label: "Base Next.js",
  description:
    "Minimal Next.js starter with Tailwind, App Router, and dark theme.",
  buildIntents: ["website", "template"],
  tags: ["starter", "minimal", "nextjs"],
  promptHints: [
    "Keep it simple. This is a minimal base — add sections as needed.",
  ],
  files: [
    {
      path: "app/globals.css",
      content: `@import "tailwindcss";

@theme inline {
  --color-background: oklch(0.15 0.01 260);
  --color-foreground: oklch(0.95 0.01 260);
  --color-card: oklch(0.18 0.01 260);
  --color-card-foreground: oklch(0.95 0.01 260);
  --color-primary: oklch(0.65 0.2 260);
  --color-primary-foreground: oklch(0.98 0.005 260);
  --color-secondary: oklch(0.22 0.015 260);
  --color-secondary-foreground: oklch(0.9 0.01 260);
  --color-muted: oklch(0.22 0.01 260);
  --color-muted-foreground: oklch(0.6 0.02 260);
  --color-accent: oklch(0.25 0.015 260);
  --color-accent-foreground: oklch(0.9 0.01 260);
  --color-border: oklch(0.28 0.015 260);
  --color-ring: oklch(0.65 0.2 260);
  --radius: 0.625rem;
}

@layer base {
  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground;
    font-family: var(--font-sans), ui-sans-serif, system-ui, sans-serif;
  }
}
`,
    },
    {
      path: "app/layout.tsx",
      content: `import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Min webbplats",
  description: "Byggd med Next.js och Tailwind CSS",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv" className="dark">
      <body className={\`\${inter.variable} antialiased\`}>{children}</body>
    </html>
  );
}
`,
    },
    {
      path: "app/page.tsx",
      content: `export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-16 px-6 py-24">
      <div className="text-center space-y-4">
        <h1 className="text-5xl font-bold tracking-tight text-foreground">
          Välkommen
        </h1>
        <p className="text-lg text-muted-foreground max-w-md mx-auto">
          En modern webbplats byggd med Next.js, Tailwind CSS och App Router.
        </p>
      </div>

      <section className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3 max-w-5xl w-full">
        <div className="rounded-xl border border-border bg-card p-6 space-y-2">
          <h2 className="text-xl font-semibold text-card-foreground">Snabb</h2>
          <p className="text-sm text-muted-foreground">
            Server-renderad med Next.js App Router för blixtsnabb laddning.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6 space-y-2">
          <h2 className="text-xl font-semibold text-card-foreground">Modern</h2>
          <p className="text-sm text-muted-foreground">
            Tailwind CSS, React 19 och de senaste webbstandarderna.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6 space-y-2">
          <h2 className="text-xl font-semibold text-card-foreground">Flexibel</h2>
          <p className="text-sm text-muted-foreground">
            Bygg vidare med valfria komponenter, API-routes och databasstöd.
          </p>
        </div>
      </section>
    </main>
  );
}
`,
    },
  ],
};
