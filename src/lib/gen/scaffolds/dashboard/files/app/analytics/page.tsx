import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
                <div key={index} className="flex-1 rounded-t bg-primary/70" style={{ height: `${h}%` }} />
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
