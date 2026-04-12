import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">Återställ lösenord</CardTitle>
          <CardDescription>
            Ange din e-postadress så skickar vi en länk för att återställa lösenordet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">E-post</Label>
            <Input id="email" type="email" placeholder="namn@example.com" className="bg-card" />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button size="lg" className="w-full">Skicka återställningslänk</Button>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Tillbaka till inloggning
          </Link>
        </CardFooter>
      </Card>
    </main>
  );
}
