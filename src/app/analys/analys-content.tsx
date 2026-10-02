"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { AuthModal } from "@/components/auth/auth-modal";
import { AuditPdfReport } from "@/components/audit/AuditPdfReport";
import { Navbar } from "@/components/landing-v2/navbar";
import { LandingFooter } from "@/components/landing-v2/landing-footer";
import { SiteBackground } from "@/components/layout/site-background";
import { AnalysTool, type PublicAnalysResult } from "@/components/analys/analys-tool";
import { useAuthStore } from "@/lib/auth/auth-store";
import {
  claimPendingPublicAnalys,
  clearPendingPublicAnalys,
  readPendingPublicAnalys,
  savePendingPublicAnalys,
  type PendingPublicAnalys,
  type PublicAnalysAction,
} from "@/lib/audit/public-analys-resume";
import { extractPublicAnalysHandoffPayload } from "@/lib/builder/audit-handoff";
import { createAuditBuildHandoff } from "@/lib/builder/audit-handoff-client";
import { DEFAULT_BUILD_INTENT } from "@/lib/builder/build-intent";

function verificationErrorMessage(reason: string | null): string {
  if (reason === "missing_token") return "Verifieringslänken saknar token.";
  if (reason === "invalid_or_expired") {
    return "Verifieringslänken är ogiltig eller har gått ut.";
  }
  if (reason === "server_error") return "Något gick fel vid e-postverifiering.";
  return "Kunde inte verifiera e-postadressen.";
}

