import type { ScaffoldManifest } from "../types";

export const portfolioManifest: ScaffoldManifest = {
  id: "portfolio",
  family: "portfolio",
  label: "Portfolio",
  description:
    "Personal portfolio starter with intro, selected work, writing, credibility, and contact sections.",
  buildIntents: ["website", "template"],
  tags: [
    "portfolio",
    "personal",
    "creative",
    "designer",
    "developer",
    "photographer",
    "consultant",
    "agency",
  ],
  promptHints: [
    "Use this scaffold for personal brands, creative professionals, studios, consultants, and lightweight agency profiles.",
    "Keep the portfolio rhythm: intro, selected work, experience or credibility, writing, and contact.",
    "Adapt the visuals and tone to the person or studio rather than turning it into a generic company landing page.",
  ],
  files: [
    {
      path: "app/globals.css",
      content: `@import "tailwindcss";

@theme inline {
  --color-background: oklch(0.985 0 0);
  --color-foreground: oklch(0.15 0.004 0);
  --color-card: oklch(1 0 0);
  --color-card-foreground: oklch(0.18 0.004 0);
  --color-primary: oklch(0.45 0.004 0);
  --color-primary-foreground: oklch(0.98 0 0);
  --color-secondary: oklch(0.96 0 0);
  --color-secondary-foreground: oklch(0.2 0.004 0);
  --color-muted: oklch(0.955 0 0);
  --color-muted-foreground: oklch(0.45 0.004 0);
  --color-accent: oklch(0.94 0.004 0);
  --color-accent-foreground: oklch(0.2 0.004 0);
  --color-border: oklch(0.91 0.004 0);
  --color-ring: oklch(0.45 0.004 0);
  --radius: 1rem;
}

@layer base {
  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground antialiased;
    font-family: var(--font-sans), ui-sans-serif, system-ui, sans-serif;
    background-image:
      radial-gradient(circle at top right, color-mix(in oklab, var(--color-primary) 10%, white) 0%, transparent 24%),
      linear-gradient(to bottom, transparent 0%, color-mix(in oklab, var(--color-accent) 18%, white) 100%);
  }
}
`,
    },
    {
      path: "app/layout.tsx",
      content: `import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SiteFooter } from "@/components/site-footer";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Portfolio Starter",
  description: "A clean portfolio starter with selected work, writing, and contact sections.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.variable}>
        <main>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
`,
    },
    {
      path: "app/page.tsx",
      content: `import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, Sparkles } from "lucide-react";
import { ProjectCard } from "@/components/project-card";

const projects = [
  {
    title: "[Projektnamn 1]",
    category: "Brand site",
    description: "A layered studio site with a warmer editorial feel, focused on clarity, testimonials, and enquiry quality.",
    image: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=900&h=700&fit=crop",
  },
  {
    title: "[Projektnamn 2]",
    category: "Product launch",
    description: "A launch page for a design tool, built around product framing, dense UI screenshots, and pricing-driven conversion.",
    image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=900&h=700&fit=crop",
  },
  {
    title: "[Projektnamn 3]",
    category: "Portfolio + writing",
    description: "A personal site that balances project case studies with lighter essays and a more reflective tone.",
    image: "https://images.unsplash.com/photo-1517048676732-d65bc937f952?w=900&h=700&fit=crop",
  },
];

const experience = [
  { role: "Independent designer & developer", period: "2022—Now", note: "Design systems, product sites, and founder-facing launches." },
  { role: "Lead product designer", period: "2019—2022", note: "Worked across onboarding, growth experiments, and platform navigation." },
  { role: "Front-end consultant", period: "2016—2019", note: "Helped teams turn rough direction into usable and credible interfaces." },
];

const writing = [
  "Designing calmer product surfaces for busy teams",
  "What makes a portfolio feel specific instead of interchangeable",
  "Three ways to improve a landing page before you add more features",
];

export default function HomePage() {
  return (
    <div className="px-6 py-16 sm:px-8 sm:py-20">
      <div className="mx-auto max-w-6xl space-y-20">
        <section className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-end">
          <div className="space-y-6">
            <Badge className="rounded-full px-3 py-1">Portfolio starter</Badge>
            <div className="space-y-4">
              <h1 className="max-w-3xl text-5xl font-semibold tracking-tight sm:text-6xl">
                A personal site with stronger work, writing, and credibility structure.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
                Inspired by cleaner portfolio references, this starter gives the model a sharper shape for individual creatives,
                consultants, photographers, or small studios who need a site with personality.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button size="lg" className="rounded-full px-7">
                View selected work <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" className="rounded-full px-7">
                Read writing
              </Button>
            </div>
          </div>

          <Card className="rounded-4xl border bg-card/85 p-2 shadow-lg">
            <CardContent className="grid gap-4 rounded-3xl bg-muted/50 p-6 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm uppercase tracking-[0.16em] text-muted-foreground">Positioning</p>
                <p className="text-2xl font-semibold tracking-tight">Selected work, story, and proof in one coherent flow.</p>
              </div>
              <div className="space-y-3 rounded-[1.4rem] bg-background/85 p-5">
                {["Personal intro with tone", "Project showcase", "Experience + writing", "Contact CTA"].map((item) => (
                  <div key={item} className="flex items-center gap-3 text-sm">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        <section id="work" className="space-y-8">
          <div className="max-w-2xl space-y-3">
            <Badge variant="secondary" className="rounded-full">Selected work</Badge>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Project cards that already feel like case studies</h2>
            <p className="text-lg leading-8 text-muted-foreground">
              Replace the titles, images, and descriptions with the user's own work, but keep the rhythm and spacing.
            </p>
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard key={project.title} {...project} />
            ))}
          </div>
        </section>

        <section className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-5">
            <Badge variant="secondary" className="rounded-full">Experience</Badge>
            <h2 className="text-3xl font-semibold tracking-tight">Credibility without turning it into a corporate page</h2>
            <p className="text-lg leading-8 text-muted-foreground">
              The portfolio should still feel personal. Use this section for experience, selected roles, recognitions, or client categories.
            </p>
          </div>
          <div className="space-y-4">
            {experience.map((item) => (
              <Card key={item.role} className="rounded-[1.6rem] border bg-card/80">
                <CardContent className="flex flex-col gap-3 p-6 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <p className="text-lg font-semibold">{item.role}</p>
                    <p className="text-sm leading-7 text-muted-foreground">{item.note}</p>
                  </div>
                  <Badge variant="outline" className="w-fit rounded-full">{item.period}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="grid gap-10 rounded-4xl border bg-card/70 p-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-3">
            <Badge variant="secondary" className="rounded-full">Writing</Badge>
            <h2 className="text-3xl font-semibold tracking-tight">A portfolio that can also carry ideas</h2>
            <p className="text-lg leading-8 text-muted-foreground">
              Inspired by portfolio-plus-blog references. This gives the model an obvious place for essays, notes, or case-study thinking.
            </p>
          </div>
          <div className="space-y-3">
            {writing.map((post) => (
              <a
                key={post}
                href="#"
                className="block rounded-[1.4rem] border bg-background/85 px-5 py-4 transition-all hover:border-primary/30 hover:shadow-sm"
              >
                <p className="font-medium">{post}</p>
                <p className="mt-1 text-sm text-muted-foreground">Use this slot for essays, project notes, or editorial content.</p>
              </a>
            ))}
          </div>
        </section>

        <section className="rounded-4xl border bg-linear-to-br from-accent/80 via-background to-primary/10 p-8 sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div className="space-y-4">
              <Badge className="rounded-full px-3 py-1">Contact</Badge>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Make it easy to start the conversation</h2>
              <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
                Personal portfolios work best when the site ends with a clear next step: contact, booking, enquiry, or availability.
              </p>
            </div>
            <div className="rounded-3xl bg-background/85 p-6 shadow-sm">
              <p className="text-sm uppercase tracking-[0.16em] text-muted-foreground">Availability</p>
              <p className="mt-2 text-2xl font-semibold">Booking selected projects for Q3</p>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                Swap this message, the CTA, and the contact details to fit the person, studio, or practice.
              </p>
              <Button className="mt-6 rounded-full" size="lg">
                Say hello <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
`,
    },
    {
      path: "components/project-card.tsx",
      content: `import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight } from "lucide-react";
import Image from "next/image";

type ProjectCardProps = {
  title: string;
  category: string;
  description: string;
  image: string;
};

export function ProjectCard({ title, category, description, image }: ProjectCardProps) {
  return (
    <Card className="overflow-hidden rounded-[1.8rem] border bg-card/85 transition-all hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg">
      <div className="relative aspect-4/3 overflow-hidden">
        <Image src={image} alt={title} fill className="object-cover" />
      </div>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <Badge variant="secondary" className="rounded-full">{category}</Badge>
          <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <p className="text-xl font-semibold">{title}</p>
          <p className="text-sm leading-7 text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}
`,
    },
    {
      path: "components/site-footer.tsx",
      content: `const links = {
  Navigation: ["Work", "Writing", "About"],
  Connect: ["Email", "LinkedIn", "GitHub"],
};

export function SiteFooter() {
  return (
    <footer className="px-6 py-12 sm:px-8">
      <div className="mx-auto grid max-w-6xl gap-10 rounded-4xl border bg-card/75 p-8 lg:grid-cols-[1.2fr_0.8fr_0.8fr]">
        <div className="space-y-4">
          <p className="text-lg font-semibold tracking-tight">[Företagsnamn]</p>
          <p className="max-w-sm text-sm leading-7 text-muted-foreground">
            Personal portfolio starter for creatives, consultants, and founder-led brands that need a sharper first impression.
          </p>
        </div>
        {Object.entries(links).map(([title, items]) => (
          <div key={title} className="space-y-3">
            <p className="text-sm font-medium">{title}</p>
            <div className="space-y-2">
              {items.map((item) => (
                <a key={item} href="#" className="block text-sm text-muted-foreground transition-colors hover:text-foreground">
                  {item}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </footer>
  );
}
`,
    },
  ],
};
