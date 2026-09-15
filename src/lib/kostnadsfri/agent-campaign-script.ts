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
import {
  continueFollowups,
  createFollowupSession,
  kostnadsfriFollowupDirectiveLines,
  normalizeKostnadsfriFollowupSession,
  notifyCampaignFollowupsReady,
  recordFollowupAnswer,
  skipAllFollowups,
  skipCurrentFollowup,
  type KostnadsfriFollowupId,
  type KostnadsfriFollowupReadyReason,
  type KostnadsfriFollowupSession,
} from "./agent-followups";

export const KOSTNADSFRI_ADVICE_ROUND_LIMIT = 5;

export const KOSTNADSFRI_HANDOFF_INTRO_ID = "oc-kampanj-inledning";
export const KOSTNADSFRI_BUILD_STARTED_ID = "oc-kampanj-bygge-startat";
export const KOSTNADSFRI_FOLLOWUP_SKIP_ID = "oc-kampanj-hoppa-over";

const STORAGE_PREFIX = "sajtmaskin:kampanj-manus:";
const ACTIVE_SLUG_KEY = "sajtmaskin:kampanj-manus:active-slug";

const KOSTNADSFRI_PATH = /^\/kostnadsfri\/([^/]+)/;

export interface KostnadsfriCampaignScriptState {
  slug: string;
  projectId: string | null;
  remaining: number;
  followupsSkipped: boolean;
  followupsCompleted: boolean;
  followupSession: KostnadsfriFollowupSession | null;
  handoffOpened: boolean;
  buildStartedAnnounced: boolean;
}

export interface KostnadsfriCampaignClientContext {
  followupsSkipped: boolean;
  followupsCompleted: boolean;
  remaining: number;
  buildStarted: boolean;
  projectId: string | null;
}

export type CampaignContextSurface = {
  pathname?: string;
  page?: unknown;
  buildMethod?: unknown;
  currentProjectId?: string | null;
};

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

