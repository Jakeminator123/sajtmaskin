/**
 * Beslutslogiken bakom `.github/workflows/merge-ready-freshness.yml`.
 *
 * Bruten ur workflowen av två skäl (Codex P1 på #652): en merge-säkerhetsgrind
 * ska ha exekverbara tester, och bash inuti YAML går inte att testa. Workflowen
 * samlar data och agerar; all bedömning sker här.
 *
 * **Tidsstämpeln kommer från GitHub, inte från sign-off-texten.** `at:`-fältet
 * är författarstyrd fritext och därför inte pålitligt som ordningsgrund. Att
 * bara jämföra det mot runnerns klocka räcker inte heller: startar jobbet med
 * fördröjning hinner ett framtidsdaterat `at:` bli "förflutet" innan kollen
 * körs, och ett bot-fynd däremellan räknas då som äldre än sign-offen. Vi
 * använder i stället `created_at` på den kommentar som bär sign-off-raden —
 * den sätts serverside och kan inte skrivas av författaren.
 *
 * Konsekvens: en sign-off som bara står i PR-beskrivningen har ingen
 * verifierbar tidpunkt (PR:ens `updated_at` bumpas av allt möjligt och ligger
 * dessutom senare än sign-offen, alltså åt fel håll). Den behandlas som
 * otidsstämplad och labeln tas bort — posta sign-offen som kommentar.
 */

/** Tolererar em-dash, en-dash, bindestreck eller kolon efter `merge:ready`. */
export const SIGNOFF_PATTERN = /merge:ready\s*[—–:-]?\s*head-sha:/i;
export const MERGE_EXECUTE_PATTERN =
  /^merge:execute\s*[—–:-]\s*head-sha:\s*([0-9a-f]{40}),\s*base-sha:\s*([0-9a-f]{40}),\s*at:\s*([^,\s]+),\s*bugkoll:\s*([^,\r\n]+),\s*triage:\s*([^,\r\n]+),\s*P0\/P1:\s*0\s*$/i;

const HEAD_SHA_FIELD_PATTERN = /(?:^|[,\s])head-sha:\s*([^,\s]+)/i;
const BASE_SHA_FIELD_PATTERN = /(?:^|[,\s])base-sha:\s*([^,\s]+)/i;
const SHA_PATTERN = /^[0-9a-f]{40}$/i;
const UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const MERGE_READY_LABEL = "merge:ready";
const CURSOR_LOGIN = "cursor[bot]";
const GITHUB_ACTIONS_LOGINS = new Set(["github-actions", "github-actions[bot]"]);
const TRUSTED_SIGNOFF_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
const BUGBOT_FINDING_MARKER =
  /<!--\s*BUGBOT_REVIEW\s*-->|<!--\s*BUGBOT_BUG_ID\s*:\s*[a-z0-9_-]+\s*-->/i;
const PR_REVIEW_STATE_MARKER = /<!--\s*sajtmaskin-pr-review-state:v1:/i;
const INVALIDATING_PULL_REQUEST_ACTIONS = new Map([
  ["synchronize", "ny commit"],
  ["converted_to_draft", "PR ändrad till draft"],
  ["reopened", "PR återöppnad"],
  ["ready_for_review", "PR markerad redo efter draft"],
]);
const NON_INVALIDATING_PULL_REQUEST_ACTIONS = new Set(["opened", "edited"]);

function commaField(line, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return line.match(new RegExp(`(?:^|,)\\s*${escaped}:\\s*([^,]*)`, "i"))?.[1]?.trim() ?? null;
}

/**
 * @typedef {{
 *   body: string,
 *   createdAt: string | null,
 *   authorLogin?: string | null,
 *   authorType?: string | null,
 *   authorAssociation?: string | null,
 * }} SignoffCandidate
 */

