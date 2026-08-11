"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  ExternalLink,
  Globe,
  Link2,
  Loader2,
  RefreshCw,
  Search,
  Server,
  ShoppingCart,
} from "lucide-react";
import type { DomainSearchResult } from "@/lib/builder/domain-types";
import { DomainPriceLabel } from "./domain-price-label";

type DnsRecord = {
  type: string;
  host: string;
  value: string;
  ttl: number;
};

type LinkResult = {
  success: boolean;
  linked?: boolean;
  domain: string;
  verified: boolean;
  dnsSetup: { success: boolean; method: string; error?: string } | null;
  dnsInstructions: {
    message: string;
    records: DnsRecord[];
  } | null;
};

type VerifyResult = {
  verified: boolean;
  verification?: Array<{
    type: string;
    domain: string;
    value: string;
    reason: string;
  }>;
};

type DomainManagerStep = "search" | "connect" | "verify" | "purchase";

type DomainOrderStatus = {
  id: string;
  domain: string;
  status: string;
  priceSek: number | null;
  currency: string | null;
  linkedToProject: boolean;
  failureReason: string | null;
};

/**
 * Order states the customer should keep seeing a spinner for. Everything else
 * is terminal and gets a definitive message — a purchase must never leave the
 * customer watching an indeterminate spinner over a real charge.
 */
const IN_FLIGHT_ORDER_STATUSES = new Set(["pending_payment", "paid", "registering"]);

function describeOrderStatus(order: DomainOrderStatus): {
  tone: "pending" | "success" | "error";
  title: string;
  detail: string;
} {
  switch (order.status) {
    case "registered":
      return {
        tone: "success",
        title: `${order.domain} är din`,
        detail: order.linkedToProject
          ? "Domänen är registrerad och kopplad till din sajt. DNS kan ta någon timme att slå igenom."
          : "Domänen är registrerad. Koppla den till din sajt när den är publicerad.",
      };
    case "refunded":
      return {
        tone: "error",
        title: "Köpet gick inte igenom — pengarna är återbetalda",
        detail:
          "Registreringen misslyckades efter betalningen, så beloppet har återbetalats till ditt kort. Du kan försöka igen.",
      };
    case "registration_failed":
      return {
        tone: "error",
        title: "Köpet fastnade",
        detail:
          "Betalningen gick igenom men registreringen misslyckades och kunde inte återbetalas automatiskt. Kontakta oss så löser vi det manuellt.",
      };
    case "expired":
    case "canceled":
      return {
        tone: "error",
        title: "Köpet avbröts",
        detail: "Ingen betalning genomfördes. Domänen är fri att söka på igen.",
      };
    case "paid":
    case "registering":
      return {
        tone: "pending",
        title: "Registrerar domänen",
        detail: "Betalningen är mottagen. Vi registrerar domänen hos registraren nu.",
      };
    default:
      return {
        tone: "pending",
        title: "Väntar på betalning",
        detail: "Slutför betalningen i Stripe-fönstret för att fortsätta.",
      };
  }
}

type DomainManagerProps = {
  open: boolean;
  onClose: () => void;
  /** Engine chat id. The server resolves the correct hosting project from it. */
  chatId: string | null;
  deploymentId?: string | null;
};

