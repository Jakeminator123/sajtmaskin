"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import { AuthModal } from "@/components/auth/auth-modal";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/auth/auth-store";
import { currentBuilderReturnTo } from "@/lib/builder/pending-builder-draft";
import {
  CAMPAIGN_CLAIM_PENDING_STORAGE_KEY,
  isCampaignAccountProvider,
  isUnclaimedCampaignAccount,
} from "@/lib/kostnadsfri/campaign-account";

function readClaimPending(): boolean {
  try {
    return window.localStorage.getItem(CAMPAIGN_CLAIM_PENDING_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeClaimPending(pending: boolean): void {
  try {
    if (pending) window.localStorage.setItem(CAMPAIGN_CLAIM_PENDING_STORAGE_KEY, "1");
    else window.localStorage.removeItem(CAMPAIGN_CLAIM_PENDING_STORAGE_KEY);
  } catch {
    // Privat läge utan storage: sparandet slutförs inte automatiskt, banner finns kvar.
  }
}

async function postClaim(action: "start" | "complete"): Promise<{ ok: boolean; error?: string }> {
  const response = await fetch("/api/kostnadsfri/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  return { ok: response.ok, error: data?.error };
}

/**
 * «Spara kontot» för ett kampanjkonto i buildern. `start` sätter serverns
 * biljett; efter inloggningen (e-post, registrering + verifiering eller Google)
 * flyttar `complete` projekten till kundens eget konto. Renderar inget för
 * vanliga konton utan pågående sparande.
 */
export function CampaignAccountBanner() {
  const user = useAuthStore((state) => state.user);
  const fetchUser = useAuthStore((state) => state.fetchUser);
  const { mutate } = useSWRConfig();
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("register");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const completingRef = useRef(false);

  useEffect(() => {
    if (!user || isCampaignAccountProvider(user.provider) || completingRef.current) return;
    if (!readClaimPending()) return;
    completingRef.current = true;
    void (async () => {
      try {
        const result = await postClaim("complete");
        if (result.ok) {
          toast.success("Kontot är sparat. Sajten finns nu på ditt konto.");
          void mutate(() => true);
          void fetchUser();
        } else {
          toast.error(result.error ?? "Kontot kunde inte sparas.");
        }
      } catch {
        toast.error("Kontot kunde inte sparas.");
      } finally {
        writeClaimPending(false);
      }
    })();
  }, [user, fetchUser, mutate]);

  if (!isUnclaimedCampaignAccount(user) || dismissed) return null;

  const handleStart = async () => {
    setStarting(true);
    setError(null);
    try {
      const result = await postClaim("start");
      if (!result.ok) {
        setError(result.error ?? "Kunde inte starta sparandet.");
        return;
      }
      // Den som redan registrerat sig och verifierat mejlet ska bara logga in.
      setAuthMode(readClaimPending() ? "login" : "register");
      writeClaimPending(true);
      setAuthOpen(true);
    } catch {
      setError("Kunde inte ansluta. Försök igen.");
    } finally {
      setStarting(false);
    }
  };

  return (
    <>
      <div
        role="region"
        aria-label="Spara kontot"
        className="border-border bg-card flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2.5"
      >
        <p className="text-card-foreground min-w-0 flex-1 text-sm">
          Ni bygger med kontot från inbjudan. Spara det med er e-post eller Google för att kunna
          publicera sajten.
        </p>
        {error ? (
          <p role="alert" className="text-destructive text-xs">
            {error}
          </p>
        ) : null}
        <div className="flex shrink-0 gap-2">
          <Button size="sm" onClick={() => void handleStart()} disabled={starting}>
            Spara kontot
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
            Senare
          </Button>
        </div>
      </div>
      <AuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        defaultMode={authMode}
        returnTo={currentBuilderReturnTo()}
      />
    </>
  );
}
