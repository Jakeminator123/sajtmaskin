"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function CookieBanner() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const consent = localStorage.getItem("cookie-consent");
    if (!consent) {
      const timer = setTimeout(() => setIsVisible(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  if (!isVisible) return null;

  const handleAccept = () => {
    localStorage.setItem("cookie-consent", "accepted");
    localStorage.setItem("cookie-consent-date", new Date().toISOString());
    setIsVisible(false);
  };

  const handleDecline = () => {
    localStorage.setItem("cookie-consent", "declined");
    setIsVisible(false);
  };

  return (
    <div className="animate-in slide-in-from-bottom-4 fixed inset-x-0 bottom-0 z-50 p-4 duration-300">
      <div className="mx-auto flex max-w-lg items-center gap-4 rounded-lg border border-border bg-card p-4 shadow-xl">
        <p className="flex-1 text-xs text-muted-foreground">
          Vi använder cookies för att förbättra din upplevelse.{" "}
          <Link href="/privacy" className="underline transition-colors hover:text-foreground">
            Läs mer
          </Link>
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="ghost" size="sm" onClick={handleDecline} className="text-xs">
            Neka
          </Button>
          <Button size="sm" onClick={handleAccept} className="text-xs">
            Acceptera
          </Button>
        </div>
      </div>
    </div>
  );
}
