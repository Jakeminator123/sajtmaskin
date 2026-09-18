"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { AuthModal } from "@/components/auth/auth-modal";
import { Navbar } from "@/components/landing-v2/navbar";
import { LandingFooter } from "@/components/landing-v2/landing-footer";
import { SiteBackground } from "@/components/layout/site-background";
import { AnalysTool } from "@/components/analys/analys-tool";

export function AnalysContent() {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");

  const handleLoginClick = useCallback(() => {
    setAuthMode("login");
    setShowAuthModal(true);
  }, []);

  const handleRegisterClick = useCallback(() => {
    setAuthMode("register");
    setShowAuthModal(true);
  }, []);

  return (
    <>
      <div className="flex h-screen min-h-0 w-full flex-col overflow-x-hidden bg-background supports-[height:100dvh]:h-dvh">
        <Navbar onLoginClick={handleLoginClick} onRegisterClick={handleRegisterClick} />

        <main className="landing-v2-page relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <SiteBackground />

          <div
            className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain scroll-smooth [-webkit-overflow-scrolling:touch]"
            data-scroll-container
          >
            <section className="px-6 pt-16 pb-8 md:pt-24">
              <div className="mx-auto max-w-3xl text-center">
                <Link
                  href="/"
                  className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  ← Tillbaka till start
                </Link>
                <p className="mb-3 text-xs font-medium tracking-widest text-primary uppercase">
                  Webbplatsanalys
                </p>
                <h1 className="text-balance font-(--font-heading) text-3xl leading-[1.1] tracking-tight text-foreground md:text-5xl">
                  Vad säger er sajt till kunderna — egentligen?
                </h1>
                <p className="text-muted-foreground mx-auto mt-5 max-w-2xl text-pretty text-base leading-relaxed md:text-lg">
                  En genomgång av målgrupp, synlighet, innehåll och konvertering. Inte en
                  säkerhetsrapport. Rapporten är fri att läsa — PDF och bygge kräver konto. En
                  körning per uppkoppling och dygn medan vi testar ytan.
                </p>
              </div>
            </section>

            <AnalysTool onNeedAccount={handleRegisterClick} />

            <section className="mx-auto w-full max-w-3xl px-6 pb-16">
              <p className="text-center text-xs leading-relaxed text-muted-foreground">
                Skiljer sig från inloggade{" "}
                <Link href="/?mode=audit" className="underline-offset-2 hover:underline">
                  Audits
                </Link>{" "}
                i produkten. Vill ni bygga om sidan efter rapporten?{" "}
                <Link href="/skapa-hemsida" className="underline-offset-2 hover:underline">
                  Skapa hemsida
                </Link>
                .
              </p>
            </section>

            <LandingFooter />
          </div>
        </main>
      </div>
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          defaultMode={authMode}
        />
    </>
  );
}
