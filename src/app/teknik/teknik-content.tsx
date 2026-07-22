"use client";

import { useCallback, useState } from "react";
import { useHashScroll } from "@/components/landing-v2/landing-hooks";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AuthModal } from "@/components/auth/auth-modal";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/landing-v2/navbar";
import { LandingFooter } from "@/components/landing-v2/landing-footer";
import { LandingTechSections } from "@/components/landing-v2/landing-tech-sections";
import { SiteBackground } from "@/components/layout/site-background";

export function TeknikContent() {
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

  // Sections live inside the inner [data-scroll-container], which Next's
  // built-in hash handling never scrolls — resolve #funktioner/#teknik here.
  useHashScroll();

  return (
    <>
      <div className="flex h-screen min-h-0 w-full flex-col overflow-x-hidden bg-background supports-[height:100dvh]:h-dvh md:overflow-hidden">
        <Navbar onLoginClick={handleLoginClick} onRegisterClick={handleRegisterClick} />

        <main className="landing-v2-page relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <SiteBackground />

          <div
            className="relative z-10 flex min-h-0 flex-1 touch-pan-y flex-col overflow-y-auto overscroll-y-contain scroll-smooth [-webkit-overflow-scrolling:touch]"
            data-scroll-container
          >
            {/* Intro hero */}
            <section className="px-6 pt-16 pb-6 md:pt-24 text-center">
              <div className="max-w-3xl mx-auto">
                <Link
                  href="/"
                  className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  &larr; Tillbaka till start
                </Link>
                <p className="text-xs font-medium text-primary tracking-widest uppercase mb-3">
                  Teknik
                </p>
                <h1 className="text-3xl md:text-5xl text-foreground mb-4 font-(--font-heading) tracking-tight text-balance leading-[1.1]">
                  Tekniken bakom varje sajt
                </h1>
                <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed text-pretty">
                  Produktionsklar kod, m&auml;tbar prestanda och en modern stack &mdash; samma
                  grund som de b&auml;sta digitala bolagen bygger p&aring;. H&auml;r &auml;r
                  detaljerna, s&aring; startsidan kan h&aring;llas stram.
                </p>
                <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
                  <Button
                    size="lg"
                    className="btn-3d btn-glow bg-primary text-primary-foreground hover:bg-primary/90 font-medium text-base px-8 shadow-lg shadow-primary/25"
                    onClick={handleRegisterClick}
                  >
                    Kom ig&aring;ng gratis
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                  <Button
                    asChild
                    size="lg"
                    variant="ghost"
                    className="text-muted-foreground hover:text-foreground text-base"
                  >
                    <Link href="/templates">Se mallar</Link>
                  </Button>
                </div>
              </div>
            </section>

            <LandingTechSections />

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
