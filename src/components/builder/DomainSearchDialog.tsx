"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ExternalLink, Globe, Loader2, Server } from "lucide-react";

export type DomainSearchResult = {
  domain: string;
  available: boolean | null;
  price: number | null;
  currency: string;
  provider: "vercel" | "loopia" | "dns";
  purchaseUrl: string | null;
  error: string | null;
};

type DomainSearchDialogProps = {
  open: boolean;
  query: string;
  results: DomainSearchResult[] | null;
  isSearching: boolean;
  onQueryChange: (value: string) => void;
  onSearch: () => void;
  onClose: () => void;
};

function ProviderBadge({ provider }: { provider: DomainSearchResult["provider"] }) {
  if (provider === "vercel") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-black/10 px-1.5 py-0.5 text-[10px] font-medium text-foreground/60 dark:bg-white/10">
        <Server className="h-2.5 w-2.5" />
        Vercel
      </span>
    );
  }
  if (provider === "loopia") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
        <Globe className="h-2.5 w-2.5" />
        Loopia
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
      <Globe className="h-2.5 w-2.5" />
      DNS
    </span>
  );
}

export function DomainSearchDialog({
  open,
  query,
  results,
  isSearching,
  onQueryChange,
  onSearch,
  onClose,
}: DomainSearchDialogProps) {
  return (
    <Dialog open={open}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Sök &amp; köp domän</DialogTitle>
          <DialogDescription>
            Sök efter en ledig domän. Svenska domäner (.se/.nu) kontrolleras
            via Loopia, övriga via Vercel.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && onSearch()}
              placeholder="t.ex. mittforetag"
              disabled={isSearching}
            />
            <Button onClick={onSearch} disabled={isSearching || !query.trim()}>
              {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sök"}
            </Button>
          </div>

          {results && (
            <div className="space-y-2">
              {results.map((result) => (
                <div
                  key={result.domain}
                  className={`flex items-center justify-between rounded-md border px-3 py-2.5 text-sm ${
                    result.available === true
                      ? "border-brand-teal/30 bg-brand-teal/5"
                      : result.available === false
                        ? "border-border bg-muted/20 opacity-60"
                        : "border-border bg-muted/10 opacity-80"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        result.available === true
                          ? "bg-brand-teal"
                          : result.available === false
                            ? "bg-red-400"
                            : "bg-amber-400"
                      }`}
                    />
                    <span className="font-medium text-foreground">{result.domain}</span>
                    <ProviderBadge provider={result.provider} />
                  </div>
                  <div className="flex items-center gap-3">
                    {result.available === true ? (
                      <>
                        {result.price != null && (
                          <span className="text-muted-foreground">
                            {result.price} {result.currency}/år
                          </span>
                        )}
                        {result.purchaseUrl ? (
                          <a
                            href={result.purchaseUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-brand-teal hover:text-brand-teal/80"
                          >
                            Köp <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <a
                            href={`mailto:hej@sajtmaskin.se?subject=${encodeURIComponent(`Domänköp: ${result.domain}`)}&body=${encodeURIComponent(`Hej!\n\nJag vill köpa domänen ${result.domain}.\n\nTack!`)}`}
                            className="text-xs font-medium text-brand-teal hover:text-brand-teal/80"
                          >
                            Kontakta oss
                          </a>
                        )}
                      </>
                    ) : result.available === false ? (
                      <span className="text-xs text-red-400">Upptagen</span>
                    ) : (
                      <span className="text-xs text-amber-500">Kunde ej kontrolleras</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-muted-foreground">
              Kontakta <span className="font-medium">hej@sajtmaskin.se</span> för hjälp.
            </p>
            <Button variant="outline" size="sm" onClick={onClose}>
              Stäng
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
