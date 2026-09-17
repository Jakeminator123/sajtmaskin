"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { AuthModal } from "@/components/auth/auth-modal";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/auth/auth-store";
import {
  BUILDER_AUTH_REQUIRED_EVENT,
  builderAuthStorage,
  type BuilderAuthRequiredDetail,
} from "@/lib/auth/builder-auth-events";
import { consumeBuilderAuthDraft, isBuilderAuthResume } from "@/lib/auth/builder-auth-draft";
import { FILL_CHAT_INPUT_EVENT } from "@/lib/builder/fill-chat-input";

/**
 * Verify the app session before mounting builder data/auto-start effects.
 * After entry, keep the builder mounted even if the session expires: a login
 * overlay must never throw away the draft, attachments, or selected version.
 */
export function BuilderAuthGate({ children }: { children: ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const fetchUser = useAuthStore((state) => state.fetchUser);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [entered, setEntered] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [requested, setRequested] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [returnTo, setReturnTo] = useState<string | undefined>();
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);
  const restoreAttemptedRef = useRef(false);
  const entryHrefRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    entryHrefRef.current = window.location.href;
    setReturnTo(`${window.location.pathname}${window.location.search}${window.location.hash}`);
    // Persisted Zustand user data is only a display cache, not session proof.
    void fetchUser().catch(() => {
      useAuthStore.getState().setUser(null);
    }).finally(() => {
      if (active) setSessionChecked(true);
    });
    return () => { active = false; };
  }, [fetchUser]);

  useEffect(() => {
    const onAuthRequired = (event: Event) => {
      const detail = (event as CustomEvent<BuilderAuthRequiredDetail>).detail;
      setReturnTo(detail?.returnTo);
      setRequested(true);
      setDismissed(false);
      setMode("login");
    };
    window.addEventListener(BUILDER_AUTH_REQUIRED_EVENT, onAuthRequired);
    return () => window.removeEventListener(BUILDER_AUTH_REQUIRED_EVENT, onAuthRequired);
  }, []);

  useEffect(() => {
    if (!sessionChecked || !user) return;
    setEntered(true);
    setRequested(false);
    setDismissed(false);
  }, [sessionChecked, user]);

  useEffect(() => {
    if (!entered || !user || restoreAttemptedRef.current) return;
    // Prompt hydration may remove promptId before the composer mounts.
    // Recovery is bound to the authenticated entry URL, not that cleaned URL.
    const entryHref = entryHrefRef.current;
    if (!entryHref || !isBuilderAuthResume(entryHref)) return;
    // Let the newly mounted composer's passive input listener attach first.
    const timer = window.setTimeout(() => {
      restoreAttemptedRef.current = true;
      const message = consumeBuilderAuthDraft(builderAuthStorage(), entryHref, user.id);
      if (message) {
        window.dispatchEvent(new CustomEvent(FILL_CHAT_INPUT_EVENT, { detail: { text: message } }));
        setRecoveryNotice("Ditt utkast är återställt. Kontrollera text och eventuella bilagor och tryck Skicka när du är redo.");
      } else {
        setRecoveryNotice("Du är inloggad. Kontrollera utkastet innan du skickar; något sparat inloggningsutkast kunde inte återställas.");
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [entered, user]);

  const showLogin = sessionChecked && (requested || (!user && !entered && !dismissed));
  return (
    <>
      {entered ? children : (
        <main className="bg-muted/30 flex min-h-screen items-center justify-center p-6">
          {!sessionChecked ? (
            <div role="status" className="text-center">
              <Loader2 className="text-primary mx-auto h-8 w-8 animate-spin" />
              <p className="mt-4">Kontrollerar inloggningen…</p>
            </div>
          ) : (
            <section className="max-w-md space-y-4 text-center">
              <h1 className="text-2xl font-semibold">Logga in för att bygga din hemsida</h1>
              <p>Logga in eller skapa ett konto för att fortsätta. Du kommer tillbaka till samma projekt eller företagsinbjudan.</p>
              <Button onClick={() => { setMode("login"); setDismissed(false); }}>Logga in</Button>
              <Button variant="outline" onClick={() => { setMode("register"); setDismissed(false); }}>Skapa konto</Button>
            </section>
          )}
        </main>
      )}
      {recoveryNotice && (
        <div role="status" className="bg-card text-foreground fixed bottom-4 left-4 z-50 max-w-md rounded-lg border p-4 shadow-lg">
          <p>{recoveryNotice}</p>
          <Button variant="ghost" onClick={() => setRecoveryNotice(null)}>Stäng</Button>
        </div>
      )}
      <AuthModal
        isOpen={showLogin}
        defaultMode={mode}
        returnTo={returnTo}
        onClose={() => { setRequested(false); setDismissed(true); }}
      />
    </>
  );
}
