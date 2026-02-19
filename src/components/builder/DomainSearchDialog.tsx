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
import { Loader2 } from "lucide-react";

export type DomainSearchResult = {
  domain: string;
  available: boolean;
  price: number;
  currency: string;
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
            Sök efter en ledig domän för ditt projekt. Priser visas i SEK per år.
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
                    result.available
                      ? "border-brand-teal/30 bg-brand-teal/5"
                      : "border-border bg-muted/20 opacity-60"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${result.available ? "bg-brand-teal" : "bg-red-400"}`}
                    />
                    <span className="font-medium text-foreground">{result.domain}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {result.available ? (
                      <>
                        <span className="text-muted-foreground">
                          {result.price} {result.currency}/år
                        </span>
                        <a
                          href={`mailto:jakob.olof.eberg@gmail.com,erik@sajtstudio.se?subject=${encodeURIComponent(`Domänköp: ${result.domain}`)}&body=${encodeURIComponent(`Hej!\n\nJag vill köpa domänen ${result.domain} (${result.price} ${result.currency}/år) via SajtMaskin.\n\nTack!`)}`}
                          className="text-xs font-medium text-brand-teal hover:text-brand-teal/80"
                        >
                          Köp →
                        </a>
                      </>
                    ) : (
                      <span className="text-xs text-red-400">Upptagen</span>
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
