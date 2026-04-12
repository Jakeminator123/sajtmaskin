import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export default function SignupPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">Skapa konto</CardTitle>
          <CardDescription>Fyll i uppgifterna för att registrera dig</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Namn</Label>
            <Input id="name" type="text" placeholder="Ditt namn" className="bg-card" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">E-post</Label>
            <Input id="email" type="email" placeholder="namn@example.com" className="bg-card" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Lösenord</Label>
            <Input id="password" type="password" placeholder="••••••••" className="bg-card" />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button size="lg" className="w-full">Registrera</Button>
          <p className="text-sm text-muted-foreground">
            Har du redan ett konto?{" "}
            <Link href="/login" className="font-medium text-foreground hover:underline">
              Logga in
            </Link>
          </p>
        </CardFooter>
      </Card>
    </main>
  );
}
