"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/layout/navbar";
import { ShaderBackground } from "@/components/layout/shader-background";
import { AuthModal } from "@/components/auth/auth-modal";
import { Skeleton } from "@/components/ui/skeleton";
import { transactionLabel } from "@/lib/konto/account";
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

export default function KontoPage() {
  const [data, setData] = useState<KontoPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch("/api/konto");
        const body = (await response.json().catch(() => null)) as
          | { success?: boolean; error?: string }
          | KontoPayload
          | null;

        if (!response.ok || !body || !("account" in body)) {
          setError(
            (body && "error" in body && body.error) || "Kunde inte hämta kontot.",
          );
          return;
        }

        if (!cancelled) setData(body);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Kunde inte hämta kontot.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="bg-background min-h-screen">
      <ShaderBackground theme="default" speed={0.2} opacity={0.3} />
      <Navbar
        onLoginClick={() => {
          setAuthMode("login");
          setShowAuthModal(true);
        }}
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

        {loading && (
          <div className="space-y-6">
            <Skeleton className="h-32 w-full rounded-none" />
            <Skeleton className="h-32 w-full rounded-none" />
            <Skeleton className="h-48 w-full rounded-none" />
          </div>
        )}

        {!loading && error && (
          <div className="border border-red-500/30 bg-red-500/10 p-4 text-red-400">
            {error}
          </div>
        )}

        {!loading && !error && data && (
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
