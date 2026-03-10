import type { ScaffoldManifest } from "../types";

export const appShellManifest: ScaffoldManifest = {
  id: "app-shell",
  family: "app-shell",
  label: "App Shell",
  description:
    "Dashboard/app shell with sidebar navigation, stats cards, and data area. Great for admin panels, analytics dashboards, and SaaS apps.",
  buildIntents: ["app"],
  tags: ["dashboard", "admin", "analytics", "saas", "app", "panel", "crm"],
  promptHints: [
    "This scaffold has a sidebar, stats cards, and content area.",
    "Modify the navigation items, stats, and main content to match the user's needs.",
    "Add charts, tables, or other data displays in the main area.",
    "Keep the sidebar/topbar navigation pattern.",
  ],
  files: [
    {
      path: "app/globals.css",
      content: `@import "tailwindcss";

@theme inline {
  --color-background: oklch(0.12 0.01 260);
  --color-foreground: oklch(0.95 0.01 260);
  --color-card: oklch(0.16 0.01 260);
  --color-card-foreground: oklch(0.95 0.01 260);
  --color-primary: oklch(0.65 0.2 260);
  --color-primary-foreground: oklch(0.98 0.005 260);
  --color-secondary: oklch(0.19 0.015 260);
  --color-secondary-foreground: oklch(0.9 0.01 260);
  --color-muted: oklch(0.19 0.01 260);
  --color-muted-foreground: oklch(0.6 0.02 260);
  --color-accent: oklch(0.22 0.015 260);
  --color-accent-foreground: oklch(0.9 0.01 260);
  --color-destructive: oklch(0.55 0.2 25);
  --color-destructive-foreground: oklch(0.98 0.005 25);
  --color-border: oklch(0.23 0.015 260);
  --color-input: oklch(0.2 0.015 260);
  --color-ring: oklch(0.65 0.2 260);
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
import { AppSidebar } from "@/components/app-sidebar";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Workspace Dashboard",
  description: "A reusable application starter with navigation, stats, and data views.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv" className="dark">
      <body className={\`\${inter.variable} antialiased\`}>
        <div className="flex h-screen overflow-hidden">
          <AppSidebar />
          <div className="flex-1 overflow-y-auto">
            {children}
          </div>
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
import { DollarSign, ShoppingCart, Users, TrendingUp } from "lucide-react";

const stats = [
  {
    title: "Intäkter",
    value: "248 500 kr",
    change: "+12.5%",
    trend: "up" as const,
    icon: DollarSign,
  },
  {
    title: "Beställningar",
    value: "1 284",
    change: "+8.2%",
    trend: "up" as const,
    icon: ShoppingCart,
  },
  {
    title: "Aktiva användare",
    value: "3 421",
    change: "+23.1%",
    trend: "up" as const,
    icon: Users,
  },
  {
    title: "Konvertering",
    value: "3.8%",
    change: "-0.4%",
    trend: "down" as const,
    icon: TrendingUp,
  },
];

const recentOrders = [
  { id: "ORD-001", customer: "Anna Svensson", amount: "2 450 kr", status: "Levererad" },
  { id: "ORD-002", customer: "Erik Johansson", amount: "1 890 kr", status: "Skickad" },
  { id: "ORD-003", customer: "Maria Karlsson", amount: "3 200 kr", status: "Bearbetas" },
  { id: "ORD-004", customer: "Lars Nilsson", amount: "980 kr", status: "Levererad" },
  { id: "ORD-005", customer: "Sofia Olsson", amount: "4 100 kr", status: "Skickad" },
];

function statusColor(status: string) {
  switch (status) {
    case "Levererad": return "bg-emerald-500/15 text-emerald-400 border-emerald-500/20";
    case "Skickad": return "bg-blue-500/15 text-blue-400 border-blue-500/20";
    case "Bearbetas": return "bg-amber-500/15 text-amber-400 border-amber-500/20";
    default: return "bg-muted text-muted-foreground";
  }
}

export default function DashboardPage() {
  return (
    <div className="space-y-8 p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Översikt för mars 2026</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <StatsCard key={stat.title} {...stat} />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Data table */}
        <Card className="lg:col-span-3 bg-card border-border">
          <CardHeader>
            <CardTitle>Senaste beställningar</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-3 pr-4 font-medium">Order</th>
                    <th className="pb-3 pr-4 font-medium">Kund</th>
                    <th className="pb-3 pr-4 font-medium">Belopp</th>
                    <th className="pb-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((order) => (
                    <tr key={order.id} className="border-b border-border/50 last:border-0">
                      <td className="py-3 pr-4 font-mono text-xs">{order.id}</td>
                      <td className="py-3 pr-4">{order.customer}</td>
                      <td className="py-3 pr-4 tabular-nums">{order.amount}</td>
                      <td className="py-3">
                        <Badge variant="outline" className={statusColor(order.status)}>
                          {order.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Chart placeholder */}
        <Card className="lg:col-span-2 bg-card border-border">
          <CardHeader>
            <CardTitle>Intäkter per vecka</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-48 items-end gap-2">
              {[40, 55, 35, 70, 60, 80, 65, 90, 75, 85, 95, 88].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t bg-primary/80 transition-all hover:bg-primary"
                  style={{ height: \`\${h}%\` }}
                />
              ))}
            </div>
            <div className="mt-3 flex justify-between text-xs text-muted-foreground">
              <span>v1</span>
              <span>v6</span>
              <span>v12</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
`,
    },
    {
      path: "components/app-sidebar.tsx",
      content: `"use client";

import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  LayoutDashboard,
  BarChart3,
  Settings,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Analys", href: "/analytics", icon: BarChart3 },
  { label: "Användare", href: "/users", icon: Users },
  { label: "Inställningar", href: "/settings", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-(--sidebar-width) flex-col border-r border-border bg-card">
      <div className="flex h-16 items-center px-6">
        <span className="text-lg font-bold tracking-tight">Workspace</span>
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
                active
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              asChild
            >
              <a href={item.href}>
                <item.icon className="h-4 w-4" />
                {item.label}
              </a>
            </Button>
          );
        })}
      </nav>

      <Separator />

      <div className="flex items-center gap-3 p-4">
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-primary/20 text-primary text-xs">
            JD
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">Team Member</p>
          <p className="text-xs text-muted-foreground truncate">team@example.com</p>
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
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
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
          <span
            className={cn(
              trend === "up" ? "text-emerald-400" : "text-red-400",
            )}
          >
            {change}
          </span>
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