/**
 * Den required `review-window` använder samma validerare precis innan den får
 * bli grön. Det är avsiktligt separat från label-invalideringen: om ett
 * skrivande workflow eller API-anrop fallerar får en gammal label ändå inte
 * räcka för att passera samtliga required checks.
 *
 * @param {{
 *   headSha: string,
 *   baseSha: string,
 *   baseIsAncestor: boolean,
 *   labels: string[],
 *   prAuthorLogin?: string | null,
 *   minimumSignoffCreatedAt?: string | null,
 *   prBody?: string,
 *   comments?: SignoffCandidate[],
 * }} input
 * @returns {{ valid: boolean, reason: string, createdAt?: string }}
 */
export function validateMergeReadySignoff(input) {
  const labels = (input.labels ?? []).map((label) => String(label).toLowerCase());
  if (!labels.includes(MERGE_READY_LABEL)) {
    return { valid: false, reason: "merge:ready-label saknas" };
  }

  if (!SHA_PATTERN.test(input.headSha ?? "")) {
    return { valid: false, reason: "GitHub gav ogiltig aktuell head-SHA" };
  }
  if (!SHA_PATTERN.test(input.baseSha ?? "")) {
    return { valid: false, reason: "GitHub gav ogiltig aktuell base-SHA" };
  }
  if (input.baseIsAncestor !== true) {
    return {
      valid: false,
      reason:
        "kunde inte verifiera att head innehåller aktuell base — uppdatera branchen eller kontrollera GitHub compare",
    };
  }

  const signoff = findLatestSignoff(input.prBody ?? "", input.comments ?? []);
  if (!signoff) {
    return { valid: false, reason: "merge:ready utan giltig sign-off-rad" };
  }

  const signoffHeadField = signoff.line.match(HEAD_SHA_FIELD_PATTERN)?.[1] ?? null;
  if (!signoffHeadField || !SHA_PATTERN.test(signoffHeadField)) {
    return { valid: false, reason: "ogiltig sign-off head-sha — kräver exakt 40 hextecken" };
  }
  const signoffHeadSha = signoffHeadField.toLowerCase();
  if (signoffHeadSha !== input.headSha.toLowerCase()) {
    return {
      valid: false,
      reason: `sign-off head-sha (${signoffHeadSha.slice(0, 7)}) != aktuell head (${input.headSha.slice(0, 7)})`,
    };
  }

  const signoffBaseField = signoff.line.match(BASE_SHA_FIELD_PATTERN)?.[1] ?? null;
  if (!signoffBaseField || !SHA_PATTERN.test(signoffBaseField)) {
    return { valid: false, reason: "ogiltig sign-off base-sha — kräver exakt 40 hextecken" };
  }
  const signoffBaseSha = signoffBaseField.toLowerCase();
  if (signoffBaseSha !== input.baseSha.toLowerCase()) {
    return {
      valid: false,
      reason: `sign-off base-sha (${signoffBaseSha.slice(0, 7)}) != aktuell base (${input.baseSha.slice(0, 7)})`,
    };
  }

  const at = commaField(signoff.line, "at");
  const bugCheck = commaField(signoff.line, "bugkoll");
  const triage = commaField(signoff.line, "triage");
  const p0p1 = commaField(signoff.line, "P0/P1");
  if (!at || !UTC_PATTERN.test(at) || Number.isNaN(Date.parse(at))) {
    return { valid: false, reason: "sign-off kräver giltigt at-fält i UTC" };
  }
  if (!bugCheck) return { valid: false, reason: "sign-off kräver icke-tom bugkoll" };
  if (!triage) return { valid: false, reason: "sign-off kräver icke-tom triage" };
  if (p0p1 !== "0") return { valid: false, reason: "sign-off kräver exakt P0/P1: 0" };

  const signoffEpoch = toEpoch(signoff.createdAt);
  if (signoffEpoch === null) {
    return {
      valid: false,
      reason:
        "sign-off saknar verifierbar tidsstämpel (står bara i PR-beskrivningen) — posta den som kommentar",
    };
  }

  const authorReason = invalidSignoffAuthorReason(signoff, input.prAuthorLogin ?? null);
  if (authorReason) return { valid: false, reason: authorReason };

  if (input.minimumSignoffCreatedAt) {
    const minimumEpoch = toEpoch(input.minimumSignoffCreatedAt);
    if (minimumEpoch === null) {
      return { valid: false, reason: "granskningsgrindens minimitid kunde inte verifieras" };
    }
    // GitHub-kommentarer/checks kan ha sekundupplöst tid. Lika tid bevisar
    // ingen ordning och lämnas därför fail-closed; sign-off måste vara strikt
    // senare än hela granskningsunderlaget.
    if (signoffEpoch <= minimumEpoch) {
      return {
        valid: false,
        reason:
          "sign-off postades innan granskningsfönstret, övriga checks eller botfynd var klara",
      };
    }
  }

  return {
    valid: true,
    reason: `sign-off matchar aktuell head ${signoffHeadSha.slice(0, 7)} och base ${signoffBaseSha.slice(0, 7)}`,
    createdAt: signoff.createdAt,
  };
}

