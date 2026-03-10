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
    "Use this scaffold for dashboards, analytics panels, admin views, and data-heavy applications.",
    "Keep the sidebar navigation, stats cards, and main content area. Replace metrics, tables, and charts with user-specific data.",
    "Add or remove sidebar items and main sections as needed. Preserve the layout pattern.",
  ],
  files: [
    {
      path: "app/globals.css",
      content: `@import "tailwindcss";

@theme inline {
  --color-background: oklch(0.13 0.004 0);
  --color-foreground: oklch(0.95 0.004 0);
  --color-card: oklch(0.17 0.004 0);
  --color-card-foreground: oklch(0.95 0.004 0);
  --color-primary: oklch(0.62 0.004 0);
  --color-primary-foreground: oklch(0.98 0 0);
  --color-secondary: oklch(0.2 0.004 0);
  --color-secondary-foreground: oklch(0.9 0.004 0);
  --color-muted: oklch(0.2 0.004 0);
  --color-muted-foreground: oklch(0.6 0.004 0);
  --color-accent: oklch(0.23 0.004 0);
  --color-accent-foreground: oklch(0.9 0.004 0);
  --color-border: oklch(0.25 0.004 0);
  --color-ring: oklch(0.62 0.004 0);
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
