import { Badge } from "@/components/ui/badge";
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
