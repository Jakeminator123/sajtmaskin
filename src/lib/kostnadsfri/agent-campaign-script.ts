/**
 * Kampanjmanus för Sajtagenten: inledning, hoppa-över, rådgivningskvot
 * och triggern som öppnar takeover vid handoff.
 *
 * Kvoten är fem rådgivningsrundor i hennes chatt — inte genereringar.
 * Förmånen förblir en init plus en uppföljning. Ägarbeslut 2026-09-15.
 */
import {
  normalizeKostnadsfriAgentBrief,
  type KostnadsfriAgentBrief,
} from "./agent-brief";
import { kostnadsfriFollowupDirectiveLines } from "./agent-followups";

export const KOSTNADSFRI_ADVICE_ROUND_LIMIT = 5;

export const KOSTNADSFRI_HANDOFF_INTRO_ID = "oc-kampanj-inledning";
export const KOSTNADSFRI_BUILD_STARTED_ID = "oc-kampanj-bygge-startat";
export const KOSTNADSFRI_FOLLOWUP_SKIP_ID = "oc-kampanj-hoppa-over";

const STORAGE_PREFIX = "sajtmaskin:kampanj-manus:";
const ACTIVE_SLUG_KEY = "sajtmaskin:kampanj-manus:active-slug";

const KOSTNADSFRI_PATH = /^\/kostnadsfri\/([^/]+)/;

export interface KostnadsfriCampaignScriptState {
  slug: string;
  remaining: number;
  followupsSkipped: boolean;
  handoffOpened: boolean;
  buildStartedAnnounced: boolean;
}

export interface KostnadsfriCampaignClientContext {
  followupsSkipped: boolean;
  remaining: number;
  buildStarted: boolean;
}

export type CampaignScriptStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
};

const memoryStorage = new Map<string, string>();

function fallbackStorage(): CampaignScriptStorage {
  return {
    getItem: (key) => memoryStorage.get(key) ?? null,
    setItem: (key, value) => {
      memoryStorage.set(key, value);
    },
    removeItem: (key) => {
      memoryStorage.delete(key);
    },
  };
}

export function campaignScriptStorage(): CampaignScriptStorage {
  if (typeof sessionStorage === "undefined") return fallbackStorage();
  try {
    sessionStorage.getItem(ACTIVE_SLUG_KEY);
    return sessionStorage;
  } catch {
    return fallbackStorage();
  }
}

export function emptyCampaignScript(slug: string): KostnadsfriCampaignScriptState {
  return {
    slug,
    remaining: KOSTNADSFRI_ADVICE_ROUND_LIMIT,
    followupsSkipped: false,
    handoffOpened: false,
    buildStartedAnnounced: false,
  };
}

function clampRemaining(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return KOSTNADSFRI_ADVICE_ROUND_LIMIT;
  }
  return Math.max(0, Math.min(KOSTNADSFRI_ADVICE_ROUND_LIMIT, Math.floor(value)));
}

export function readCampaignScript(
  slug: string,
  storage: CampaignScriptStorage = campaignScriptStorage(),
): KostnadsfriCampaignScriptState {
  const fallback = emptyCampaignScript(slug);
  try {
    const raw = storage.getItem(`${STORAGE_PREFIX}${slug}`);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<KostnadsfriCampaignScriptState>;
    return {
      slug,
      remaining: clampRemaining(parsed.remaining),
      followupsSkipped: parsed.followupsSkipped === true,
      handoffOpened: parsed.handoffOpened === true,
      buildStartedAnnounced: parsed.buildStartedAnnounced === true,
    };
  } catch {
    return fallback;
  }
}

export function writeCampaignScript(
  state: KostnadsfriCampaignScriptState,
  storage: CampaignScriptStorage = campaignScriptStorage(),
): void {
  try {
    storage.setItem(`${STORAGE_PREFIX}${state.slug}`, JSON.stringify(state));
    storage.setItem(ACTIVE_SLUG_KEY, state.slug);
  } catch {
    /* privat läge / full kvot — kvoten lever kvar i storet den här sessionen */
  }
}

export function readActiveCampaignSlug(
  storage: CampaignScriptStorage = campaignScriptStorage(),
): string | null {
  try {
    const slug = storage.getItem(ACTIVE_SLUG_KEY)?.trim();
    return slug || null;
  } catch {
    return null;
  }
}

export function clearCampaignScriptStorageForTests(
  storage: CampaignScriptStorage = campaignScriptStorage(),
): void {
  memoryStorage.clear();
  const slug = readActiveCampaignSlug(storage);
  if (slug) storage.removeItem?.(`${STORAGE_PREFIX}${slug}`);
  storage.removeItem?.(ACTIVE_SLUG_KEY);
}

