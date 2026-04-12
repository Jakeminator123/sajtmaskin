import { Button } from "@/components/ui/button";
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
