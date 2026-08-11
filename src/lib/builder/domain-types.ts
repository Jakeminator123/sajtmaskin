/** Domain search data shared by builder state and its publishing UI. */
export type DomainSearchResult = {
  domain: string;
  available: boolean | null;
  price: number | null;
  currency: string;
  provider: "vercel" | "loopia" | "dns" | "none";
  /** True when price is a per-TLD estimate rather than a registrar quote. */
  priceEstimated?: boolean;
  /** True when the domain can be bought in-app right now. */
  purchasable?: boolean;
  purchaseBlockedReason?: string | null;
  purchaseUrl: string | null;
  error: string | null;
};
