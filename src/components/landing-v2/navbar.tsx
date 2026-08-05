"use client";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/auth-store";
import { isAdminEmailClient } from "@/lib/auth/is-admin-client";
import { LogOut, Menu, ShieldCheck, X } from "lucide-react";
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
  const { isAuthenticated, isInitialized, logout, user } = useAuth();
  const router = useRouter();
  // Presentation only — /admin is gated server-side (src/proxy.ts + the admin
  // layout). This just means an admin doesn't have to type the URL.
  const showAdminLink = isInitialized && isAuthenticated && isAdminEmailClient(user?.email);

  useEffect(() => {
    const handleScroll = () => {
      const el = document.querySelector("[data-scroll-container]");
      if (el) setScrolled(el.scrollTop > 20);
    };
    const el = document.querySelector("[data-scroll-container]");
    el?.addEventListener("scroll", handleScroll, { passive: true });
    return () => el?.removeEventListener("scroll", handleScroll);
  }, []);

  // Marketing-sektioner bor på egna routes (samma mönster som /teknik), så
  // startsidan kan vara en enda viewport utan scroll.
  const navLinks = [
    { href: "/teknik", label: "Teknik" },
    { href: "/hur-det-fungerar", label: "Hur det fungerar" },
    { href: "/priser", label: "Priser" },
    { href: "/faq", label: "FAQ" },
  ];

  const handlePrimaryClick = () => {
    if (isInitialized && isAuthenticated) {
      router.push("/builder");
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
      className={`relative z-20 grid grid-cols-[1fr_auto] items-center gap-3 px-6 py-3.5 border-b transition-all duration-300 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] ${
        scrolled
          ? "border-border/40 bg-background/80 backdrop-blur-xl"
          : "border-border/20 bg-background/30 backdrop-blur-md"
      }`}
    >
      <Link
        href="/"
        className="justify-self-start flex shrink-0 items-center gap-1 rounded-lg outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary/40"
        aria-label="SajtMaskin — till startsidan"
      >
        <AnimatedLogo className="text-lg font-semibold text-foreground" />
        <span className="hidden sm:inline-flex text-[10px] font-medium uppercase tracking-wider text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full ml-1.5">
          Beta
        </span>
      </Link>

      {/* Center column: position is independent of logo width (3-col grid). */}
      <div className="hidden lg:flex items-center justify-center gap-1 justify-self-center">
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-lg hover:bg-secondary/40"
          >
            {link.label}
          </Link>
        ))}
      </div>

      <div className="hidden lg:flex items-center justify-end gap-3 justify-self-end">
        {!isInitialized ? (
          // Auth-hydration (backlog /logg-internet fynd #22): rendera inte
          // gäst-CTA:erna ("Logga in"/"Kom igång gratis") innan auth-state är
          // läst — inloggade användare såg dem flimra i ~1 render. Skeletons
          // håller platsen tills isInitialized.
          <>
            <div className="h-9 w-24 rounded-lg bg-secondary/30 animate-pulse" aria-hidden />
            <div className="h-9 w-36 rounded-lg bg-secondary/30 animate-pulse" aria-hidden />
          </>
        ) : (
          <>
            {showAdminLink && (
              <Button
                asChild
                variant="ghost"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                <Link href="/admin">
                  <ShieldCheck className="w-4 h-4 mr-1.5" />
                  Admin
                </Link>
              </Button>
            )}
            {isAuthenticated && (
              <Button
                variant="ghost"
                className="text-sm text-muted-foreground hover:text-foreground"
                onClick={handleLogout}
              >
                <LogOut className="w-4 h-4 mr-1.5" />
                Logga ut
              </Button>
            )}
            <Button
              variant="ghost"
              className="text-sm text-muted-foreground hover:text-foreground"
              onClick={handleLoginOrProjectsClick}
            >
              {isAuthenticated ? "Mina projekt" : "Logga in"}
            </Button>
            <Button
              className="btn-3d btn-glow text-sm bg-primary text-primary-foreground hover:bg-primary/90 font-medium shadow-lg shadow-primary/20"
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
        className="lg:hidden text-foreground"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label={mobileOpen ? "Stäng meny" : "Öppna meny"}
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </Button>

      {mobileOpen && (
        <div className="absolute top-full left-0 right-0 z-50 border-b border-border/30 bg-background/95 backdrop-blur-xl p-6 flex flex-col gap-1 lg:hidden animate-fade-up">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-3 rounded-lg hover:bg-secondary/40"
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <div className="flex flex-col gap-2 pt-4 mt-2 border-t border-border/30">
            {!isInitialized ? (
              // Samma auth-hydration-guard som desktop-CTA:erna ovan.
              <>
                <div className="h-10 w-full rounded-lg bg-secondary/30 animate-pulse" aria-hidden />
                <div className="h-10 w-full rounded-lg bg-secondary/30 animate-pulse" aria-hidden />
              </>
            ) : (
              <>
                {showAdminLink && (
                  <Button
                    asChild
                    variant="ghost"
                    className="justify-start text-sm text-muted-foreground hover:text-foreground"
                  >
                    <Link href="/admin" onClick={() => setMobileOpen(false)}>
                      <ShieldCheck className="w-4 h-4 mr-1.5" />
                      Admin
                    </Link>
                  </Button>
                )}
                {isAuthenticated && (
                  <Button
                    variant="ghost"
                    className="justify-start text-sm text-muted-foreground hover:text-foreground"
                    onClick={handleLogout}
                  >
                    <LogOut className="w-4 h-4 mr-1.5" />
                    Logga ut
                  </Button>
                )}
                <Button
                  variant="ghost"
                  className="justify-start text-sm text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setMobileOpen(false);
                    handleLoginOrProjectsClick();
                  }}
                >
                  {isAuthenticated ? "Mina projekt" : "Logga in"}
                </Button>
                <Button
                  className="btn-3d btn-glow text-sm bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
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