function normalizeProjectId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function emptyCampaignScript(slug: string): KostnadsfriCampaignScriptState {
  return {
    slug,
    projectId: null,
    remaining: KOSTNADSFRI_ADVICE_ROUND_LIMIT,
    followupsSkipped: false,
    followupsCompleted: false,
    followupSession: null,
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
      projectId: normalizeProjectId(parsed.projectId),
      remaining: clampRemaining(parsed.remaining),
      followupsSkipped: parsed.followupsSkipped === true,
      followupsCompleted: parsed.followupsCompleted === true,
      followupSession: normalizeKostnadsfriFollowupSession(parsed.followupSession),
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
  const session = skipAllFollowups(state.followupSession ?? createFollowupSession([]));
  return {
    ...state,
    followupsSkipped: true,
    followupsCompleted: true,
    followupSession: session,
  };
}

export function bindCampaignScriptProjectId(
  state: KostnadsfriCampaignScriptState,
  projectId: string,
): KostnadsfriCampaignScriptState {
  const nextId = normalizeProjectId(projectId);
  if (!nextId) return state;
  return { ...state, projectId: nextId };
}

export function persistBoundCampaignProjectId(
  projectId: string,
  options?: { slug?: string; storage?: CampaignScriptStorage },
): KostnadsfriCampaignScriptState | null {
  const storage = options?.storage ?? campaignScriptStorage();
  const slug = options?.slug ?? readActiveCampaignSlug(storage);
  if (!slug) return null;
  const next = bindCampaignScriptProjectId(readCampaignScript(slug, storage), projectId);
  writeCampaignScript(next, storage);
  return next;
}

export function beginCampaignFollowupSession(
  state: KostnadsfriCampaignScriptState,
  questionIds: readonly KostnadsfriFollowupId[],
): KostnadsfriCampaignScriptState {
  if (state.followupSession) return state;
  return { ...state, followupSession: createFollowupSession(questionIds) };
}

function completeFollowupState(
  state: KostnadsfriCampaignScriptState,
  session: KostnadsfriFollowupSession,
  reason: KostnadsfriFollowupReadyReason,
): KostnadsfriCampaignScriptState {
  return {
    ...state,
    followupSession: session,
    followupsCompleted: true,
    followupsSkipped: reason === "skipped" || state.followupsSkipped,
  };
}

export function recordCampaignFollowupReply(
  state: KostnadsfriCampaignScriptState,
  raw: string,
): { state: KostnadsfriCampaignScriptState; result: "inactive" | "pending" | "complete" } {
  if (state.followupsCompleted) return { state, result: "inactive" };
  const session = state.followupSession ?? createFollowupSession([]);
  if (session.completed || session.questionIds.length === 0) {
    return { state, result: "inactive" };
  }
  const nextSession = recordFollowupAnswer(session, raw);
  if (nextSession === session) return { state: { ...state, followupSession: nextSession }, result: "pending" };
  if (!nextSession.completed) {
    return { state: { ...state, followupSession: nextSession }, result: "pending" };
  }
  const reason = nextSession.completeReason ?? "answered";
  return { state: completeFollowupState(state, nextSession, reason), result: "complete" };
}

export function skipCurrentCampaignFollowup(
  state: KostnadsfriCampaignScriptState,
): { state: KostnadsfriCampaignScriptState; result: "inactive" | "pending" | "complete" } {
  if (state.followupsCompleted) return { state, result: "inactive" };
  const session = skipCurrentFollowup(state.followupSession ?? createFollowupSession([]));
  if (!session.completed) {
    return { state: { ...state, followupSession: session }, result: "pending" };
  }
  const reason = session.completeReason ?? "skipped";
  return { state: completeFollowupState(state, session, reason), result: "complete" };
}

export function continueCampaignFollowups(
  state: KostnadsfriCampaignScriptState,
): KostnadsfriCampaignScriptState {
  if (state.followupsCompleted) return state;
  const session = continueFollowups(state.followupSession ?? createFollowupSession([]));
  return completeFollowupState(state, session, "continued");
}

export function reannounceFollowupsReady(state: KostnadsfriCampaignScriptState): void {
  if (!state.followupsCompleted) return;
  notifyCampaignFollowupsReady({
    slug: state.slug,
    reason: state.followupSession?.completeReason ?? (state.followupsSkipped ? "skipped" : "continued"),
  });
}

export function notifyIfFollowupsReady(
  previous: KostnadsfriCampaignScriptState,
  next: KostnadsfriCampaignScriptState,
): void {
  if (previous.followupsCompleted || !next.followupsCompleted) return;
  reannounceFollowupsReady(next);
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
  "Svaren är frivilliga — hoppa över eller svara, sen startar bygget.";

export const KOSTNADSFRI_FOLLOWUP_CONTINUE_LABEL = "Fortsätt";

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

  const currentProjectId = normalizeProjectId(input.context.projectId);
  const slug = input.script?.slug ?? readActiveCampaignSlug();
  if (!slug) return { announce: false };

  const script = input.script ?? readCampaignScript(slug);
  if (script.buildStartedAnnounced) return { announce: false };
  if (!script.projectId || script.projectId !== currentProjectId) return { announce: false };

  return { announce: true, slug };
}

export function shouldEnforceCampaignAdviceQuota(
  context: Record<string, unknown> | null | undefined,
  script?: KostnadsfriCampaignScriptState | null,
): boolean {
  if (!script) return false;
  if (context?.page === "kostnadsfri") return true;
  if (
    context?.page === "builder" &&
    context.buildMethod === "kostnadsfri" &&
    normalizeProjectId(context.projectId) === script.projectId &&
    Boolean(script.projectId)
  ) {
    return true;
  }
  return false;
}

/**
 * Kampanjkontext följer inbjudan + avsett projekt, inte «senaste aktiva slug».
 * Före createProject är projectId null — då gäller bara /kostnadsfri/[slug].
 */
export function shouldAttachCampaignContext(input: {
  pathname: string;
  page?: unknown;
  buildMethod?: unknown;
  currentProjectId?: string | null;
  script?: KostnadsfriCampaignScriptState | null;
}): boolean {
  const script = input.script;
  if (!script) return false;

  const pathSlug = kostnadsfriSlugFromPathname(input.pathname);
  if (pathSlug && pathSlug === script.slug) {
    return (
      script.handoffOpened ||
      script.followupsCompleted ||
      Boolean(script.followupSession) ||
      script.buildStartedAnnounced
    );
  }

  if (input.page === "builder" || input.pathname.startsWith("/builder")) {
    const currentProjectId = normalizeProjectId(input.currentProjectId);
    return (
      input.buildMethod === "kostnadsfri" &&
      Boolean(script.projectId) &&
      script.projectId === currentProjectId
    );
  }

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
  const pathSlug = kostnadsfriSlugFromPathname(input.pathname);
  if (brief?.stage === "handoff" && pathSlug) return true;
  return shouldAttachCampaignContext({
    pathname: input.pathname,
    page: input.context?.page,
    buildMethod: input.context?.buildMethod,
    currentProjectId: normalizeProjectId(input.context?.projectId),
    script: input.script,
  });
}

function surfaceFromWindow(): CampaignContextSurface {
  if (typeof window === "undefined") return {};
  const ctx = window.__SITEMASKIN_CONTEXT;
  return {
    pathname: window.location.pathname,
    page: ctx?.page,
    buildMethod: ctx?.buildMethod,
    currentProjectId: normalizeProjectId(ctx?.projectId),
  };
}

export function campaignContextForClient(
  storage: CampaignScriptStorage = campaignScriptStorage(),
  surface?: CampaignContextSurface,
): KostnadsfriCampaignClientContext | null {
  const resolved = surface ?? surfaceFromWindow();
  const slug = kostnadsfriSlugFromPathname(resolved.pathname ?? "") ?? readActiveCampaignSlug(storage);
  if (!slug) return null;
  const script = readCampaignScript(slug, storage);
  if (
    !shouldAttachCampaignContext({
      pathname: resolved.pathname ?? "",
      page: resolved.page,
      buildMethod: resolved.buildMethod,
      currentProjectId: resolved.currentProjectId,
      script,
    })
  ) {
    return null;
  }
  return {
    followupsSkipped: script.followupsSkipped,
    followupsCompleted: script.followupsCompleted,
    remaining: script.remaining,
    buildStarted: script.buildStartedAnnounced,
    projectId: script.projectId,
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
    followupsCompleted: raw.followupsCompleted === true,
    remaining,
    buildStarted: raw.buildStarted === true,
    projectId: normalizeProjectId(raw.projectId),
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
    completed: campaign?.followupsCompleted === true,
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
    KOSTNADSFRI_FOLLOWUP_CONTINUE_LABEL,
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
      campaign: {
        followupsSkipped: false,
        followupsCompleted: false,
        remaining: 3,
        buildStarted: true,
        projectId: null,
      },
    }),
  ].join("\n");
}