/**
 * Det sista merge-mandatet är striktare än den vanliga sign-offen. Bara en
 * mänsklig repoägare/medlem/collaborator får beordra merge; PR-författarskap
 * räcker uttryckligen inte. Hela kommentaren måste vara en enda exakt,
 * head/base-bunden kommandorad så att dold eller tvetydig fritext inte kan
 * tolkas som mandat.
 *
 * @param {{
 *   body: string,
 *   createdAt?: string | null,
 *   authorLogin?: string | null,
 *   authorType?: string | null,
 *   authorAssociation?: string | null,
 *   headSha: string,
 *   baseSha: string,
 * }} input
 */
export function validateMergeExecuteMandate(input) {
  const match = input.body?.trim().match(MERGE_EXECUTE_PATTERN);
  if (!match) {
    return {
      valid: false,
      reason:
        "merge:execute måste vara en enda exakt rad med head-sha, base-sha, at, bugkoll, triage och P0/P1: 0",
    };
  }

  const [, commandHead, commandBase, at, bugCheck, triage] = match;
  if (
    !SHA_PATTERN.test(input.headSha ?? "") ||
    commandHead.toLowerCase() !== input.headSha.toLowerCase()
  ) {
    return { valid: false, reason: "merge:execute head-sha matchar inte aktuell PR-head" };
  }
  if (
    !SHA_PATTERN.test(input.baseSha ?? "") ||
    commandBase.toLowerCase() !== input.baseSha.toLowerCase()
  ) {
    return { valid: false, reason: "merge:execute base-sha matchar inte aktuell master" };
  }
  if (!UTC_PATTERN.test(at) || Number.isNaN(Date.parse(at))) {
    return { valid: false, reason: "merge:execute kräver ett giltigt at-fält i UTC" };
  }
  if (!bugCheck.trim() || !triage.trim()) {
    return { valid: false, reason: "merge:execute kräver icke-tom bugkoll och triage" };
  }

  const login = input.authorLogin?.trim().toLowerCase() ?? "";
  const type = input.authorType?.trim().toLowerCase() ?? "";
  const association = input.authorAssociation?.trim().toUpperCase() ?? "";
  if (!login || type !== "user" || login.endsWith("[bot]")) {
    return { valid: false, reason: "merge:execute måste postas av en verifierad människa" };
  }
  if (!TRUSTED_SIGNOFF_ASSOCIATIONS.has(association)) {
    return {
      valid: false,
      reason: `merge:execute-författaren ${login} saknar OWNER/MEMBER/COLLABORATOR-behörighet`,
    };
  }
  if (toEpoch(input.createdAt) === null) {
    return { valid: false, reason: "merge:execute saknar GitHub-verifierad created_at" };
  }

  return {
    valid: true,
    reason: `merge:execute är bundet till head ${commandHead.slice(0, 7)} och base ${commandBase.slice(0, 7)}`,
    createdAt: input.createdAt,
  };
}

