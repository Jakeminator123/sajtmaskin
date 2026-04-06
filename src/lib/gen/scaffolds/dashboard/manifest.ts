import type { ScaffoldManifest } from "../types";

export const dashboardManifest: ScaffoldManifest = {
  id: "dashboard",
  family: "dashboard",
  label: "Dashboard",
  description:
    "Analytics and overview dashboard with sidebar, stats cards, data tables, and chart placeholders. For admin panels, analytics, and SaaS apps.",
  buildIntents: ["app"],
  tags: [
    "dashboard",
    "analytics",
    "admin",
    "stats",
    "metrics",
    "panel",
    "overview",
    "instrumentpanel",
    "statistik",
  ],
  promptHints: [
    "Use this scaffold for analytics-heavy dashboards, KPI monitoring, admin overviews, and data operations.",
    "Keep the sidebar navigation, stats cards, trend sections, and chart surfaces. Replace all metrics with domain-specific data.",
    "Treat this as an analytics cockpit rather than a CRUD workspace. Add deeper charts and reporting detail where needed.",
  ],
  qualityChecklist: [
    "The layout should remain app-like, dense, and operational rather than turning into a marketing page.",
    "Sidebar, top summary cards, and main data surfaces should match the user's actual domain and workflows.",
    "Tables, charts, and filters should look purposeful and realistic even when the data is static.",
  ],
  research: {
    upgradeTargets: [
      "Add a date range selector that drives KPI cards and chart datasets.",
      "Include segmented analytics views (traffic, conversion, retention) with tabs.",
      "Add export actions (CSV/PDF) and report scheduling placeholders.",
    ],
    referenceTemplates: [],
  },
  files: [
    {
      path: "app/globals.css",
      content: `@import "tailwindcss";

@theme inline {
  --color-background: oklch(0.13 0.004 0);
  --color-foreground: oklch(0.95 0.004 0);
  --color-card: oklch(0.17 0.004 0);
  --color-card-foreground: oklch(0.95 0.004 0);
  --color-primary: oklch(0.58 0.16 258);
  --color-primary-foreground: oklch(0.98 0 0);
  --color-secondary: oklch(0.2 0.004 0);
  --color-secondary-foreground: oklch(0.9 0.004 0);
  --color-muted: oklch(0.2 0.004 0);
  --color-muted-foreground: oklch(0.6 0.004 0);
  --color-accent: oklch(0.23 0.004 0);
  --color-accent-foreground: oklch(0.9 0.004 0);
  --color-border: oklch(0.25 0.004 0);
  --color-ring: oklch(0.58 0.16 258);
  --radius: 0.5rem;
  --sidebar-width: 260px;
}

@layer base {
  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground;
    font-family: var(--font-sans), ui-sans-serif, system-ui, sans-serif;
    background-image:
      radial-gradient(circle at top left, color-mix(in oklab, var(--color-primary) 16%, transparent) 0%, transparent 32%);
  }
}
`,
    },
    {
      path: "app/layout.tsx",
      content: `import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { DashboardSidebar } from "@/components/dashboard-sidebar";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Analytics and overview dashboard with stats, tables, and charts.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv" className="dark">
      <body className={\`\${inter.variable} antialiased\`}>
        <div className="flex h-screen overflow-hidden">
          <DashboardSidebar />
          <div className="flex-1 overflow-y-auto">{children}</div>
        </div>
      </body>
    </html>
  );
}
`,
    },
    {
      path: "app/page.tsx",
      content: `import { StatsCard } from "@/components/stats-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Users, CreditCard, TrendingUp } from "lucide-react";

const stats = [
  {
    title: "Aktiva sessioner",
    value: "1 247",
    change: "+18%",
    trend: "up" as const,
    icon: Activity,
  },
  {
    title: "Nya användare",
    value: "89",
    change: "+12%",
    trend: "up" as const,
    icon: Users,
  },
  {
    title: "Omsättning",
    value: "42 500 kr",
    change: "+8%",
    trend: "up" as const,
    icon: CreditCard,
  },
  {
    title: "Konvertering",
    value: "4.2%",
    change: "-0.2%",
    trend: "down" as const,
    icon: TrendingUp,
  },
];

const recentActivity = [
  { id: 1, action: "Ny användare registrerad", time: "2 min sedan", status: "success" },
  { id: 2, action: "Betalning genomförd", time: "15 min sedan", status: "success" },
  { id: 3, action: "Supportärende öppnat", time: "1 timme sedan", status: "pending" },
  { id: 4, action: "Uppdatering deployad", time: "2 timmar sedan", status: "success" },
];

export default function DashboardPage() {
  return (
    <div className="space-y-8 p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Översikt</h1>
        <p className="text-muted-foreground">Dashboard för mars 2026</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <StatsCard key={stat.title} {...stat} />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 bg-card border-border">
          <CardHeader>
            <CardTitle>Aktivitet</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivity.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-lg border border-border/50 px-4 py-3"
                >
                  <p className="text-sm font-medium">{item.action}</p>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{item.time}</span>
                    <Badge
                      variant="outline"
                      className={
                        item.status === "success"
                          ? "border-emerald-500/30 text-emerald-400"
                          : "border-amber-500/30 text-amber-400"
                      }
                    >
                      {item.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>Snabbstatistik</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-40 items-end gap-2">
              {[65, 45, 80, 55, 70, 90, 75, 85, 60, 95].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t bg-primary/70 transition-all hover:bg-primary"
                  style={{ height: \`\${h}%\` }}
                />
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Senaste 10 dagarna</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
`,
    },
    {
      path: "app/analytics/page.tsx",
      content: `import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const channels = [
  { name: "Organisk sök", sessions: "12 480", conversion: "3.8%", revenue: "182 000 kr" },
  { name: "Betalda annonser", sessions: "8 210", conversion: "4.4%", revenue: "156 400 kr" },
  { name: "Direkttrafik", sessions: "5 640", conversion: "5.1%", revenue: "134 200 kr" },
  { name: "Partners", sessions: "2 980", conversion: "4.2%", revenue: "72 800 kr" },
];

export default function AnalyticsPage() {
  return (
    <div className="space-y-8 p-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Analys</h1>
        <p className="text-muted-foreground">Djupare insikter för trafik, konvertering och intäkter.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 bg-card border-border">
          <CardHeader>
            <CardTitle>Konverteringstrend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-56 items-end gap-2">
              {[42, 55, 61, 58, 64, 69, 72, 68, 76, 82, 79, 85].map((h, index) => (
                <div key={index} className="flex-1 rounded-t bg-primary/70" style={{ height: \`\${h}%\` }} />
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Konverteringssignal vecka för vecka</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>Snapshot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Mål mot utfall denna period</p>
            <div className="rounded-lg border border-border/60 p-3">
              <p className="text-xs text-muted-foreground">Målkonvertering</p>
              <p className="text-xl font-semibold">4.5%</p>
            </div>
            <div className="rounded-lg border border-border/60 p-3">
              <p className="text-xs text-muted-foreground">Utfall</p>
              <p className="text-xl font-semibold">4.2%</p>
            </div>
            <Badge variant="outline" className="border-amber-500/30 text-amber-400">-0.3% mot mål</Badge>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle>Kanalöversikt</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-3 pr-4 font-medium">Kanal</th>
                  <th className="pb-3 pr-4 font-medium">Sessioner</th>
                  <th className="pb-3 pr-4 font-medium">Konvertering</th>
                  <th className="pb-3 font-medium">Intäkt</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((row) => (
                  <tr key={row.name} className="border-b border-border/50 last:border-0">
                    <td className="py-3 pr-4">{row.name}</td>
                    <td className="py-3 pr-4 tabular-nums">{row.sessions}</td>
                    <td className="py-3 pr-4">{row.conversion}</td>
                    <td className="py-3 tabular-nums">{row.revenue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
`,
    },
    {
      path: "app/users/page.tsx",
      content: `import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const users = [
  { name: "Anna Svensson", plan: "Pro", status: "Aktiv", lastSeen: "2 min sedan" },
  { name: "Erik Johansson", plan: "Basic", status: "Aktiv", lastSeen: "18 min sedan" },
  { name: "Maria Karlsson", plan: "Enterprise", status: "Avvaktande", lastSeen: "1 timme sedan" },
  { name: "Lars Nilsson", plan: "Pro", status: "Aktiv", lastSeen: "3 timmar sedan" },
];

export default function UsersPage() {
  return (
    <div className="space-y-8 p-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Användare</h1>
        <p className="text-muted-foreground">Överblick av användarstatus och abonnemang.</p>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle>Kontolista</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {users.map((user) => (
              <div key={user.name} className="flex flex-col gap-3 rounded-lg border border-border/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{user.name}</p>
                  <p className="text-xs text-muted-foreground">Senast aktiv: {user.lastSeen}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{user.plan}</Badge>
                  <Badge
                    variant="outline"
                    className={user.status === "Aktiv" ? "border-emerald-500/30 text-emerald-400" : "border-amber-500/30 text-amber-400"}
                  >
                    {user.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
`,
    },
    {
      path: "app/settings/page.tsx",
      content: `import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SettingsPage() {
  return (
    <div className="space-y-8 p-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Inställningar</h1>
        <p className="text-muted-foreground">Basinställningar för dashboard, rapporter och notifieringar.</p>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle>Organisation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="company-name">Företagsnamn</Label>
            <Input id="company-name" placeholder="[Företagsnamn]" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="timezone">Tidszon</Label>
            <Input id="timezone" placeholder="Europe/Stockholm" />
          </div>
          <Button>Spara ändringar</Button>
        </CardContent>
      </Card>
    </div>
  );
}
`,
    },
    {
      path: "components/dashboard-sidebar.tsx",
      content: `"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { LayoutDashboard, BarChart3, Settings, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Översikt", href: "/", icon: LayoutDashboard },
  { label: "Analys", href: "/analytics", icon: BarChart3 },
  { label: "Användare", href: "/users", icon: Users },
  { label: "Inställningar", href: "/settings", icon: Settings },
];

export function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-(--sidebar-width) flex-col border-r border-border bg-card">
      <div className="flex h-16 items-center px-6">
        <span className="text-lg font-bold tracking-tight">Dashboard</span>
      </div>

      <Separator />

      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Button
              key={item.href}
              variant={active ? "secondary" : "ghost"}
              className={cn(
                "w-full justify-start gap-3 text-sm",
                active ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
              asChild
            >
              <Link href={item.href}>
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            </Button>
          );
        })}
      </nav>

      <Separator />

      <div className="flex items-center gap-3 p-4">
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-primary/20 text-primary text-xs">AD</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">Admin</p>
          <p className="text-xs text-muted-foreground truncate">admin@example.com</p>
        </div>
      </div>
    </aside>
  );
}
`,
    },
    {
      path: "components/stats-card.tsx",
      content: `import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: string;
  change: string;
  trend: "up" | "down";
  icon: LucideIcon;
}

export function StatsCard({ title, value, change, trend, icon: Icon }: StatsCardProps) {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums">{value}</div>
        <div className="mt-1 flex items-center gap-1 text-xs">
          {trend === "up" ? (
            <TrendingUp className="h-3 w-3 text-emerald-400" />
          ) : (
            <TrendingDown className="h-3 w-3 text-red-400" />
          )}
          <span className={cn(trend === "up" ? "text-emerald-400" : "text-red-400")}>{change}</span>
          <span className="text-muted-foreground">vs förra månaden</span>
        </div>
      </CardContent>
    </Card>
  );
}
`,
    },
  ],
};