export function consumeAdviceRound(
  state: KostnadsfriCampaignScriptState,
): { state: KostnadsfriCampaignScriptState; result: "ok" | "exhausted" } {
  if (state.remaining <= 0) return { state, result: "exhausted" };
  return {
    state: { ...state, remaining: state.remaining - 1 },
    result: "ok",
  };
}

export function markHandoffOpened(
  state: KostnadsfriCampaignScriptState,
): KostnadsfriCampaignScriptState {
  return { ...state, handoffOpened: true };
}

export function markFollowupsSkipped(
  state: KostnadsfriCampaignScriptState,
): KostnadsfriCampaignScriptState {
  return { ...state, followupsSkipped: true };
}

export function markBuildStartedAnnounced(
  state: KostnadsfriCampaignScriptState,
): KostnadsfriCampaignScriptState {
  return { ...state, buildStartedAnnounced: true };
}

export function kostnadsfriSlugFromPathname(pathname: string): string | null {
  const match = pathname.match(KOSTNADSFRI_PATH);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function buildKostnadsfriHandoffIntro(brief: Pick<
  KostnadsfriAgentBrief,
  "contactFirstName" | "companyName"
>): string {
  const name = brief.contactFirstName?.trim();
  const company = brief.companyName.trim();
  const welcome = name && company ? `Välkommen ${name} och ${company}.` : `Välkommen ${company}.`;
  return (
    `${welcome} Utifrån den relativt knapphändiga information jag har om er ` +
    `skulle jag vilja ställa några uppföljningsfrågor så att sajten blir så bra som möjligt. ` +
    `Du kan prata in svaren eller skriva dem i chatten under min skärmbild.`
  );
}

export const KOSTNADSFRI_FOLLOWUP_SKIP_LABEL = "Hoppa över frågorna";

export const KOSTNADSFRI_FOLLOWUP_SKIP_HINT =
  "Svaren är frivilliga och blockerar inget.";

export const KOSTNADSFRI_FOLLOWUP_SKIP_ACK =
  "Okej, då hoppar vi över frågorna. Skriv eller prata om du vill ha mer hjälp.";

export const KOSTNADSFRI_ADVICE_EXHAUSTED_COPY =
  "Jag har gett den hjälp jag kan i den här rådgivningen. Fortsätt gärna i vanliga chatten om du vill ha mer hjälp.";

export const KOSTNADSFRI_BUILD_STARTED_COPY =
  "Jag ser samma kod som du under utvecklingen. Om du slår på «Granskar sajten live» och «Snabbändringar» i menyn för extra befogenheter kan jag titta på sajten och föreslå små ändringar — du godkänner varje förslag. Utan det hjälper jag fortfarande till med råd i chatten.";

export function formatAdviceRemaining(remaining: number): string {
  if (remaining <= 0) return "Ingen rådgivning kvar";
  if (remaining === 1) return "1 rådgivning kvar";
  return `${remaining} rådgivningar kvar`;
}

export function decideKostnadsfriHandoffOpen(input: {
  pathname: string;
  context: Record<string, unknown> | null | undefined;
  script?: KostnadsfriCampaignScriptState | null;
}): { open: false } | { open: true; slug: string; brief: KostnadsfriAgentBrief } {
  const slug = kostnadsfriSlugFromPathname(input.pathname);
  if (!slug) return { open: false };

  const script = input.script ?? readCampaignScript(slug);
  if (script.slug === slug && (script.handoffOpened || script.buildStartedAnnounced)) {
    return { open: false };
  }

  const brief = normalizeKostnadsfriAgentBrief(input.context?.kostnadsfriBrief);
  if (!brief || brief.stage !== "handoff") return { open: false };

  return { open: true, slug, brief };
}

export function decideKostnadsfriBuildStartedAnnounce(input: {
  pathname: string;
  context: Record<string, unknown> | null | undefined;
  script?: KostnadsfriCampaignScriptState | null;
}): { announce: false } | { announce: true; slug: string } {
  if (!input.pathname.startsWith("/builder")) return { announce: false };
  if (input.context?.buildMethod !== "kostnadsfri") return { announce: false };

  const buildStarted =
    input.context.isStreaming === true ||
    (typeof input.context.activeVersionId === "string" &&
      Boolean(input.context.activeVersionId.trim()));
  if (!buildStarted) return { announce: false };

  const slug = input.script?.slug ?? readActiveCampaignSlug();
  if (!slug) return { announce: false };

  const script = input.script ?? readCampaignScript(slug);
  if (script.buildStartedAnnounced) return { announce: false };

  return { announce: true, slug };
}

export function shouldEnforceCampaignAdviceQuota(
  context: Record<string, unknown> | null | undefined,
  script?: KostnadsfriCampaignScriptState | null,
): boolean {
  if (!script) return false;
  if (context?.page === "kostnadsfri") return true;
  if (context?.page === "builder" && context.buildMethod === "kostnadsfri") return true;
  return false;
}

/**
 * Skip-knapp och rådgivningskvot hör efter wizarden, inte på
 * lösenordssteget. Hydrera bara när underlaget är handoff, när buildern
 * kör kampanj, eller när sluggen redan öppnat manuset.
 */
export function shouldActivateCampaignScriptChrome(input: {
  pathname: string;
  context: Record<string, unknown> | null | undefined;
  script?: KostnadsfriCampaignScriptState | null;
}): boolean {
  const brief = normalizeKostnadsfriAgentBrief(input.context?.kostnadsfriBrief);
  if (brief?.stage === "handoff") return true;
  if (input.pathname.startsWith("/builder") && input.context?.buildMethod === "kostnadsfri") {
    return true;
  }
  const script = input.script;
  return Boolean(script?.handoffOpened || script?.buildStartedAnnounced);
}

export function campaignContextForClient(
  storage: CampaignScriptStorage = campaignScriptStorage(),
): KostnadsfriCampaignClientContext | null {
  const slug = readActiveCampaignSlug(storage);
  if (!slug) return null;
  const script = readCampaignScript(slug, storage);
  return {
    followupsSkipped: script.followupsSkipped,
    remaining: script.remaining,
    buildStarted: script.buildStartedAnnounced,
  };
}

export function normalizeKostnadsfriCampaignContext(
  value: unknown,
): KostnadsfriCampaignClientContext | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const remaining = clampRemaining(raw.remaining);
  return {
    followupsSkipped: raw.followupsSkipped === true,
    remaining,
    buildStarted: raw.buildStarted === true,
  };
}

