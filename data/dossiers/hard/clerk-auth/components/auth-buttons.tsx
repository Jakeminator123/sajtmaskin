"use client";

import { useEffect, useRef, useState } from "react";
import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";

import { isLikelyValidClerkPublishableKey } from "./clerk-provider-shell";

export interface AuthButtonsProps {
  signInLabel?: string;
  signUpLabel?: string;
  afterSignOutUrl?: string;
  className?: string;
}

/**
 * Header auth controls. Shows sign-in / sign-up CTAs when signed out and a
 * user avatar dropdown when signed in.
 *
 * Demo mode (mock: visual): when the Clerk publishable key is missing or a
 * placeholder, `ClerkProviderShell` does not mount `<ClerkProvider>` — so the
 * Clerk components here would crash. In that state the same buttons render as
 * plain controls that open an honest demo dialog ("Inloggning i demoläge")
 * instead of pretending to authenticate. No fake sessions are ever created.
 * Restyle freely — the key gate, the <SignedIn>/<SignedOut> boundaries and
 * the modal `mode="modal"` props are load-bearing.
 */
export function AuthButtons({
  signInLabel = "Logga in",
  signUpLabel = "Skapa konto",
  afterSignOutUrl = "/",
  className,
}: AuthButtonsProps) {
  const configured = isLikelyValidClerkPublishableKey(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  );
  const [demoOpen, setDemoOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!demoOpen) return;
    closeButtonRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setDemoOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [demoOpen]);

  if (!configured) {
    return (
      <div className={className ?? "flex items-center gap-2"}>
        <button
          type="button"
          onClick={() => setDemoOpen(true)}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent"
        >
          {signInLabel}
        </button>
        <button
          type="button"
          onClick={() => setDemoOpen(true)}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          {signUpLabel}
        </button>
        {demoOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={(event) => {
              if (event.target === event.currentTarget) setDemoOpen(false);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="auth-demo-title"
              className="w-full max-w-md rounded-lg border border-border bg-background p-5 shadow-lg"
            >
              <p id="auth-demo-title" className="text-base font-semibold text-foreground">
                Inloggning i demoläge
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Så här ser inloggningen ut för besökare. Ingen riktig inloggning sker i
                demoläget. Koppla Clerk (env-nycklarna{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
                </code>{" "}
                och{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  CLERK_SECRET_KEY
                </code>
                ) för riktiga konton.
              </p>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setDemoOpen(false)}
                className="mt-4 inline-flex w-full items-center justify-center rounded-md border border-border bg-muted px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/70"
              >
                Stäng
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={className ?? "flex items-center gap-2"}>
      <SignedOut>
        <SignInButton mode="modal">
          <button
            type="button"
            className="rounded-md px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent"
          >
            {signInLabel}
          </button>
        </SignInButton>
        <SignUpButton mode="modal">
          <button
            type="button"
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            {signUpLabel}
          </button>
        </SignUpButton>
      </SignedOut>
      <SignedIn>
        <UserButton
          afterSignOutUrl={afterSignOutUrl}
          appearance={{ elements: { avatarBox: "h-8 w-8" } }}
        />
      </SignedIn>
    </div>
  );
}