/**
 * @param {{
 *   eventName: string,
 *   eventAction?: string,
 *   eventLabel?: string,
 *   senderLogin?: string,
 *   eventBody?: string,
 *   headSha: string,
 *   baseSha: string,
 *   baseIsAncestor: boolean,
 *   labels: string[],
 *   prAuthorLogin?: string | null,
 *   eventAt?: string | null,
 *   prBody?: string,
 *   comments?: SignoffCandidate[],
 * }} input
 * @returns {{ action: "keep" | "remove", reason: string }}
 */
export function decideMergeReadyAction(input) {
  const isPullRequestEvent =
    input.eventName === "pull_request_target" || input.eventName === "pull_request";
  const isLabeledEvent = isPullRequestEvent && input.eventAction === "labeled";
  const isUnlabeledEvent = isPullRequestEvent && input.eventAction === "unlabeled";
  const eventLabel = input.eventLabel?.toLowerCase() ?? "";

  // En annan labels tillkomst eller borttagning får inte råka omvalidera eller
  // riva en redan godkänd merge:ready. Workflowens job-if filtrerar också,
  // detta är defense-in-depth.
  if ((isLabeledEvent || isUnlabeledEvent) && eventLabel !== MERGE_READY_LABEL) {
    return { action: "keep", reason: `annan label (${input.eventLabel ?? "okänd"}) — no-op` };
  }

  // När merge:ready själv tas bort är önskat slutläge redan uppnått. Live
  // labels-svaret kan ligga efter eventet, så försök inte ta bort labeln igen.
  if (isUnlabeledEvent) {
    return { action: "keep", reason: "merge:ready togs bort — no-op" };
  }

  const labels = input.labels ?? [];
  const isMergeReadyLabelEvent = isLabeledEvent && eventLabel === MERGE_READY_LABEL;
  if (!labels.includes(MERGE_READY_LABEL) && !isMergeReadyLabelEvent) {
    return { action: "keep", reason: "ingen merge:ready — no-op" };
  }

  // GitHub behåller reviewens ursprungliga submitted_at när den redigeras
  // eller avfärdas. Eventet är ändå nytt och kan ändra fyndens innebörd efter
  // sign-off. Kräv därför alltid en ny sign-off, oavsett gammal timestamp och
  // oavsett om den som dismissar är människa eller bot.
  if (
    input.eventName === "pull_request_review" &&
    ["edited", "dismissed"].includes(input.eventAction ?? "")
  ) {
    return {
      action: "remove",
      reason: `review ${input.eventAction} efter tidigare sign-off — granska och signera igen`,
    };
  }

  const invalidatingPullRequestReason = isPullRequestEvent
    ? INVALIDATING_PULL_REQUEST_ACTIONS.get(input.eventAction ?? "")
    : undefined;
  if (invalidatingPullRequestReason) {
    const short = (input.headSha ?? "").slice(0, 7);
    const reason =
      input.eventAction === "converted_to_draft"
        ? "PR ändrad till draft — gör ny sign-off när den åter är redo"
        : input.eventAction === "reopened"
          ? "PR återöppnad — verifiera aktuell head och merge-bas igen"
          : input.eventAction === "ready_for_review"
            ? "PR markerad redo efter draft — gör ny sign-off"
            : `${invalidatingPullRequestReason} (${short}) — gör om buggkollen och sätt merge:ready igen`;
    return {
      action: "remove",
      reason,
    };
  }

  // Bara ovanstående, uttryckligen semantiska PR-övergångar ogiltigförklarar
  // sign-offen direkt. `edited` kan vara en titel- eller beskrivningsändring;
  // en eventuell base-förflyttning fångas i stället av live SHA-valideringen
  // nedan. Okända framtida PR-actions lämnas fail-closed tills de klassats.
  if (
    isPullRequestEvent &&
    !isLabeledEvent &&
    !NON_INVALIDATING_PULL_REQUEST_ACTIONS.has(input.eventAction ?? "")
  ) {
    return {
      action: "remove",
      reason: `okänd PR-händelse (${input.eventAction ?? "saknas"}) — signera om fail-closed`,
    };
  }

  const validation = validateMergeReadySignoff({
    ...input,
    // Label-eventet kan levereras innan labels-listan hunnit konvergera. Bara
    // den vägen får använda eventets exakta label som bevis; required-checken
    // anropar valideraren direkt och kräver alltid labeln i live PR-svaret.
    labels: isMergeReadyLabelEvent ? [...labels, MERGE_READY_LABEL] : labels,
  });
  if (!validation.valid) return { action: "remove", reason: validation.reason };

  // Label-eventet är den atomära kontrollpunkten som stänger luckan där head
  // eller base hann flytta sig mellan kommentar och label. Eventet behöver
  // ingen bot-tidsjämförelse: identiteterna ovan är lästa aktuellt från API:t.
  if (isMergeReadyLabelEvent) {
    return {
      action: "keep",
      reason: validation.reason,
    };
  }

  // Metadataändringar och opened-event är inte granskningsfynd. Efter att
  // aktuell head/base/sign-off verifierats ovan kan labeln ligga kvar.
  if (isPullRequestEvent) {
    return {
      action: "keep",
      reason: `PR-händelsen ${input.eventAction} ändrade inte verifierad head/base`,
    };
  }

  const signoffEpoch = toEpoch(validation.createdAt);
  const eventEpoch = toEpoch(input.eventAt);
  if (signoffEpoch === null || eventEpoch === null) {
    return {
      action: "remove",
      reason: "kunde inte jämföra tidpunkter — behandlar sign-offen som inaktuell",
    };
  }

  if (eventEpoch < signoffEpoch) {
    return { action: "keep", reason: "händelsen är äldre än sign-offen" };
  }

  if (isCursorStatusComment(input)) {
    return {
      action: "keep",
      reason: "Cursor-statuskommentar utan Bugbot-fyndmarkör",
    };
  }

  if (isGitHubActionsStateComment(input)) {
    return {
      action: "keep",
      reason: "GitHub Actions state-kommentar utan granskningsfynd",
    };
  }

  return {
    action: "remove",
    reason: "bot-fynd efter sign-off — läs fynden, triagera, sätt merge:ready igen",
  };
}

