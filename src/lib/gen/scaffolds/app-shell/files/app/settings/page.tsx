import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SettingsPage() {
  return (
    <div className="space-y-8 p-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Inställningar</h1>
        <p className="text-muted-foreground">
          Konfigurera arbetsyta, notifieringar och teampreferenser.
        </p>
        <p className="text-sm font-medium">Demoformulär — sparas inte</p>
        <p className="text-muted-foreground text-sm">
          Fälten visar ett gränssnittsexempel. Lagring och Slack-, Teams- eller e-postnotifieringar
          är inte anslutna.
        </p>
      </div>
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle>Arbetsyta</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="workspace-name">Namn på arbetsyta</Label>
            <Input id="workspace-name" placeholder="[Arbetsyta]" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notification-channel">Notifieringskanal</Label>
            <Input id="notification-channel" placeholder="Slack / Teams / E-post" />
          </div>
          <Button type="button" disabled>
            Spara (inte anslutet)
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
