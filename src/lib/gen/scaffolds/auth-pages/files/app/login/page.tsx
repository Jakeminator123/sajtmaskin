import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">Logga in</CardTitle>
          <CardDescription>Ange dina uppgifter för att logga in</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">E-post</Label>
            <Input id="email" type="email" placeholder="namn@example.com" className="bg-card" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Lösenord</Label>
              <Link
                href="/forgot-password"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Glömt lösenord?
              </Link>
            </div>
            <Input id="password" type="password" placeholder="••••••••" className="bg-card" />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button size="lg" className="w-full">Logga in</Button>
          <p className="text-sm text-muted-foreground">
            Har du inget konto?{" "}
            <Link href="/signup" className="font-medium text-foreground hover:underline">
              Registrera
            </Link>
          </p>
        </CardFooter>
      </Card>
    </main>
  );
}
