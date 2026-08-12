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
export const SIGNOFF_PATTERN = /merge:ready\s*[—–:-]?\s*sha:/i;

const SHA_PATTERN = /sha:\s*([0-9a-f]{40})/i;

/** @typedef {{ body: string, createdAt: string | null }} SignoffCandidate */

/**
 * @param {{
 *   eventName: string,
 *   headSha: string,
 *   labels: string[],
 *   eventAt?: string | null,
 *   prBody?: string,
 *   comments?: SignoffCandidate[],
 * }} input
 * @returns {{ action: "keep" | "remove", reason: string }}
 */
export function decideMergeReadyAction(input) {
  const labels = input.labels ?? [];
  if (!labels.includes("merge:ready")) {
    return { action: "keep", reason: "ingen merge:ready — no-op" };
  }

  if (input.eventName === "pull_request") {
    const short = (input.headSha ?? "").slice(0, 7);
    return {
      action: "remove",
      reason: `ny commit (${short}) — gör om buggkollen och sätt merge:ready igen`,
    };
  }

  const signoff = findLatestSignoff(input.prBody ?? "", input.comments ?? []);
  if (!signoff) {
    return { action: "remove", reason: "merge:ready utan giltig sign-off-rad" };
  }

  const signoffSha = signoff.line.match(SHA_PATTERN)?.[1]?.toLowerCase() ?? null;
  if (signoffSha && signoffSha !== (input.headSha ?? "").toLowerCase()) {
    return {
      action: "remove",
      reason: `sign-off sha (${signoffSha.slice(0, 7)}) != head (${(input.headSha ?? "").slice(0, 7)})`,
    };
  }

  if (!signoff.createdAt) {
    return {
      action: "remove",
      reason:
        "sign-off saknar verifierbar tidsstämpel (står bara i PR-beskrivningen) — posta den som kommentar",
    };
  }

  const signoffEpoch = toEpoch(signoff.createdAt);
  const eventEpoch = toEpoch(input.eventAt);
  if (signoffEpoch === null || eventEpoch === null) {
    return {
      action: "remove",
      reason: "kunde inte jämföra tidpunkter — behandlar sign-offen som inaktuell",
    };
  }

  if (eventEpoch <= signoffEpoch) {
    return { action: "keep", reason: "händelsen är inte nyare än sign-offen" };
  }

  return {
    action: "remove",
    reason: "bot-fynd efter sign-off — läs fynden, triagera, sätt merge:ready igen",
  };
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
    .map((c) => ({ line: matchSignoffLine(c.body), createdAt: c.createdAt }))
    .filter((c) => c.line !== null)
    .sort((a, b) => (toEpoch(a.createdAt) ?? 0) - (toEpoch(b.createdAt) ?? 0));

  const newest = fromComments.at(-1);
  if (newest?.line) return { line: newest.line, createdAt: newest.createdAt };

  const bodyLine = matchSignoffLine(prBody);
  return bodyLine ? { line: bodyLine, createdAt: null } : null;
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
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}

// CLI: läser payloaden som JSON på stdin och skriver `<action>\t<reason>`.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const decision = decideMergeReadyAction(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  process.stdout.write(`${decision.action}\t${decision.reason}\n`);
}
