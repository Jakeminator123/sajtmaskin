import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DidAvatarEmbed } from "@/components/avatar/did-avatar-embed";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Avatar test",
  description: "Isolerad D-ID-testsida på /avatar.",
  robots: { index: false, follow: false },
};

const publicEnvVars = ["NEXT_PUBLIC_AVATAR_AGENT_ID", "NEXT_PUBLIC_AVATAR_CLIENT_KEY"];

const allowedOrigins = ["http://localhost:3000", "https://sajtmaskin.vercel.app"];

export default function AvatarPage() {
  return (
    <main className="bg-background min-h-screen px-6 py-10 md:py-16">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Button variant="ghost" className="border-border/20 bg-background/50 border" asChild>
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Till startsidan
            </Link>
          </Button>
          <p className="text-primary/75 text-xs font-medium tracking-[0.18em] uppercase">/avatar</p>
        </div>

        <section className="border-border/20 bg-card/30 rounded-[36px] border p-6 shadow-[0_28px_80px_rgba(6,10,20,0.3)] md:p-10">
          <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div>
              <p className="text-primary/75 text-xs font-medium tracking-[0.18em] uppercase">
                D-ID testyta
              </p>
              <h1 className="text-foreground mt-3 text-3xl font-(--font-heading) tracking-tight md:text-5xl">
                Prata med avatar-agenten
              </h1>
              <p className="text-muted-foreground mt-4 max-w-2xl text-sm leading-relaxed md:text-base">
                Den här sidan är medvetet isolerad till <code>/avatar</code> så att du kan verifiera
                att D-ID-agenten fungerar innan vi kopplar in fler flöden som OpenClaw eller
                verktyg/webhooks.
              </p>

              <div className="border-border/20 bg-background/70 mt-6 rounded-[28px] border p-3 md:p-4">
                <DidAvatarEmbed />
              </div>
            </div>

            <aside className="space-y-4">
              <div className="border-border/20 bg-background/60 rounded-[24px] border p-5">
                <p className="text-primary/75 text-xs font-medium tracking-[0.18em] uppercase">
                  Publika env-vars
                </p>
                <h2 className="text-foreground mt-3 text-xl font-(--font-heading)">
                  Rekommenderade namn
                </h2>
                <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
                  Våra egna env-namn får vara enkla, så länge klientkomponenten läser samma namn. På
                  den här testsidan används:
                </p>
                <ul className="text-foreground mt-4 space-y-2 text-sm">
                  {publicEnvVars.map((envVar) => (
                    <li
                      key={envVar}
                      className="border-border/20 bg-card/40 rounded-xl border px-3 py-2 font-mono text-xs"
                    >
                      {envVar}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="border-border/20 bg-background/60 rounded-[24px] border p-5">
                <p className="text-primary/75 text-xs font-medium tracking-[0.18em] uppercase">
                  D-ID krav
                </p>
                <h2 className="text-foreground mt-3 text-xl font-(--font-heading)">
                  Det som måste vara exakt
                </h2>
                <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
                  På embedsidan måste D-ID:s egna attribut heta exakt <code>data-client-key</code>,{" "}
                  <code>data-agent-id</code> och i <code>full</code>-läge även{" "}
                  <code>data-target-id</code>.
                </p>
                <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
                  Samma client key behöver också vara allowlistad för de origins du vill testa på:
                </p>
                <ul className="text-foreground mt-4 space-y-2 text-sm">
                  {allowedOrigins.map((origin) => (
                    <li
                      key={origin}
                      className="border-border/20 bg-card/40 rounded-xl border px-3 py-2 font-mono text-xs"
                    >
                      {origin}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="border-border/20 bg-primary/8 rounded-[24px] border p-5">
                <p className="text-primary/75 text-xs font-medium tracking-[0.18em] uppercase">
                  Valfritt nästa steg
                </p>
                <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
                  Det finns redan en tolerant route på <code>/api/did/conversation</code> om du
                  senare vill ta emot avslutade konversationer, men den behövs inte för att rendera
                  avataren på den här testsidan.
                </p>
              </div>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
