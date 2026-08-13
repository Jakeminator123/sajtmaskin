import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6">
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight">Auth-sidor</h1>
        <h2 className="text-muted-foreground max-w-md text-base font-normal">
          Den här scaffolden ger dig sidor för inloggning, registrering och glömt lösenord. Byt ut landningen mot appens startsida eller en redirect.
        </h2>
      </div>
      <div className="flex gap-4">
        <Button asChild size="lg" className="rounded-full">
          <Link href="/login">
            Logga in <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="rounded-full">
          <Link href="/signup">Registrera</Link>
        </Button>
      </div>
    </main>
  );
}
