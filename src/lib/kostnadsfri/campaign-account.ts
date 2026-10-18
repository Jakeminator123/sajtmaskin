/**
 * Kampanjkonto (ägarbeslut 2026-10-17, `docs/decisions/README.md`): ett korrekt
 * lösenord från en kostnadsfri-länk loggar in i ett konto som hör till sidan.
 * Samma lösenord når samma konto tills kunden sparar det med egen e-post eller
 * Google; då flyttas projekten och lösenordet slutar logga in.
 *
 * Klientsäker modul: inga server- eller Node-beroenden.
 */

export const KOSTNADSFRI_CAMPAIGN_PROVIDER = "kostnadsfri";
export const KOSTNADSFRI_CAMPAIGN_CLAIMED_PROVIDER = "kostnadsfri_claimed";
export const CAMPAIGN_ACCOUNT_UNCLAIMED_CODE = "campaign_account_unclaimed";

/** Pågående «Spara kontot» i den här webbläsaren, bundet till inbjudans slug. */
export const CAMPAIGN_CLAIM_PENDING_STORAGE_KEY = "sajtmaskin:kampanjkonto-spara";

export type CampaignClaimPending = { slug: string; campaignUserId: string };

function pendingStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readCampaignClaimPending(): CampaignClaimPending | null {
  const storage = pendingStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(CAMPAIGN_CLAIM_PENDING_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CampaignClaimPending>;
    if (
      typeof parsed.slug === "string" &&
      parsed.slug &&
      typeof parsed.campaignUserId === "string" &&
      parsed.campaignUserId
    ) {
      return { slug: parsed.slug, campaignUserId: parsed.campaignUserId };
    }
  } catch {
    // Ogiltig flagga räknas som ingen sparbegäran.
  }
  storage.removeItem(CAMPAIGN_CLAIM_PENDING_STORAGE_KEY);
  return null;
}

export function writeCampaignClaimPending(pending: CampaignClaimPending | null): void {
  const storage = pendingStorage();
  if (!storage) return;
  try {
    if (!pending) storage.removeItem(CAMPAIGN_CLAIM_PENDING_STORAGE_KEY);
    else storage.setItem(CAMPAIGN_CLAIM_PENDING_STORAGE_KEY, JSON.stringify(pending));
  } catch {
    // Privat läge utan storage: serverns biljett avgör fortfarande complete.
  }
}

export function clearCampaignClaimPendingIfSlugDiffers(slug: string): void {
  const pending = readCampaignClaimPending();
  if (pending && pending.slug !== slug) writeCampaignClaimPending(null);
}

/**
 * Vad lösenordssteget gjorde med inloggningen:
 * - `existing`: besökaren var redan inloggad med ett eget konto, som används.
 * - `campaign`: sidans kampanjkonto är nu inloggat.
 * - `claimed`: inbjudan är redan sparad till ett konto; kunden loggar in som vanligt.
 * - `unavailable`: kontot kunde inte skapas (t.ex. databasen nere); vanlig inloggning.
 */
export type CampaignAccountStatus = "existing" | "campaign" | "claimed" | "unavailable";

/** Både osparade och sparade kampanjkonton — inget av dem får betala, publicera eller köpa domän. */
export function isCampaignAccountProvider(provider: string | null | undefined): boolean {
  return (
    provider === KOSTNADSFRI_CAMPAIGN_PROVIDER || provider === KOSTNADSFRI_CAMPAIGN_CLAIMED_PROVIDER
  );
}

export function isUnclaimedCampaignAccount(
  user: { provider?: string | null } | null | undefined,
): boolean {
  return user?.provider === KOSTNADSFRI_CAMPAIGN_PROVIDER;
}

export type CampaignAccountBlockedAction = "publish" | "payment" | "domain";

const BLOCKED_MESSAGES: Record<CampaignAccountBlockedAction, string> = {
  publish: "Spara kontot med din e-post eller Google för att kunna publicera sajten.",
  payment: "Spara kontot med din e-post eller Google innan du köper credits.",
  domain: "Spara kontot med din e-post eller Google innan du köper en domän.",
};

export function campaignAccountBlockedBody(action: CampaignAccountBlockedAction): {
  success: false;
  error: string;
  code: typeof CAMPAIGN_ACCOUNT_UNCLAIMED_CODE;
} {
  return { success: false, error: BLOCKED_MESSAGES[action], code: CAMPAIGN_ACCOUNT_UNCLAIMED_CODE };
}