/**
 * Cursor postar även status-, dokumentations- och usage-limit-kommentarer som
 * `issue_comment`. Bara de standardiserade Bugbot-markörerna är fynd på den
 * vägen. Reviews och inline-kommentarer lämnas fail-closed.
 *
 * @param {{ eventName: string, senderLogin?: string, eventBody?: string }} input
 */
function isCursorStatusComment(input) {
  return (
    input.eventName === "issue_comment" &&
    input.senderLogin?.toLowerCase() === CURSOR_LOGIN &&
    !BUGBOT_FINDING_MARKER.test(input.eventBody ?? "")
  );
}

/**
 * Den interna PR-granskaren uppdaterar en maskinläsbar state-kommentar som
 * GitHub Actions-botten. Den är bokföring, inte ett fynd. Bara den exakta
 * state-markören får undantas; alla andra Actions-reviews/kommentarer lämnas
 * fail-closed och river labeln.
 *
 * @param {{ eventName: string, senderLogin?: string, eventBody?: string }} input
 */
function isGitHubActionsStateComment(input) {
  return (
    input.eventName === "issue_comment" &&
    GITHUB_ACTIONS_LOGINS.has(input.senderLogin?.toLowerCase() ?? "") &&
    PR_REVIEW_STATE_MARKER.test(input.eventBody ?? "")
  );
}

