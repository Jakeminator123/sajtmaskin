"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AuthModal } from "@/components/auth/auth-modal";
import { LandingFooter } from "@/components/landing-v2/landing-footer";
import { Navbar } from "@/components/landing-v2/navbar";
import { SiteBackground } from "@/components/layout/site-background";
import { useAuth } from "@/lib/auth/auth-store";

export function ExempelShell({ children }: { children: ReactNode }) {
  const { fetchUser } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");

  useEffect(() => {
    fetchUser().catch(() => {});
  }, [fetchUser]);

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

        <div className="landing-v2-page relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <SiteBackground />

          <div
            className="relative z-10 min-h-0 flex-1 touch-pan-y overflow-x-clip overflow-y-auto overscroll-y-contain scroll-smooth [-webkit-overflow-scrolling:touch]"
            data-scroll-container
          >
            {children}
            <LandingFooter />
          </div>
        </div>
      </div>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        defaultMode={authMode}
      />
    </>
  );
}
