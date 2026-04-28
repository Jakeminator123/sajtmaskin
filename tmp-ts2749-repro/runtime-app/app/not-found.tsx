
import { ArrowLeft, Gamepad as Gamepad2, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button"
import Link from "next/link"



export default function NotFound() {
  return (
    <div className="section-shell section-padding">
      <div className="surface-panel rounded-[2rem] p-8 sm:p-12">
        <div className="max-w-2xl space-y-6">
          <div className="inline-flex items-center gap-3 rounded-full border border-border bg-card/80 px-4 py-2 text-sm font-medium text-foreground">
            <SearchX className="h-4 w-4 text-primary" />
            Sidan finns inte
          </div>
          <div className="space-y-3">
            <h1 className="font-display text-4xl tracking-tight text-balance sm:text-5xl">
              Den här beställningen hittades inte.
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Länken verkar ha blivit kall. Gå tillbaka till restaurangens
              startsida eller hoppa direkt till hamburgerspelet.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild className="rounded-full px-6 active:scale-95">
              <Link href="/">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Till Om oss
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="rounded-full px-6 active:scale-95"
            >
              <Link href="/spel">
                <Gamepad2 className="mr-2 h-4 w-4" />
                Öppna hamburgerspelet
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}