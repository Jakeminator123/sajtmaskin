"use client";

import type { DomainSearchResult } from "./DomainSearchDialog";

type PriceFields = Pick<DomainSearchResult, "price" | "currency" | "priceEstimated">;

/**
 * Renders a domain price and, crucially, says when it is only an estimate.
 *
 * A reference figure and a registrar quote used to render identically, so a
 * `.se` always showed the same number whether or not anything had actually
 * priced it. "ca" plus the tooltip is the smallest honest signal; the purchase
 * path enforces the same distinction by refusing to charge an estimate.
 */
export function DomainPriceLabel({
  result,
  className = "text-muted-foreground text-xs",
}: {
  result: PriceFields;
  className?: string;
}) {
  if (result.price == null) {
    return (
      <span className={className} title="Ingen prisuppgift från registraren.">
        Pris okänt
      </span>
    );
  }
  const estimated = result.priceEstimated === true;
  return (
    <span
      className={className}
      title={
        estimated
          ? "Uppskattat riktpris för toppdomänen — ingen registrar har prissatt just den här domänen."
          : "Pris från registraren."
      }
    >
      {estimated ? "ca " : ""}
      {result.price} {result.currency}/år
    </span>
  );
}
