"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/layout/navbar";
import { ShaderBackground } from "@/components/layout/shader-background";
import { AuthModal } from "@/components/auth/auth-modal";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthStore } from "@/lib/auth/auth-store";
import {
  KONTO_HISTORY_DEFAULT_LIMIT,
  KONTO_LOAD_OLDER_LABEL,
  KONTO_SIGNED_OUT_TITLE,
  kontoOlderHistoryNotice,
  mergeKontoTransactions,
  shouldApplyKontoResponse,
  transactionLabel,
} from "@/lib/konto/account";
import { ArrowRight, Coins, FolderOpen, User } from "lucide-react";

type KontoTransaction = {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  description: string | null;
  createdAt: string;
};

type KontoPayload = {
  account: {
    name: string | null;
    email: string;
    loginMethod: string;
  };
  credits: {
    balance: number;
  };
  transactions: KontoTransaction[];
  hasMore?: boolean;
  limit?: number;
  offset?: number;
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Ogiltigt datum";
  return date.toLocaleDateString("sv-SE", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatAmount(amount: number): string {
  const sign = amount > 0 ? "+" : "";
  return `${sign}${amount}`;
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="border border-gray-800 bg-black/50 p-5">
      <h2 className="text-sm font-semibold tracking-wide text-gray-300 uppercase">{title}</h2>
      {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function readKontoError(body: { error?: string } | KontoPayload | null): string {
  if (body && "error" in body && body.error) return body.error;
  return "Kunde inte hämta kontot.";
}

export default function KontoPage() {
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const [data, setData] = useState<KontoPayload | null>(null);
  const [loading, setLoading] = useState(Boolean(userId));
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [pageLimit, setPageLimit] = useState(KONTO_HISTORY_DEFAULT_LIMIT);
  const [pageOffset, setPageOffset] = useState(0);
  const [sessionMissing, setSessionMissing] = useState(!userId);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const requestGeneration = useRef(0);
  const sessionMissingRef = useRef(!userId);

  function markSessionMissing() {
    sessionMissingRef.current = true;
    setSessionMissing(true);
  }

  useEffect(() => {
    return useAuthStore.subscribe((state, previous) => {
      if (!sessionMissingRef.current) return;
      if (!state.user?.id || state.user === previous.user) return;
      // Re-login writes the same id; the fetch effect must still run.
      sessionMissingRef.current = false;
      setRefreshNonce((value) => value + 1);
    });
  }, []);

  useEffect(() => {
    const generation = ++requestGeneration.current;
    const controller = new AbortController();

    if (!userId) {
      setData(null);
      setError(null);
      setHistoryError(null);
      setHasMore(false);
      setPageOffset(0);
      setLoading(false);
      setLoadingMore(false);
      markSessionMissing();
      return () => controller.abort();
    }

    setData(null);
    setError(null);
    setHistoryError(null);
    setHasMore(false);
    setPageOffset(0);
    sessionMissingRef.current = false;
    setSessionMissing(false);
    setLoading(true);

    const requestUserId = userId;

    async function load() {
      try {
        const response = await fetch("/api/konto", { signal: controller.signal });
        const body = (await response.json().catch(() => null)) as
          | { success?: boolean; error?: string }
          | KontoPayload
          | null;

        if (generation !== requestGeneration.current) return;
        if (!shouldApplyKontoResponse(requestUserId, useAuthStore.getState().user?.id ?? null)) {
          return;
        }

        if (response.status === 401) {
          setData(null);
          setError(null);
          setHasMore(false);
          markSessionMissing();
          return;
        }

        if (!response.ok || !body || !("account" in body)) {
          setData(null);
          setError(readKontoError(body));
          return;
        }

        setData(body);
        setHasMore(Boolean(body.hasMore));
        setPageLimit(
          typeof body.limit === "number" ? body.limit : KONTO_HISTORY_DEFAULT_LIMIT,
        );
        setPageOffset(typeof body.offset === "number" ? body.offset : 0);
      } catch (err: unknown) {
        if (isAbortError(err) || generation !== requestGeneration.current) return;
        if (!shouldApplyKontoResponse(requestUserId, useAuthStore.getState().user?.id ?? null)) {
          return;
        }
        setData(null);
        setError(err instanceof Error ? err.message : "Kunde inte hämta kontot.");
      } finally {
        if (
          generation === requestGeneration.current &&
          shouldApplyKontoResponse(requestUserId, useAuthStore.getState().user?.id ?? null)
        ) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      controller.abort();
    };
  }, [userId, refreshNonce]);

  async function loadOlder() {
    if (!userId || loadingMore || !hasMore) return;
    const requestUserId = userId;
    const generation = requestGeneration.current;
    setLoadingMore(true);
    setHistoryError(null);
    try {
      const params = new URLSearchParams({
        offset: String(pageOffset + pageLimit),
        limit: String(pageLimit),
      });
      const response = await fetch(`/api/konto?${params.toString()}`);
      const body = (await response.json().catch(() => null)) as
        | { success?: boolean; error?: string }
        | KontoPayload
        | null;

      if (generation !== requestGeneration.current) return;
      if (!shouldApplyKontoResponse(requestUserId, useAuthStore.getState().user?.id ?? null)) {
        return;
      }

      if (response.status === 401) {
        setData(null);
        setError(null);
        setHistoryError(null);
        setHasMore(false);
        markSessionMissing();
        return;
      }

      if (!response.ok || !body || !("account" in body)) {
        setHistoryError(readKontoError(body));
        return;
      }

      setData((previous) =>
        previous
          ? {
              ...body,
              transactions: mergeKontoTransactions(previous.transactions, body.transactions),
            }
          : body,
      );
      setHasMore(Boolean(body.hasMore));
      setPageLimit(
        typeof body.limit === "number" ? body.limit : KONTO_HISTORY_DEFAULT_LIMIT,
      );
      setPageOffset(typeof body.offset === "number" ? body.offset : pageOffset + pageLimit);
    } catch (err: unknown) {
      if (isAbortError(err) || generation !== requestGeneration.current) return;
      if (!shouldApplyKontoResponse(requestUserId, useAuthStore.getState().user?.id ?? null)) {
        return;
      }
      setHistoryError(err instanceof Error ? err.message : "Kunde inte hämta kontot.");
    } finally {
      if (generation === requestGeneration.current) setLoadingMore(false);
    }
  }

  function openLogin() {
    setAuthMode("login");
    setShowAuthModal(true);
  }

  const showSignedOut = !userId || sessionMissing;

  return (
    <div className="bg-background min-h-screen">
      <ShaderBackground theme="default" speed={0.2} opacity={0.3} />
      <Navbar
        onLoginClick={openLogin}
        onRegisterClick={() => {
          setAuthMode("register");
          setShowAuthModal(true);
        }}
      />
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        defaultMode={authMode}
      />

      <div className="relative z-10 mx-auto max-w-4xl px-6 pt-24 pb-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Konto</h1>
          <p className="mt-1 text-gray-400">Dina uppgifter, credits och köphistorik.</p>
        </div>

        {showSignedOut && (
          <div className="py-20 text-center">
            <User className="mx-auto mb-4 h-16 w-16 text-gray-600" />
            <h2 className="mb-2 text-xl font-semibold text-gray-300">{KONTO_SIGNED_OUT_TITLE}</h2>
            <p className="mb-6 text-gray-500">
              Dina uppgifter, credits och köphistorik kopplas till ditt konto.
            </p>
            <Button className="bg-brand-teal hover:bg-brand-teal/90" onClick={openLogin}>
              Logga in
            </Button>
          </div>
        )}

        {!showSignedOut && loading && (
          <div className="space-y-6">
            <Skeleton className="h-32 w-full rounded-none" />
            <Skeleton className="h-32 w-full rounded-none" />
            <Skeleton className="h-48 w-full rounded-none" />
          </div>
        )}

        {!showSignedOut && !loading && error && (
          <div className="border border-red-500/30 bg-red-500/10 p-4 text-red-400">
            {error}
          </div>
        )}

        {!showSignedOut && !loading && !error && data && (
          <div className="space-y-6">
            <Section title="Konto">
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-gray-500">Namn</dt>
                  <dd className="flex items-center gap-2 text-gray-200">
                    <User className="h-4 w-4 text-gray-500" />
                    {data.account.name || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">E-post</dt>
                  <dd className="text-gray-200">{data.account.email}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Inloggningsmetod</dt>
                  <dd className="text-gray-200">{data.account.loginMethod}</dd>
                </div>
              </dl>
            </Section>

            <Section title="Credits">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Coins className="text-brand-amber h-5 w-5" />
                  <span className="text-brand-amber text-2xl font-semibold">
                    {data.credits.balance}
                  </span>
                  <span className="text-sm text-gray-500">credits</span>
                </div>
                <Link href="/buy-credits">
                  <Button className="bg-brand-teal hover:bg-brand-teal/90 gap-2">
                    Köp credits
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </Section>

            <Section title="Köphistorik">
              {data.transactions.length === 0 ? (
                <p className="text-sm text-gray-500">Inga transaktioner än.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-800 text-gray-500">
                        <th className="py-2 pr-4 font-medium">Datum</th>
                        <th className="py-2 pr-4 font-medium">Beskrivning</th>
                        <th className="py-2 pr-4 text-right font-medium">Ändring</th>
                        <th className="py-2 text-right font-medium">Saldo efter</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.transactions.map((row) => (
                        <tr key={row.id} className="border-b border-gray-800/80">
                          <td className="py-2.5 pr-4 whitespace-nowrap text-gray-400">
                            {formatDate(row.createdAt)}
                          </td>
                          <td className="py-2.5 pr-4 text-gray-200">
                            {transactionLabel(row)}
                          </td>
                          <td
                            className={`py-2.5 pr-4 text-right font-medium ${
                              row.amount >= 0 ? "text-brand-teal" : "text-gray-300"
                            }`}
                          >
                            {formatAmount(row.amount)}
                          </td>
                          <td className="py-2.5 text-right text-gray-400">{row.balanceAfter}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {hasMore && (
                <div className="mt-4 space-y-3">
                  <p className="text-sm text-gray-500">
                    {kontoOlderHistoryNotice(data.transactions.length)}
                  </p>
                  {historyError && (
                    <p className="text-sm text-red-400" role="alert">
                      {historyError}
                    </p>
                  )}
                  <Button
                    variant="outline"
                    disabled={loadingMore}
                    onClick={() => {
                      void loadOlder();
                    }}
                  >
                    {loadingMore ? "Hämtar…" : historyError ? "Försök igen" : KONTO_LOAD_OLDER_LABEL}
                  </Button>
                </div>
              )}
            </Section>

            <Section title="Mina sajter">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="text-sm text-gray-400">
                  Dina projekt och publicerade sajter ligger under Projekt.
                </p>
                <Link href="/projects">
                  <Button variant="outline" className="gap-2">
                    <FolderOpen className="h-4 w-4" />
                    Mina sajter
                  </Button>
                </Link>
              </div>
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}
