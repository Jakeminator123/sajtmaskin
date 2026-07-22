import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ArrowRight, CheckCircle2 } from "lucide-react";

/**
 * SaaS hero with headline, dual CTA, stat strip, and a dashboard-shaped
 * product preview card. Curated from the proven `saas-landing` scaffold
 * (src/lib/gen/scaffolds/saas-landing/files/app/page.tsx).
 */
export function SaasHero() {
  return (
    <section className="px-6 py-20 sm:px-8 lg:py-28">
      <div className="mx-auto grid max-w-6xl gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div className="space-y-8">
          <Badge className="rounded-full bg-primary/15 px-3 py-1 text-primary hover:bg-primary/15">
            New: spring release
          </Badge>
          <div className="space-y-5">
            <h1 className="max-w-3xl text-5xl font-semibold tracking-tight sm:text-6xl">
              Run your whole operation from one workspace.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
              Plan work, track progress, and keep every team aligned — without
              stitching together five different tools.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button size="lg" className="rounded-full px-7">
              Start free trial <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline" className="rounded-full px-7">
              Watch product tour
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: "Setup time", value: "Minutes" },
              { label: "Teams onboard", value: "2,400+" },
              { label: "Uptime", value: "99.9%" },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border bg-card/70 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{item.label}</p>
                <p className="mt-2 text-lg font-semibold">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        <Card className="overflow-hidden rounded-4xl border-primary/20 bg-card/90 shadow-2xl shadow-primary/10">
          <CardHeader className="border-b bg-background/40 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Operations overview</p>
                <p className="text-sm text-muted-foreground">Live product snapshot</p>
              </div>
              <Badge variant="secondary" className="rounded-full">Q2 growth</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 p-6">
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { label: "MRR", value: "$84k" },
                { label: "Activation", value: "68%" },
                { label: "Retention", value: "92%" },
              ].map((stat) => (
                <div key={stat.label} className="rounded-2xl border bg-secondary/75 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{stat.label}</p>
                  <p className="mt-2 text-xl font-semibold">{stat.value}</p>
                </div>
              ))}
            </div>
            <div className="rounded-3xl border bg-background/85 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Weekly pipeline</p>
                  <p className="text-xs text-muted-foreground">Auto-updated</p>
                </div>
                <Badge variant="outline" className="rounded-full">+12.4%</Badge>
              </div>
              <div className="mt-5 space-y-3">
                {[
                  "Role-aware permissions",
                  "Fast onboarding flows",
                  "Automated weekly reports",
                  "Clear priority overview",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-3 rounded-2xl bg-secondary/70 px-4 py-3 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
