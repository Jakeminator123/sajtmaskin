"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Lightbulb, Loader2, RefreshCw, X } from "lucide-react";

type TipCardProps = {
  open: boolean;
  isLoading: boolean;
  tip: string | null;
  error: string | null;
  cost: number | null;
  onRefresh: () => void;
  onClose: () => void;
};

export function TipCard({
  open,
  isLoading,
  tip,
  error,
  cost,
  onRefresh,
  onClose,
}: TipCardProps) {
  if (!open) return null;
  const showUiLocationHint = Boolean(
    tip && /(sidan|panelen|fliken|dialogen|vyn|launch readiness|kodvy|elementregister|preview)/i.test(tip),
  );

  return (
    <div className="pointer-events-none absolute top-3 right-3 z-30 w-88 max-w-[calc(100%-1.5rem)]">
      <Card className="pointer-events-auto border-yellow-500/30 shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Lightbulb className="h-4 w-4 text-yellow-500" />
            AI-tips
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onClose}
            title="Stäng tips"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-3 p-3 pt-0">
          {isLoading ? (
            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Hämtar korta tips...
            </div>
          ) : error ? (
            <p className="text-sm text-red-500">{error}</p>
          ) : tip ? (
            <p className="text-sm whitespace-pre-wrap">{tip}</p>
          ) : (
            <p className="text-muted-foreground text-sm">
              Inga tips ännu.
            </p>
          )}

          {showUiLocationHint && (
            <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-2 py-1.5 text-xs text-yellow-100">
              Om tipset pekar på en UI-yta ska den finnas synligt i buildern. Annars: gör ändringen i
              <span className="font-medium"> den genererade sidan/koden</span> eller i en synlig vy som
              Preview, Kodvy, Elementregister eller Launch readiness.
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground text-xs">
              {cost ? `Kostnad: ${cost} credits` : "Kostnad: 2 credits/tips"}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={isLoading}
              title="Hämta nytt tips"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Nytt tips
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