function ProviderBadge({ provider }: { provider: DomainSearchResult["provider"] }) {
  if (provider === "vercel") {
    return (
      <Badge variant="secondary" className="gap-1 text-[10px]">
        <Server className="h-2.5 w-2.5" />
        Registrar
      </Badge>
    );
  }
  if (provider === "loopia") {
    return (
      <Badge variant="secondary" className="gap-1 bg-emerald-500/10 text-[10px] text-emerald-700 dark:text-emerald-400">
        <Globe className="h-2.5 w-2.5" />
        Loopia
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-400">
      <Globe className="h-2.5 w-2.5" />
      {provider === "none" ? "Okänd" : "DNS"}
    </Badge>
  );
}

export function DomainManager({ open, onClose, chatId, deploymentId }: DomainManagerProps) {
  const [step, setStep] = useState<DomainManagerStep>("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DomainSearchResult[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedDomain, setSelectedDomain] = useState<DomainSearchResult | null>(null);
  const [isLinking, setIsLinking] = useState(false);
  const [linkResult, setLinkResult] = useState<LinkResult | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [saveWarning, setSaveWarning] = useState<string | null>(null);
  const [verifyStatus, setVerifyStatus] = useState<VerifyResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [orderStatus, setOrderStatus] = useState<DomainOrderStatus | null>(null);
  const verifyIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const orderIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Request-token for the fire-and-forget background save. Bumped on every
  // dialog reset so a slow save from a previous link cannot land after the
  // dialog has been closed/reopened and write a warning onto newer state.
  const saveGenerationRef = useRef(0);
  // Request-token for domain searches. Bumped at the start of every search
  // (and on dialog reset) so that two concurrent searches (e.g. a double
  // click) resolving out of order cannot write stale results / error onto
  // a newer search.
  const searchGenerationRef = useRef(0);

  useEffect(() => {
    if (!open) {
      saveGenerationRef.current += 1;
      searchGenerationRef.current += 1;
      setStep("search");
      setQuery("");
      setResults(null);
      setSearchError(null);
      // Clear the search spinner here too: handleSearch's finally only resets
      // it when the captured generation still matches, so a search in flight
      // when the dialog closes would otherwise leave the Sok button stuck
      // disabled until the component unmounts.
      setIsSearching(false);
      setSelectedDomain(null);
      setIsLinking(false);
      setLinkResult(null);
      setLinkError(null);
      setVerifyError(null);
      setSaveWarning(null);
      setVerifyStatus(null);
      setIsVerifying(false);
      setIsPurchasing(false);
      setPurchaseError(null);
      setOrderStatus(null);
      if (verifyIntervalRef.current) {
        clearInterval(verifyIntervalRef.current);
        verifyIntervalRef.current = null;
      }
      if (orderIntervalRef.current) {
        clearInterval(orderIntervalRef.current);
        orderIntervalRef.current = null;
      }
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (verifyIntervalRef.current) {
        clearInterval(verifyIntervalRef.current);
      }
      if (orderIntervalRef.current) {
        clearInterval(orderIntervalRef.current);
      }
    };
  }, []);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    const gen = ++searchGenerationRef.current;
    setIsSearching(true);
    setResults(null);
    setSearchError(null);
    try {
      const res = await fetch("/api/domains/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim() }),
      });
      const data = await res.json();
      if (searchGenerationRef.current !== gen) return;
      if (!res.ok) throw new Error(data.error || "Sökning misslyckades");
      setResults(data.results ?? []);
    } catch (err) {
      if (searchGenerationRef.current !== gen) return;
      setResults(null);
      setSearchError(err instanceof Error ? err.message : "Sökning misslyckades");
      console.error("[DomainManager] Search error:", err);
    } finally {
      if (searchGenerationRef.current === gen) setIsSearching(false);
    }
  }, [query]);

  const handleSelectDomain = useCallback((domain: DomainSearchResult) => {
    setSelectedDomain(domain);
    setLinkError(null);
    setStep("connect");
  }, []);

  /**
   * Poll one order until it reaches a terminal state.
   *
   * The registrar call happens in the Stripe webhook, not in the browser's
   * request, so the tab that comes back from Stripe genuinely does not know
   * the outcome yet. Polling is what turns "you paid, good luck" into a
   * definite answer.
   */
  const startOrderPolling = useCallback((orderId: string) => {
    if (orderIntervalRef.current) clearInterval(orderIntervalRef.current);

    const poll = async () => {
      try {
        const res = await fetch(
          `/api/domains/purchase?orderId=${encodeURIComponent(orderId)}`,
        );
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.order) return;
        setOrderStatus(data.order as DomainOrderStatus);
        if (!IN_FLIGHT_ORDER_STATUSES.has(data.order.status) && orderIntervalRef.current) {
          clearInterval(orderIntervalRef.current);
          orderIntervalRef.current = null;
        }
      } catch (err) {
        console.error("[DomainManager] Order poll failed:", err);
      }
    };

    void poll();
    orderIntervalRef.current = setInterval(poll, 4000);
  }, []);

  // Coming back from Stripe: the redirect carries the order id, so the dialog
  // resumes on the purchase step instead of dropping the customer on a blank
  // search with no trace of the payment they just made.
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const orderId = new URLSearchParams(window.location.search).get("domainOrder");
    if (!orderId) return;
    setStep("purchase");
    startOrderPolling(orderId);
  }, [open, startOrderPolling]);

  const handlePurchase = useCallback(
    async (domain: string) => {
      if (!chatId) {
        setPurchaseError("Chatten saknas — kan inte köpa domän härifrån.");
        return;
      }
      setIsPurchasing(true);
      setPurchaseError(null);
      try {
        const res = await fetch("/api/domains/purchase", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain, chatId }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.url) {
          throw new Error(data?.error || "Kunde inte starta köpet.");
        }
        window.location.href = data.url as string;
      } catch (err) {
        setPurchaseError(err instanceof Error ? err.message : "Kunde inte starta köpet.");
        setIsPurchasing(false);
      }
    },
    [chatId],
  );

  const startVerifyPolling = useCallback(
    (domain: string) => {
      if (verifyIntervalRef.current) {
        clearInterval(verifyIntervalRef.current);
      }

      const poll = async () => {
        if (!chatId) return;
        setIsVerifying(true);
        try {
          const res = await fetch("/api/domains/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ domain, chatId }),
          });
          const data = await res.json().catch(() => null);
          if (res.status === 409) {
            // Site not published yet — stop polling and surface it clearly.
            setVerifyError(
              "Sajten är inte publicerad ännu. Publicera sajten först för att verifiera domänen.",
            );
            if (verifyIntervalRef.current) {
              clearInterval(verifyIntervalRef.current);
              verifyIntervalRef.current = null;
            }
            return;
          }
          if (res.ok && data) {
            setVerifyError(null);
            setVerifyStatus({ verified: data.verified, verification: data.verification });
            if (data.verified && verifyIntervalRef.current) {
              clearInterval(verifyIntervalRef.current);
              verifyIntervalRef.current = null;
            }
          }
        } catch {
          // polling continues
        } finally {
          setIsVerifying(false);
        }
      };

      void poll();
      verifyIntervalRef.current = setInterval(poll, 10_000);
    },
    [chatId],
  );

  const handleLink = useCallback(async () => {
    if (!selectedDomain || !chatId) return;
    setIsLinking(true);
    setLinkError(null);
    setSaveWarning(null);
    try {
      const res = await fetch("/api/domains/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: selectedDomain.domain,
          chatId,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.status === 409) {
        throw new Error(
          "Sajten är inte publicerad ännu. Publicera sajten först för att koppla en domän.",
        );
      }
      if (!res.ok) throw new Error(data?.error || "Kunde inte koppla domän");
      setLinkResult(data);

      if (deploymentId) {
        // Persist the linked domain on the deployment record. The link
        // itself already succeeded, so a save failure is non-blocking —
        // but it must be surfaced (the domain would otherwise silently
        // not persist on the deployment). Guard against stale writes: if
        // the dialog has been reset (closed/reopened) before the save
        // resolves, the captured generation no longer matches and we drop
        // the warning instead of writing onto a newer verify step.
        const saveGen = saveGenerationRef.current;
        const saveDomain = selectedDomain.domain;
        void (async () => {
          try {
            const saveRes = await fetch("/api/domains/save", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                deploymentId,
                domain: saveDomain,
              }),
            });
            if (saveGenerationRef.current !== saveGen) return;
            if (!saveRes.ok) {
              const saveData = (await saveRes.json().catch(() => null)) as
                | { error?: string }
                | null;
              if (saveGenerationRef.current !== saveGen) return;
              setSaveWarning(
                saveData?.error ||
                  "Domänen kopplades men kunde inte sparas på publiceringen.",
              );
            }
          } catch {
            if (saveGenerationRef.current !== saveGen) return;
            setSaveWarning(
              "Domänen kopplades men kunde inte sparas på publiceringen.",
            );
          }
        })();
      }

      setStep("verify");
      startVerifyPolling(selectedDomain.domain);
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "Okänt fel");
    } finally {
      setIsLinking(false);
    }
  }, [selectedDomain, chatId, deploymentId, startVerifyPolling]);

  const handleManualVerify = useCallback(() => {
    if (!selectedDomain) return;
    startVerifyPolling(selectedDomain.domain);
  }, [selectedDomain, startVerifyPolling]);

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  }, []);

  return (
    <Dialog open={open} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            {step === "search" && "Hitta eller koppla domän"}
            {step === "connect" && "Koppla domän"}
            {step === "verify" && "Verifiera domän"}
            {step === "purchase" && "Domänköp"}
          </DialogTitle>
          <DialogDescription>
            {step === "search" && "Sök efter en domän att koppla till din sajt."}
            {step === "connect" && `Koppla ${selectedDomain?.domain} till ditt projekt.`}
            {step === "verify" && "Verifiera att DNS-inställningarna är korrekta."}
            {step === "purchase" && "Status för ditt domänköp."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Purchase status (returning from Stripe) */}
          {step === "purchase" && (
            <div className="border-border rounded-lg border p-4">
              {orderStatus ? (
                (() => {
                  const described = describeOrderStatus(orderStatus);
                  return (
                    <>
                      <div className="flex items-start gap-2">
                        {described.tone === "pending" && (
                          <Loader2 className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0 animate-spin" />
                        )}
                        {described.tone === "success" && (
                          <CheckCircle2 className="text-brand-teal mt-0.5 h-4 w-4 shrink-0" />
                        )}
                        {described.tone === "error" && (
                          <span className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-red-400" />
                        )}
                        <div>
                          <p className="font-semibold">{described.title}</p>
                          <p className="text-muted-foreground mt-1 text-sm">
                            {described.detail}
                          </p>
                        </div>
                      </div>
                      {orderStatus.priceSek != null && (
                        <p className="text-muted-foreground mt-3 text-xs">
                          {orderStatus.domain} · {orderStatus.priceSek}{" "}
                          {orderStatus.currency ?? "SEK"}/år
                        </p>
                      )}
                    </>
                  );
                })()
              ) : (
                <div className="text-muted-foreground flex items-center gap-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Hämtar status för ditt köp...
                </div>
              )}
              <Separator className="my-3" />
              <Button variant="outline" className="w-full" onClick={() => setStep("search")}>
                <ArrowLeft className="mr-1 h-3.5 w-3.5" />
                Tillbaka till domänsök
              </Button>
            </div>
          )}

          {/* Step 1: Search */}
          {step === "search" && (
            <>
              <div className="flex gap-2">
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder="t.ex. mittforetag.se"
                  disabled={isSearching}
                />
                <Button onClick={handleSearch} disabled={isSearching || !query.trim()}>
                  {isSearching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  <span className="ml-1.5">Sök</span>
                </Button>
              </div>

              {searchError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400">
                  {searchError}
                </div>
              )}

              {results && results.length > 0 && (
                <div className="space-y-1.5">
                  {results.map((r) => (
                    <div
                      key={r.domain}
                      className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                        r.available === true
                          ? "border-brand-teal/30 bg-brand-teal/5 hover:bg-brand-teal/10"
                          : r.available === false
                            ? "border-border bg-muted/20 opacity-60"
                            : "border-border bg-muted/10 opacity-80"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-block h-2 w-2 rounded-full ${
                            r.available === true
                              ? "bg-brand-teal"
                              : r.available === false
                                ? "bg-red-400"
                                : "bg-amber-400"
                          }`}
                        />
                        <span className="font-medium">{r.domain}</span>
                        <ProviderBadge provider={r.provider} />
                      </div>
                      <div className="flex items-center gap-2">
                        {r.available === true && (
                          <>
                            <DomainPriceLabel result={r} />
                            {r.purchasable && (
                              <Button
                                size="sm"
                                onClick={() => handlePurchase(r.domain)}
                                disabled={isPurchasing || !chatId}
                                className="h-7 text-xs"
                              >
                                {isPurchasing ? (
                                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                ) : (
                                  <ShoppingCart className="mr-1 h-3 w-3" />
                                )}
                                Köp
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleSelectDomain(r)}
                              className="h-7 text-xs"
                            >
                              <Link2 className="mr-1 h-3 w-3" />
                              Koppla
                            </Button>
                          </>
                        )}
                        {r.available === false && (
                          <span className="text-xs text-red-400">Upptagen</span>
                        )}
                        {r.available === null && (
                          <span className="text-xs text-amber-500">Okänt</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {purchaseError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400">
                  {purchaseError}
                </div>
              )}

              {results && results.length === 0 && (
                <p className="text-muted-foreground text-center text-sm">
                  Inga resultat hittades.
                </p>
              )}
            </>
          )}

          {/* Step 2: Connect */}
          {step === "connect" && selectedDomain && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep("search")}
                className="mb-2"
              >
                <ArrowLeft className="mr-1 h-3.5 w-3.5" />
                Tillbaka
              </Button>

              <div className="border-border rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{selectedDomain.domain}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <ProviderBadge provider={selectedDomain.provider} />
                      <DomainPriceLabel result={selectedDomain} />
                    </div>
                  </div>
                  {selectedDomain.available === true && (
                    <Badge variant="outline" className="text-brand-teal border-brand-teal/30">
                      Ledig
                    </Badge>
                  )}
                </div>

                {selectedDomain.available === true && selectedDomain.purchasable && (
                  <>
                    <Separator className="my-3" />
                    <p className="text-muted-foreground text-xs">
                      Domänen är ledig och behöver köpas först. Du betalar med kort och vi
                      registrerar den åt dig.
                    </p>
                    {purchaseError && (
                      <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400">
                        {purchaseError}
                      </div>
                    )}
                    <Button
                      onClick={() => handlePurchase(selectedDomain.domain)}
                      disabled={isPurchasing || !chatId}
                      className="mt-2 w-full"
                    >
                      {isPurchasing ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <ShoppingCart className="mr-2 h-4 w-4" />
                      )}
                      Köp {selectedDomain.domain}
                      {selectedDomain.price != null ? ` — ${selectedDomain.price} kr/år` : ""}
                    </Button>
                  </>
                )}

                {selectedDomain.available === true && !selectedDomain.purchasable && (
                  <>
                    <Separator className="my-3" />
                    <p className="text-muted-foreground text-xs">
                      {selectedDomain.purchaseBlockedReason === "no_binding_price"
                        ? "Vi har inget bindande pris för den här domänen, så den går inte att köpa här. Priset ovan är en uppskattning."
                        : "Den här domänen går inte att köpa via Sajtmaskin ännu."}
                      {" Köp den hos en registrar och koppla den sedan här."}
                    </p>
                    {selectedDomain.purchaseUrl && (
                      <a
                        href={selectedDomain.purchaseUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-teal hover:text-brand-teal/80 mt-2 inline-flex items-center gap-1 text-sm font-medium"
                      >
                        Köp hos registrar <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </>
                )}

                <Separator className="my-3" />

                <p className="text-muted-foreground mb-3 text-sm">
                  Kopplar domänen till din publicerade sajt och konfigurerar DNS automatiskt
                  {selectedDomain.provider === "loopia" && " via Loopia"}.
                </p>

                {linkError && (
                  <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400">
                    {linkError}
                  </div>
                )}

                <Button
                  onClick={handleLink}
                  disabled={isLinking || !chatId}
                  className="w-full"
                >
                  {isLinking ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Link2 className="mr-2 h-4 w-4" />
                  )}
                  Koppla {selectedDomain.domain}
                </Button>

                {!chatId && (
                  <p className="text-muted-foreground mt-2 text-center text-xs">
                    Publicera sajten först för att kunna koppla domän.
                  </p>
                )}
              </div>
            </>
          )}

          {/* Step 3: Verify */}
          {step === "verify" && selectedDomain && (
            <>
              <div className="border-border rounded-lg border p-4">
                <div className="flex items-center gap-3">
                  {verifyStatus?.verified ? (
                    <CheckCircle2 className="h-6 w-6 shrink-0 text-green-500" />
                  ) : (
                    <RefreshCw
                      className={`h-6 w-6 shrink-0 text-amber-500 ${isVerifying ? "animate-spin" : ""}`}
                    />
                  )}
                  <div>
                    <p className="font-semibold">{selectedDomain.domain}</p>
                    <p className={`text-sm ${verifyStatus?.verified ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}`}>
                      {verifyStatus?.verified
                        ? "Verifierad! Domänen är klar."
                        : "Väntar på DNS-propagering..."}
                    </p>
                    {verifyStatus?.verified ? (
                      <p className="text-muted-foreground mt-1 text-xs">
                        Den är nu sajtens publika adress. Publicera igen om SEO
                        är aktiverat, så sitemap och metadata byter domän.
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>

              {verifyError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400">
                  {verifyError}
                </div>
              )}

              {saveWarning && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-400">
                  {saveWarning}
                </div>
              )}

              {linkResult?.dnsSetup?.success && (
                <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm dark:border-green-900 dark:bg-green-950/50">
                  <p className="font-medium text-green-700 dark:text-green-400">
                    DNS konfigurerades automatiskt via {linkResult.dnsSetup.method === "loopia" ? "Loopia" : "hostingleverantören"}.
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Det kan ta upp till 48 timmar för DNS att propagera, men vanligtvis går det snabbare.
                  </p>
                </div>
              )}

              {linkResult?.dnsSetup && !linkResult.dnsSetup.success && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-400">
                  Domänen kopplades men automatisk DNS-konfiguration misslyckades.
                  {linkResult.dnsSetup.error ? ` ${linkResult.dnsSetup.error}` : ""}
                  {linkResult.dnsInstructions
                    ? " Konfigurera DNS manuellt enligt instruktionerna nedan."
                    : ""}
                </div>
              )}

              {linkResult?.dnsInstructions && (
                <div className="space-y-3">
                  <p className="text-muted-foreground text-sm">
                    {linkResult.dnsInstructions.message}
                  </p>
                  <div className="border-border rounded-lg border">
                    <div className="bg-muted/50 grid grid-cols-4 gap-2 rounded-t-lg border-b px-3 py-2 text-xs font-medium">
                      <span>Typ</span>
                      <span>Namn</span>
                      <span className="col-span-2">Värde</span>
                    </div>
                    {linkResult.dnsInstructions.records.map((record, i) => (
                      <div
                        key={i}
                        className="border-border grid grid-cols-4 gap-2 border-b px-3 py-2.5 text-xs last:border-b-0"
                      >
                        <Badge variant="outline" className="w-fit text-[10px]">
                          {record.type}
                        </Badge>
                        <span className="text-muted-foreground font-mono">{record.host}</span>
                        <div className="col-span-2 flex items-center gap-1">
                          <span className="text-muted-foreground truncate font-mono">
                            {record.value}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(record.value)}
                            className="text-muted-foreground hover:text-foreground shrink-0"
                            title="Kopiera"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!verifyStatus?.verified && (
                <Button
                  variant="outline"
                  onClick={handleManualVerify}
                  disabled={isVerifying}
                  className="w-full"
                >
                  {isVerifying ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Kontrollera igen
                </Button>
              )}

              {verifyStatus?.verified && (
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={onClose}>
                    Klar
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      window.open(
                        `https://${selectedDomain.domain}`,
                        "_blank",
                        "noopener,noreferrer",
                      )
                    }
                  >
                    Besök <ExternalLink className="ml-1 h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </>
          )}

          {/* Footer */}
          {step === "search" && (
            <div className="flex items-center justify-between pt-1">
              <p className="text-muted-foreground text-xs">
                Kontakta <span className="font-medium">hej@sajtmaskin.se</span> för hjälp.
              </p>
              <Button variant="outline" size="sm" onClick={onClose}>
                Stäng
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