/**
 * Systemkanalen för manuset: följdfrågedirektiv, kvot och byggets gräns.
 * Inte chatmeddelanden — modellen läser det här tillsammans med underlaget.
 */
export function kostnadsfriCampaignManuscriptLines(input: {
  brief: KostnadsfriAgentBrief | null;
  campaign: KostnadsfriCampaignClientContext | null;
}): string[] {
  const { brief, campaign } = input;
  const followupLines = kostnadsfriFollowupDirectiveLines(brief, {
    skipped: campaign?.followupsSkipped === true,
  });
  const lines: string[] = [];

  if (followupLines.length > 0) lines.push(...followupLines);

  if (campaign) {
    lines.push(
      `Rådgivningskvot: ${campaign.remaining} av ${KOSTNADSFRI_ADVICE_ROUND_LIMIT} rundor kvar. ` +
        "Det är hjälp i chatten, inte nya byggen. Vid noll: hänvisa vänligt till vanliga chatten.",
    );
  }

  if (campaign?.buildStarted || brief?.stage === "handoff") {
    lines.push(
      "När bygget väl syns i preview: säg att du ser samma kod som kunden under utvecklingen, " +
        "och att live-granskning och snabbändringar bara fungerar om kunden själv slår på " +
        "«Granskar sajten live» och «Snabbändringar» i menyn för extra befogenheter. " +
        "Lova inte mer än råd i chatten utan den.",
    );
  }

  if (lines.length === 0) return [];
  return ["[KAMPANJ-MANUS]", ...lines, "[/KAMPANJ-MANUS]"];
}

export function campaignCopyBundleForTests(): string {
  return [
    buildKostnadsfriHandoffIntro({ companyName: "Zax", contactFirstName: "Jan" }),
    buildKostnadsfriHandoffIntro({ companyName: "Zax" }),
    KOSTNADSFRI_FOLLOWUP_SKIP_LABEL,
    KOSTNADSFRI_FOLLOWUP_SKIP_HINT,
    KOSTNADSFRI_FOLLOWUP_SKIP_ACK,
    KOSTNADSFRI_ADVICE_EXHAUSTED_COPY,
    KOSTNADSFRI_BUILD_STARTED_COPY,
    formatAdviceRemaining(5),
    formatAdviceRemaining(1),
    formatAdviceRemaining(0),
    ...kostnadsfriCampaignManuscriptLines({
      brief: {
        stage: "handoff",
        companyName: "Zax",
      },
      campaign: { followupsSkipped: false, remaining: 3, buildStarted: true },
    }),
  ].join("\n");
}
