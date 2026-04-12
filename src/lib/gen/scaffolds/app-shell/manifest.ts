import type { ScaffoldManifest } from "../types";

export const appShellManifest: ScaffoldManifest = {
  id: "app-shell",
  label: "App Shell",
  description:
    "Operational app shell with sidebar navigation, workspace summaries, queue tables, and execution-focused content areas.",
  allowedBuildIntents: ["app"],
  tags: ["app-shell", "workspace", "operations", "crm", "saas", "backoffice", "admin", "portal", "internal-tool", "sidebar", "kontrollpanel", "verktyg"],
  promptHints: [
    "Use this scaffold for operational apps, internal tools, and workflow-oriented SaaS backoffices.",
    "Keep the sidebar + main workspace pattern, but prioritize queues, tasks, and action states over analytics storytelling.",
    "Use actionable tables, statuses, and task cards that map to real product workflows.",
    "Preserve the shell structure while adapting entities, labels, and actions to the user's domain.",
  ],
  qualityChecklist: [
    "Navigation shell, app density, and workspace feel should stay more prominent than marketing content.",
    "Primary panels, tables, and summaries should map to the user's real product/workflow.",
    "Account, billing, settings, or workspace affordances should feel layerable without breaking the shell.",
  ],
  research: {
    upgradeTargets: [
      "Add role-based navigation sections and per-role entry dashboards.",
      "Include bulk actions and row-level quick actions in queue tables.",
      "Add command palette and keyboard shortcuts for power-user workflows.",
    ],
    referenceTemplates: [
      { id: "multi-tenant-apps-turso-per-user-starter", title: "Turso Per-User Starter", categorySlug: "multi-tenant-apps", qualityScore: 96, strengths: ["verified Next.js codebase", "multi-tenant patterns", "user workspace isolation"] },
      { id: "multi-tenant-apps-b2b-multi-tenant-starter-kit", title: "B2B Multi-Tenant Starter Kit", categorySlug: "multi-tenant-apps", qualityScore: 94, strengths: ["verified Next.js codebase", "B2B app patterns", "team workspace shell"] },
      { id: "admin-dashboard-modernize-next-js-admin-dashboard-template", title: "Modernize Next.js Admin Dashboard", categorySlug: "admin-dashboard", qualityScore: 96, strengths: ["verified Next.js codebase", "sidebar navigation", "settings and admin patterns"] },
    ],
  },
  files: [
    {
      path: "app/globals.css",
      content: `@import "tailwindcss";

@theme inline {
  --color-background: oklch(0.12 0.004 0);
  --color-foreground: oklch(0.95 0.004 0);
  --color-card: oklch(0.16 0.004 0);
  --color-card-foreground: oklch(0.95 0.004 0);
  --color-primary: oklch(0.58 0.16 258);
  --color-primary-foreground: oklch(0.98 0 0);
  --color-secondary: oklch(0.19 0.004 0);
  --color-secondary-foreground: oklch(0.9 0.004 0);
  --color-muted: oklch(0.19 0.004 0);
  --color-muted-foreground: oklch(0.6 0.004 0);
  --color-accent: oklch(0.22 0.004 0);
  --color-accent-foreground: oklch(0.9 0.004 0);
  --color-destructive: oklch(0.55 0.2 25);
  --color-destructive-foreground: oklch(0.98 0.005 25);
  --color-border: oklch(0.23 0.004 0);
  --color-input: oklch(0.2 0.004 0);
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
    title: "Öppna ärenden",
    value: "184",
    change: "+9.2%",
    trend: "up" as const,
    icon: ShoppingCart,
  },
  {
    title: "SLA inom mål",
    value: "96.4%",
    change: "+1.8%",
    trend: "up" as const,
    icon: TrendingUp,
  },
  {
    title: "Aktiva handläggare",
    value: "42",
    change: "+4.5%",
    trend: "up" as const,
    icon: Users,
  },
  {
    title: "Eskalerade ärenden",
    value: "12",
    change: "-2.1%",
    trend: "up" as const,
    icon: DollarSign,
  },
];

const workflowQueue = [
  { id: "CASE-001", owner: "Anna Svensson", priority: "Hög", status: "Pågår" },
  { id: "CASE-002", owner: "Erik Johansson", priority: "Medel", status: "Väntar svar" },
  { id: "CASE-003", owner: "Maria Karlsson", priority: "Hög", status: "Blockerad" },
  { id: "CASE-004", owner: "Lars Nilsson", priority: "Låg", status: "Pågår" },
  { id: "CASE-005", owner: "Sofia Olsson", priority: "Medel", status: "Klar" },
];

function statusColor(status: string) {
  switch (status) {
    case "Klar": return "bg-emerald-500/15 text-emerald-400 border-emerald-500/20";
    case "Pågår": return "bg-blue-500/15 text-blue-400 border-blue-500/20";
    case "Väntar svar": return "bg-amber-500/15 text-amber-400 border-amber-500/20";
    case "Blockerad": return "bg-red-500/15 text-red-400 border-red-500/20";
    default: return "bg-muted text-muted-foreground";
  }
}

export default function DashboardPage() {
  return (
    <div className="space-y-8 p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Workspace</h1>
        <p className="text-muted-foreground">Operativ översikt för teamets dagliga arbete</p>
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
            <CardTitle>Aktiv kö</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-3 pr-4 font-medium">Ärende</th>
                    <th className="pb-3 pr-4 font-medium">Ansvarig</th>
                    <th className="pb-3 pr-4 font-medium">Prioritet</th>
                    <th className="pb-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {workflowQueue.map((item) => (
                    <tr key={item.id} className="border-b border-border/50 last:border-0">
                      <td className="py-3 pr-4 font-mono text-xs">{item.id}</td>
                      <td className="py-3 pr-4">{item.owner}</td>
                      <td className="py-3 pr-4">{item.priority}</td>
                      <td className="py-3">
                        <Badge variant="outline" className={statusColor(item.status)}>
                          {item.status}
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
            <CardTitle>Genomströmning per vecka</CardTitle>
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

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="bg-card border-border lg:col-span-2">
          <CardHeader>
            <CardTitle>Nästa steg</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              "Fördela blockerade ärenden till specialistteam",
              "Följ upp köer med väntetid över 24h",
              "Verifiera SLA för de fem högst prioriterade flödena",
            ].map((task) => (
              <div key={task} className="rounded-lg border border-border/60 px-4 py-3 text-sm">
                {task}
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>Teamstatus</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-muted-foreground">På plats: 12</p>
            <p className="text-muted-foreground">I möte: 3</p>
            <p className="text-muted-foreground">Tillgängliga: 9</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
`,
    },
    {
      path: "app/pipeline/page.tsx",
      content: `import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const stages = [
  { name: "Intake", count: 24, status: "ok" },
  { name: "Kvalificering", count: 18, status: "ok" },
  { name: "Genomförande", count: 41, status: "warning" },
  { name: "QA", count: 12, status: "ok" },
  { name: "Klart", count: 33, status: "ok" },
];

export default function PipelinePage() {
  return (
    <div className="space-y-8 p-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Pipeline</h1>
        <p className="text-muted-foreground">Visualisera hur arbetet flyter mellan varje steg.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stages.map((stage) => (
          <Card key={stage.name} className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-base">{stage.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-3xl font-semibold tabular-nums">{stage.count}</p>
              <Badge
                variant="outline"
                className={stage.status === "warning" ? "border-amber-500/30 text-amber-400" : "border-emerald-500/30 text-emerald-400"}
              >
                {stage.status === "warning" ? "Behöver uppföljning" : "Stabil"}
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
`,
    },
    {
      path: "app/tasks/page.tsx",
      content: `import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const tasks = [
  { title: "Verifiera ny onboarding-flow", owner: "Anna", due: "Idag", priority: "Hög" },
  { title: "Uppdatera webhook-monitorering", owner: "Erik", due: "Imorgon", priority: "Medel" },
  { title: "Stäng äldre backlog-ärenden", owner: "Maria", due: "Fredag", priority: "Låg" },
];

export default function TasksPage() {
  return (
    <div className="space-y-8 p-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
        <p className="text-muted-foreground">Prioriterade aktiviteter för teamet denna vecka.</p>
      </div>
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle>Aktiva uppgifter</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {tasks.map((task) => (
            <div key={task.title} className="rounded-lg border border-border/60 px-4 py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="font-medium">{task.title}</p>
                <Badge variant="outline">{task.priority}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Ansvarig: {task.owner} • Deadline: {task.due}</p>
            </div>
          ))}
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
        <p className="text-muted-foreground">Konfigurera workspace, notifieringar och teampreferenser.</p>
      </div>
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle>Workspace</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="workspace-name">Workspace-namn</Label>
            <Input id="workspace-name" placeholder="[Workspace]" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notification-channel">Notifieringskanal</Label>
            <Input id="notification-channel" placeholder="Slack / Teams / Email" />
          </div>
          <Button>Spara</Button>
        </CardContent>
      </Card>
    </div>
  );
}
`,
    },
    {
      path: "components/app-sidebar.tsx",
      content: `"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  LayoutDashboard,
  Workflow,
  ListTodo,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Workspace", href: "/", icon: LayoutDashboard },
  { label: "Pipeline", href: "/pipeline", icon: Workflow },
  { label: "Tasks", href: "/tasks", icon: ListTodo },
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
