import { StatsCard } from "@/components/stats-card";
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
                  style={{ height: `${h}%` }}
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
