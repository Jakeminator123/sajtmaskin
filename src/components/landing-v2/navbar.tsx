"use client";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/auth-store";
import { LogOut, Menu, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatedLogo } from "./animated-logo";

interface NavbarProps {
  onLoginClick?: () => void;
  onRegisterClick?: () => void;
}

export function Navbar({ onLoginClick, onRegisterClick }: NavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { isAuthenticated, isInitialized, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const handleScroll = () => {
      const el = document.querySelector("[data-scroll-container]");
      if (el) setScrolled(el.scrollTop > 20);
    };
    const el = document.querySelector("[data-scroll-container]");
    el?.addEventListener("scroll", handleScroll, { passive: true });
    return () => el?.removeEventListener("scroll", handleScroll);
  }, []);

  // "Funktioner" borttagen — features bor numera på /teknik (slimmare, mer
  // företagsriktad nav). Sektionsankare använder absolut "/#…" så de fungerar
  // även från andra sidor än startsidan (t.ex. /teknik).
  const navLinks = [
    { href: "/teknik", label: "Teknik" },
    { href: "/#hur-det-fungerar", label: "Hur det fungerar" },
    { href: "/#priser", label: "Priser" },
    { href: "/faq", label: "FAQ" },
  ];

  const handlePrimaryClick = () => {
    if (isInitialized && isAuthenticated) {
      router.push("/builder?new=1");
      return;
    }
    onRegisterClick?.();
  };

  const handleLoginOrProjectsClick = () => {
    if (isInitialized && isAuthenticated) {
      router.push("/projects");
      return;
    }
    onLoginClick?.();
  };

  const handleLogout = () => {
    logout();
    setMobileOpen(false);
    router.push("/");
  };

  return (
    <nav
      className={`relative z-20 flex items-center justify-between border-b px-6 py-3.5 transition-all duration-300 ${
        scrolled
          ? "border-border/40 bg-background/80 backdrop-blur-xl"
          : "border-border/20 bg-background/30 backdrop-blur-md"
      }`}
    >
      <div className="flex items-center gap-1">
        <AnimatedLogo className="text-foreground text-lg font-semibold" />
        <span className="text-primary bg-primary/10 border-primary/20 ml-1.5 hidden rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wider uppercase sm:inline-flex">
          Beta
        </span>
      </div>

      <div className="hidden items-center gap-1 lg:flex">
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="text-muted-foreground hover:text-foreground hover:bg-secondary/40 rounded-lg px-3 py-2 text-sm transition-colors"
          >
            {link.label}
          </Link>
        ))}
      </div>

      <div className="hidden items-center gap-3 lg:flex">
        {!isInitialized ? (
          // Auth-hydration (backlog /logg-internet fynd #22): rendera inte
          // gäst-CTA:erna ("Logga in"/"Kom igång gratis") innan auth-state är
          // läst — inloggade användare såg dem flimra i ~1 render. Skeletons
          // håller platsen tills isInitialized.
          <>
            <div className="bg-secondary/30 h-9 w-24 animate-pulse rounded-lg" aria-hidden />
            <div className="bg-secondary/30 h-9 w-36 animate-pulse rounded-lg" aria-hidden />
          </>
        ) : (
          <>
            {isAuthenticated && (
              <Button
                variant="ghost"
                className="text-muted-foreground hover:text-foreground text-sm"
                onClick={handleLogout}
              >
                <LogOut className="mr-1.5 h-4 w-4" />
                Logga ut
              </Button>
            )}
            <Button
              variant="ghost"
              className="text-muted-foreground hover:text-foreground text-sm"
              onClick={handleLoginOrProjectsClick}
            >
              {isAuthenticated ? "Mina projekt" : "Logga in"}
            </Button>
            <Button
              className="btn-3d btn-glow bg-primary text-primary-foreground hover:bg-primary/90 shadow-primary/20 text-sm font-medium shadow-lg"
              onClick={handlePrimaryClick}
            >
              {isAuthenticated ? "Öppna builder" : "Kom igång gratis"}
            </Button>
          </>
        )}
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="text-foreground lg:hidden"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label={mobileOpen ? "Stäng meny" : "Öppna meny"}
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {mobileOpen && (
        <div className="border-border/30 bg-background/95 animate-fade-up absolute top-full right-0 left-0 z-50 flex flex-col gap-1 border-b p-6 backdrop-blur-xl lg:hidden">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-muted-foreground hover:text-foreground hover:bg-secondary/40 rounded-lg px-3 py-3 text-sm transition-colors"
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <div className="border-border/30 mt-2 flex flex-col gap-2 border-t pt-4">
            {!isInitialized ? (
              // Samma auth-hydration-guard som desktop-CTA:erna ovan.
              <>
                <div className="bg-secondary/30 h-10 w-full animate-pulse rounded-lg" aria-hidden />
                <div className="bg-secondary/30 h-10 w-full animate-pulse rounded-lg" aria-hidden />
              </>
            ) : (
              <>
                {isAuthenticated && (
                  <Button
                    variant="ghost"
                    className="text-muted-foreground hover:text-foreground justify-start text-sm"
                    onClick={handleLogout}
                  >
                    <LogOut className="mr-1.5 h-4 w-4" />
                    Logga ut
                  </Button>
                )}
                <Button
                  variant="ghost"
                  className="text-muted-foreground hover:text-foreground justify-start text-sm"
                  onClick={() => {
                    setMobileOpen(false);
                    handleLoginOrProjectsClick();
                  }}
                >
                  {isAuthenticated ? "Mina projekt" : "Logga in"}
                </Button>
                <Button
                  className="btn-3d btn-glow bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium"
                  onClick={() => {
                    setMobileOpen(false);
                    handlePrimaryClick();
                  }}
                >
                  {isAuthenticated ? "Öppna builder" : "Kom igång gratis"}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
