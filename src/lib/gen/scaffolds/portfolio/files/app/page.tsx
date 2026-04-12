import { Badge } from "@/components/ui/badge";
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
