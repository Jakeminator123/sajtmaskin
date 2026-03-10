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
  XCircle,
} from "lucide-react";
import type { DomainSearchResult } from "./DomainSearchDialog";

type DnsRecord = {
  type: string;
  host: string;
  value: string;
  ttl: number;
};

type LinkResult = {
  success: boolean;
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

type DomainManagerStep = "search" | "connect" | "verify";

type DomainManagerProps = {
  open: boolean;
  onClose: () => void;
  projectId: string | null;
  deploymentId?: string | null;
};

function ProviderBadge({ provider }: { provider: DomainSearchResult["provider"] }) {
  if (provider === "vercel") {
    return (
      <Badge variant="secondary" className="gap-1 text-[10px]">
        <Server className="h-2.5 w-2.5" />
        Vercel
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
      DNS
    </Badge>
  );
}

export function DomainManager({ open, onClose, projectId, deploymentId }: DomainManagerProps) {
  const [step, setStep] = useState<DomainManagerStep>("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DomainSearchResult[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState<DomainSearchResult | null>(null);
  const [isLinking, setIsLinking] = useState(false);
  const [linkResult, setLinkResult] = useState<LinkResult | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [verifyStatus, setVerifyStatus] = useState<VerifyResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const verifyIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!open) {
      setStep("search");
      setQuery("");
      setResults(null);
      setSelectedDomain(null);
      setIsLinking(false);
      setLinkResult(null);
      setLinkError(null);
      setVerifyStatus(null);
      setIsVerifying(false);
      if (verifyIntervalRef.current) {
        clearInterval(verifyIntervalRef.current);
        verifyIntervalRef.current = null;
      }
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (verifyIntervalRef.current) {
        clearInterval(verifyIntervalRef.current);
      }
    };
  }, []);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setIsSearching(true);
    setResults(null);
    try {
      const res = await fetch("/api/domains/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sökning misslyckades");
      setResults(data.results ?? []);
    } catch (err) {
      setResults([]);
      console.error("[DomainManager] Search error:", err);
    } finally {
      setIsSearching(false);
    }
  }, [query]);

  const handleSelectDomain = useCallback((domain: DomainSearchResult) => {
    setSelectedDomain(domain);
    setLinkError(null);
    setStep("connect");
  }, []);

  const startVerifyPolling = useCallback(
    (domain: string) => {
      if (verifyIntervalRef.current) {
        clearInterval(verifyIntervalRef.current);
      }

      const poll = async () => {
        if (!projectId) return;
        setIsVerifying(true);
        try {
          const res = await fetch("/api/domains/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ domain, projectId }),
          });
          const data = await res.json();
          if (res.ok) {
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
    [projectId],
  );

  const handleLink = useCallback(async () => {
    if (!selectedDomain || !projectId) return;
    setIsLinking(true);
    setLinkError(null);
    try {
      const res = await fetch("/api/domains/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: selectedDomain.domain,
          projectId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kunde inte koppla domän");
      setLinkResult(data);

      if (deploymentId) {
        fetch("/api/domains/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deploymentId,
            domain: selectedDomain.domain,
          }),
        }).catch(() => {});
      }

      setStep("verify");
      startVerifyPolling(selectedDomain.domain);
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "Okänt fel");
    } finally {
      setIsLinking(false);
    }
  }, [selectedDomain, projectId, deploymentId, startVerifyPolling]);

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
            {step === "search" && "Koppla egen domän"}
            {step === "connect" && "Koppla domän"}
            {step === "verify" && "Verifiera domän"}
          </DialogTitle>
          <DialogDescription>
            {step === "search" && "Sök efter en domän att koppla till din sajt."}
            {step === "connect" && `Koppla ${selectedDomain?.domain} till ditt projekt.`}
            {step === "verify" && "Verifiera att DNS-inställningarna är korrekta."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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
                            {r.price != null && (
                              <span className="text-muted-foreground text-xs">
                                {r.price} {r.currency}/år
                              </span>
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
                      {selectedDomain.price != null && (
                        <span className="text-muted-foreground text-xs">
                          {selectedDomain.price} {selectedDomain.currency}/år
                        </span>
                      )}
                    </div>
                  </div>
                  {selectedDomain.available === true && (
                    <Badge variant="outline" className="text-brand-teal border-brand-teal/30">
                      Ledig
                    </Badge>
                  )}
                </div>

                {selectedDomain.purchaseUrl && (
                  <>
                    <Separator className="my-3" />
                    <p className="text-muted-foreground text-xs">
                      Domänen behöver köpas först. Klicka nedan för att köpa, sedan kan du koppla den.
                    </p>
                    <a
                      href={selectedDomain.purchaseUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-teal hover:text-brand-teal/80 mt-2 inline-flex items-center gap-1 text-sm font-medium"
                    >
                      Köp domän <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </>
                )}

                <Separator className="my-3" />

                <p className="text-muted-foreground mb-3 text-sm">
                  Kopplar domänen till ditt Vercel-projekt och konfigurerar DNS automatiskt
                  {selectedDomain.provider === "loopia" && " via Loopia"}.
                </p>

                {linkError && (
                  <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400">
                    {linkError}
                  </div>
                )}

                <Button
                  onClick={handleLink}
                  disabled={isLinking || !projectId}
                  className="w-full"
                >
                  {isLinking ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Link2 className="mr-2 h-4 w-4" />
                  )}
                  Koppla {selectedDomain.domain}
                </Button>

                {!projectId && (
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
                  </div>
                </div>
              </div>

              {linkResult?.dnsSetup?.success && (
                <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm dark:border-green-900 dark:bg-green-950/50">
                  <p className="font-medium text-green-700 dark:text-green-400">
                    DNS konfigurerades automatiskt via {linkResult.dnsSetup.method === "loopia" ? "Loopia" : "Vercel"}.
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Det kan ta upp till 48 timmar för DNS att propagera, men vanligtvis går det snabbare.
                  </p>
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
                    onClick={() => window.open(`https://${selectedDomain.domain}`, "_blank")}
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