export function AnalysContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fetchUser = useAuthStore((state) => state.fetchUser);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [pendingAction, setPendingAction] = useState<PublicAnalysAction | null>(null);
  const [restoredResult, setRestoredResult] = useState<PublicAnalysResult | null>(null);
  const [pdfResult, setPdfResult] = useState<PublicAnalysResult | null>(null);
  const continuationInFlightRef = useRef(false);
  const authCheckInFlightRef = useRef(false);
  const autoResumeStartedRef = useRef(false);
  const intentGenerationRef = useRef(0);
  const verificationFeedbackHandledRef = useRef<string | null>(null);

  const resumeParam = searchParams.get("resume");
  const verifiedParam = searchParams.get("verified");
  const verificationReason = searchParams.get("reason");
  const resumeAction: PublicAnalysAction | null =
    resumeParam === "pdf" || resumeParam === "build" ? resumeParam : null;

  const handleLoginClick = useCallback(() => {
    setAuthMode("login");
    setShowAuthModal(true);
  }, []);

  const handleRegisterClick = useCallback(() => {
    setAuthMode("register");
    setShowAuthModal(true);
  }, []);

  const clearResumeQuery = useCallback(() => {
    router.replace("/analys", { scroll: false });
  }, [router]);

  const clearVerificationFeedback = useCallback(() => {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("verified");
    nextParams.delete("reason");
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `/analys?${nextQuery}` : "/analys", { scroll: false });
  }, [router, searchParams]);

  const disarmPendingIntent = useCallback(() => {
    intentGenerationRef.current += 1;
    authCheckInFlightRef.current = false;
    setPendingAction(null);
  }, []);

  const handleAuthModalClose = useCallback(() => {
    disarmPendingIntent();
    setShowAuthModal(false);
    clearResumeQuery();
  }, [clearResumeQuery, disarmPendingIntent]);

  const handleAnalysisSuccess = useCallback(
    (result: PublicAnalysResult) => {
      disarmPendingIntent();
      setShowAuthModal(false);
      setRestoredResult(result);
      void clearPendingPublicAnalys();
      if (resumeAction || verifiedParam) clearResumeQuery();
    },
    [clearResumeQuery, disarmPendingIntent, resumeAction, verifiedParam],
  );

  const runClaimedAction = useCallback(
    async (pending: PendingPublicAnalys) => {
      if (continuationInFlightRef.current) return;
      continuationInFlightRef.current = true;
      setShowAuthModal(false);
      setPendingAction(null);
      setRestoredResult({ report: pending.report, auditedUrl: pending.auditedUrl });
      clearResumeQuery();

      try {
        if (pending.action === "pdf") {
          setPdfResult({ report: pending.report, auditedUrl: pending.auditedUrl });
          return;
        }

        const payload = extractPublicAnalysHandoffPayload(
          pending.report,
          pending.auditedUrl,
        );
        const handoff = await createAuditBuildHandoff(payload, DEFAULT_BUILD_INTENT);
        router.push(handoff.href);
      } catch (error) {
        await savePendingPublicAnalys({
          action: pending.action,
          report: pending.report,
          auditedUrl: pending.auditedUrl,
        });
        toast.error(
          error instanceof Error ? error.message : "Kunde inte förbereda bygget. Försök igen.",
        );
      } finally {
        continuationInFlightRef.current = false;
      }
    },
    [clearResumeQuery, router],
  );

  const claimAndRun = useCallback(
    async (action: PublicAnalysAction) => {
      const claimed = await claimPendingPublicAnalys(action);
      if (claimed) await runClaimedAction(claimed);
    },
    [runClaimedAction],
  );

  const handleProtectedAction = useCallback(
    async (action: PublicAnalysAction, result: PublicAnalysResult) => {
      if (authCheckInFlightRef.current || continuationInFlightRef.current) return;
      const intentGeneration = ++intentGenerationRef.current;
      const saved = await savePendingPublicAnalys({
        action,
        report: result.report,
        auditedUrl: result.auditedUrl,
      });
      if (intentGeneration !== intentGenerationRef.current) return;
      if (!saved) {
        toast.error("Kunde inte spara rapporten för fortsatt inloggning. Försök igen.");
        return;
      }

      setPendingAction(action);
      setRestoredResult({ report: saved.report, auditedUrl: saved.auditedUrl });
      authCheckInFlightRef.current = true;
      try {
        await fetchUser();
        if (intentGeneration !== intentGenerationRef.current) return;
        if (useAuthStore.getState().user) {
          await claimAndRun(action);
        } else {
          setAuthMode("register");
          setShowAuthModal(true);
        }
      } finally {
        authCheckInFlightRef.current = false;
      }
    },
    [claimAndRun, fetchUser],
  );

  useEffect(() => {
    const pending = readPendingPublicAnalys();
    if (pending) {
      setRestoredResult({ report: pending.report, auditedUrl: pending.auditedUrl });
    }

    const verificationKey = `${verifiedParam ?? ""}:${verificationReason ?? ""}:${resumeParam ?? ""}`;
    if (verifiedParam === "error") {
      if (verificationFeedbackHandledRef.current !== verificationKey) {
        verificationFeedbackHandledRef.current = verificationKey;
        toast.error(verificationErrorMessage(verificationReason));
        disarmPendingIntent();
        setShowAuthModal(false);
        clearResumeQuery();
      }
      return;
    }
    if (
      verifiedParam === "success" &&
      verificationFeedbackHandledRef.current !== verificationKey
    ) {
      verificationFeedbackHandledRef.current = verificationKey;
      toast.success("E-postadressen är verifierad. Logga in för att fortsätta.");
      clearVerificationFeedback();
    }

    if (!resumeAction || !pending || pending.action !== resumeAction) return;
    setPendingAction(resumeAction);
    if (autoResumeStartedRef.current) return;
    autoResumeStartedRef.current = true;
    const intentGeneration = ++intentGenerationRef.current;

    let active = true;
    void fetchUser()
      .then(async () => {
        if (!active || intentGeneration !== intentGenerationRef.current) return;
        if (useAuthStore.getState().user) {
          await claimAndRun(resumeAction);
        } else {
          setAuthMode("login");
          setShowAuthModal(true);
        }
      })
      .finally(() => {
        if (active) autoResumeStartedRef.current = false;
      });

    return () => {
      active = false;
      autoResumeStartedRef.current = false;
    };
  }, [
    claimAndRun,
    clearResumeQuery,
    clearVerificationFeedback,
    disarmPendingIntent,
    fetchUser,
    resumeAction,
    resumeParam,
    verificationReason,
    verifiedParam,
  ]);

  const handleInlineLoginSuccess = useCallback(async () => {
    if (pendingAction) await claimAndRun(pendingAction);
  }, [claimAndRun, pendingAction]);

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

            <AnalysTool
              restoredResult={restoredResult}
              onPdf={(result) => void handleProtectedAction("pdf", result)}
              onBuild={(result) => void handleProtectedAction("build", result)}
              onAnalysisSuccess={handleAnalysisSuccess}
            />

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
        onClose={handleAuthModalClose}
        defaultMode={authMode}
        returnTo={pendingAction ? `/analys?resume=${pendingAction}` : undefined}
        onSuccess={handleInlineLoginSuccess}
      />
      {pdfResult ? (
        <AuditPdfReport
          publicReport={pdfResult.report}
          auditedUrl={pdfResult.auditedUrl}
          onClose={() => setPdfResult(null)}
        />
      ) : null}
    </>
  );
}