/**
 * Normaliserad klassificering för den betrodda required-check-controllern.
 * Endast bot-händelser kan vara maskinfynd här; kända rena statuskommentarer
 * undantas smalt och allt okänt lämnas fail-closed som ett fynd.
 *
 * @param {{ eventName: string, senderLogin?: string, senderType?: string, eventBody?: string }} input
 */
export function isInvalidatingBotEvent(input) {
  if (input.senderType?.toLowerCase() !== "bot") return false;
  const login = input.senderLogin?.toLowerCase() ?? "";
  if (login === "dependabot[bot]") return false;
  if (input.eventName === "issue_comment" && login === "vercel[bot]") return false;
  if (isCursorStatusComment(input)) return false;
  if (isGitHubActionsStateComment(input)) return false;
  return true;
}

/**
 * Sign-off är ett mänskligt mergebeslut, inte ett botkvitto. PR-författaren
 * får signera sin egen PR; annars krävs GitHubs serverside-association för en
 * repoägare, medlem eller explicit collaborator. Saknade fält är ogiltiga —
 * äldre workflowversioner får alltså inte råka behandla okänd identitet som
 * betrodd.
 *
 * @param {{ authorLogin?: string | null, authorType?: string | null, authorAssociation?: string | null }} signoff
 * @param {string | null} prAuthorLogin
 */
function invalidSignoffAuthorReason(signoff, prAuthorLogin) {
  const login = signoff.authorLogin?.trim().toLowerCase() ?? "";
  const type = signoff.authorType?.trim().toLowerCase() ?? "";
  const association = signoff.authorAssociation?.trim().toUpperCase() ?? "";
  const author = prAuthorLogin?.trim().toLowerCase() ?? "";

  if (!login || type !== "user" || login.endsWith("[bot]")) {
    return "sign-off måste postas av en verifierad mänsklig GitHub-användare";
  }
  if (login === author || TRUSTED_SIGNOFF_ASSOCIATIONS.has(association)) return null;
  return `sign-off-författaren ${login} är varken PR-författare eller betrodd repo-collaborator`;
}

/**
 * Senaste sign-off-raden. Kommentarer vinner över PR-beskrivningen eftersom
 * bara de bär en serverside-tidsstämpel; bland kommentarer vinner den nyaste.
 *
 * @param {string} prBody
 * @param {SignoffCandidate[]} comments
 */
function findLatestSignoff(prBody, comments) {
  const fromComments = comments
    .map((c) => ({
      line: matchSignoffLine(c.body),
      createdAt: c.createdAt,
      authorLogin: c.authorLogin,
      authorType: c.authorType,
      authorAssociation: c.authorAssociation,
    }))
    .filter((c) => c.line !== null)
    .sort((a, b) => (toEpoch(a.createdAt) ?? 0) - (toEpoch(b.createdAt) ?? 0));

  const newest = fromComments.at(-1);
  if (newest?.line) return newest;

  const bodyLine = matchSignoffLine(prBody);
  return bodyLine
    ? {
        line: bodyLine,
        createdAt: null,
        authorLogin: null,
        authorType: null,
        authorAssociation: null,
      }
    : null;
}

/** @param {string} text */
function matchSignoffLine(text) {
  if (typeof text !== "string") return null;
  const lines = text.split(/\r?\n/).filter((line) => SIGNOFF_PATTERN.test(line));
  return lines.at(-1) ?? null;
}

/** @param {string | null | undefined} value */
function toEpoch(value) {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

// CLI: läser payloaden som JSON på stdin och skriver `<action>\t<reason>`.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (process.argv.includes("--validate")) {
    const result = validateMergeReadySignoff(input);
    process.stdout.write(`${result.valid ? "valid" : "invalid"}\t${result.reason}\n`);
  } else {
    const decision = decideMergeReadyAction(input);
    process.stdout.write(`${decision.action}\t${decision.reason}\n`);
  }
}
