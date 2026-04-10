import type { ScaffoldManifest } from "../types";

export const docsKnowledgeManifest: ScaffoldManifest = {
  id: "docs-knowledge",
  family: "docs-knowledge",
  label: "Documentation / Knowledge Base",
  description:
    "Documentation site with sidebar navigation, breadcrumbs, collapsible sections, search, and changelog — ideal for help centers, API docs, wikis, and knowledge bases.",
  allowedBuildIntents: ["website", "template"],
  tags: [
    "docs",
    "documentation",
    "knowledge-base",
    "help-center",
    "changelog",
    "api-docs",
    "wiki",
    "manual",
    "guide",
    "faq",
  ],
  promptHints: [
    "Use this scaffold for documentation sites, help centers, knowledge bases, API references, changelogs, and wikis.",
    "Keep the docs rhythm: sidebar navigation, breadcrumbs, collapsible content sections, and a search input.",
    "Adapt section titles, content topics, and navigation structure to the user's domain instead of replacing the layout.",
  ],
  qualityChecklist: [
    "Sidebar navigation should reflect the content hierarchy and stay usable on mobile.",
    "Breadcrumbs should trace the path from root to current page.",
    "Content sections should use Accordion/Collapsible for long reference material.",
    "A search input should be visible in the sidebar or header.",
  ],
  research: {
    upgradeTargets: [
      "Add full-text search with Command palette (Cmd+K).",
      "Add version selector for multi-version documentation.",
      "Add table of contents sidebar for long pages.",
    ],
    referenceTemplates: [],
  },
  files: [
    {
      path: "app/globals.css",
      content: `@import "tailwindcss";

@theme inline {
  --color-background: oklch(0.99 0.002 260);
  --color-foreground: oklch(0.13 0.02 260);
  --color-card: oklch(1 0 0);
  --color-card-foreground: oklch(0.13 0.02 260);
  --color-primary: oklch(0.55 0.18 260);
  --color-primary-foreground: oklch(0.98 0 0);
  --color-secondary: oklch(0.96 0.01 260);
  --color-secondary-foreground: oklch(0.2 0.02 260);
  --color-muted: oklch(0.96 0.005 260);
  --color-muted-foreground: oklch(0.45 0.02 260);
  --color-accent: oklch(0.94 0.01 260);
  --color-accent-foreground: oklch(0.2 0.02 260);
  --color-border: oklch(0.92 0.005 260);
  --color-ring: oklch(0.55 0.18 260);
  --radius: 0.625rem;
}

@layer base {
  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground antialiased;
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
  title: "Documentation",
  description: "Documentation and knowledge base.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <body className={inter.variable}>{children}</body>
    </html>
  );
}
`,
    },
    {
      path: "app/page.tsx",
      content: `import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, FileText, Lightbulb, ArrowRight } from "lucide-react";

const sections = [
  { title: "Getting Started", description: "Quick start guide and installation.", href: "/docs", icon: Lightbulb },
  { title: "Guides", description: "Step-by-step tutorials and how-tos.", href: "/docs/guides", icon: BookOpen },
  { title: "Changelog", description: "Latest updates and release notes.", href: "/changelog", icon: FileText },
];

export default function DocsLanding() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
      <div className="space-y-4 text-center">
        <Badge variant="secondary" className="rounded-full">Documentation</Badge>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">How can we help?</h1>
        <p className="mx-auto max-w-xl text-lg text-muted-foreground">
          Browse the documentation, follow guides, or check the latest updates.
        </p>
      </div>

      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((section) => (
          <Link key={section.href} href={section.href}>
            <Card className="h-full transition-colors hover:border-primary/30">
              <CardHeader>
                <section.icon className="h-6 w-6 text-primary" />
                <CardTitle className="mt-2">{section.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{section.description}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary">
                  Browse <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
`,
    },
    {
      path: "app/docs/layout.tsx",
      content: `import { DocsSidebar } from "@/components/docs-sidebar";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-7xl gap-8 px-6 py-10">
      <aside className="hidden w-64 shrink-0 lg:block">
        <DocsSidebar />
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
`,
    },
    {
      path: "app/docs/page.tsx",
      content: `import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";

const faqs = [
  { q: "How do I get started?", a: "Follow the quick start guide in the Getting Started section." },
  { q: "Where can I find API documentation?", a: "Check the API Reference section in the sidebar." },
  { q: "How do I report a bug?", a: "Open an issue on GitHub or contact support." },
];

export default function DocsIndex() {
  return (
    <div className="space-y-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink href="/">Home</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Docs</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Documentation</h1>
        <p className="text-muted-foreground">Everything you need to know. Browse sections in the sidebar or start with the FAQ below.</p>
      </div>

      <Separator />

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Frequently Asked Questions</h2>
        <Accordion type="multiple" className="w-full">
          {faqs.map((faq, i) => (
            <AccordionItem key={i} value={\`faq-\${i}\`}>
              <AccordionTrigger>{faq.q}</AccordionTrigger>
              <AccordionContent>{faq.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </div>
  );
}
`,
    },
    {
      path: "app/docs/[slug]/page.tsx",
      content: `import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { notFound } from "next/navigation";

const pages: Record<string, { title: string; body: string }> = {
  "getting-started": {
    title: "Getting Started",
    body: "This is a placeholder for the Getting Started guide. Replace with real onboarding content: installation, first steps, and prerequisites.",
  },
  "guides": {
    title: "Guides",
    body: "Placeholder for step-by-step guides. Add tutorials, how-tos, and walkthroughs relevant to your product or project.",
  },
  "api-reference": {
    title: "API Reference",
    body: "Placeholder for API documentation. Document endpoints, parameters, response formats, and authentication.",
  },
};

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = pages[slug];
  if (!page) notFound();

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink href="/">Home</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink href="/docs">Docs</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>{page.title}</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <h1 className="text-3xl font-semibold tracking-tight">{page.title}</h1>
      <Separator />
      <div className="prose max-w-none">
        <p className="text-base leading-7">{page.body}</p>
      </div>
    </div>
  );
}
`,
    },
    {
      path: "app/changelog/page.tsx",
      content: `import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";

const releases = [
  { version: "1.2.0", date: "2026-04-01", changes: ["Added search functionality.", "Improved sidebar navigation.", "Fixed mobile layout issues."] },
  { version: "1.1.0", date: "2026-03-15", changes: ["Added changelog page.", "New accordion-based FAQ section.", "Performance improvements."] },
  { version: "1.0.0", date: "2026-03-01", changes: ["Initial release with core documentation structure.", "Sidebar navigation and breadcrumbs.", "Responsive layout."] },
];

export default function ChangelogPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <div className="space-y-3">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">Back to home</Link>
        <h1 className="text-3xl font-semibold tracking-tight">Changelog</h1>
        <p className="text-muted-foreground">All notable updates and releases.</p>
      </div>

      <div className="mt-10 space-y-8">
        {releases.map((release) => (
          <div key={release.version} className="space-y-3">
            <div className="flex items-center gap-3">
              <Badge variant="secondary">{release.version}</Badge>
              <span className="text-sm text-muted-foreground">{release.date}</span>
            </div>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {release.changes.map((change, i) => (
                <li key={i}>{change}</li>
              ))}
            </ul>
            <Separator />
          </div>
        ))}
      </div>
    </div>
  );
}
`,
    },
    {
      path: "components/docs-sidebar.tsx",
      content: `"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronRight, Search } from "lucide-react";
import { useState } from "react";

const navSections = [
  {
    title: "Getting Started",
    items: [
      { label: "Introduction", href: "/docs" },
      { label: "Quick Start", href: "/docs/getting-started" },
    ],
  },
  {
    title: "Guides",
    items: [
      { label: "All Guides", href: "/docs/guides" },
    ],
  },
  {
    title: "Reference",
    items: [
      { label: "API Reference", href: "/docs/api-reference" },
    ],
  },
];

export function DocsSidebar() {
  const pathname = usePathname();
  const [search, setSearch] = useState("");

  const filtered = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) =>
        item.label.toLowerCase().includes(search.toLowerCase()),
      ),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <div className="sticky top-20 space-y-4">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search docs..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <ScrollArea className="h-[calc(100vh-12rem)]">
        <nav className="space-y-4">
          {filtered.map((section) => (
            <Collapsible key={section.title} defaultOpen>
              <CollapsibleTrigger className="flex w-full items-center justify-between text-sm font-medium">
                {section.title}
                <ChevronRight className="h-4 w-4 transition-transform [[data-state=open]>&]:rotate-90" />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-1 space-y-0.5 pl-2">
                {section.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={\`block rounded-md px-2 py-1.5 text-sm transition-colors \${
                      pathname === item.href
                        ? "bg-accent text-accent-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground"
                    }\`}
                  >
                    {item.label}
                  </Link>
                ))}
              </CollapsibleContent>
            </Collapsible>
          ))}
        </nav>
      </ScrollArea>
    </div>
  );
}
`,
    },
  ],
};
