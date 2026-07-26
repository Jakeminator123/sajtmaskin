import type { ChatReadinessItem } from "@/lib/chat-readiness";
import { resolveReadinessCategoryFromSeverity } from "@/lib/chat-readiness";
import type { DeployReleaseGateResult } from "@/lib/db/engine-version-lifecycle";

const SEO_ADVISORY_CODES = {
  "missing-metadata": {
    id: "seo-missing-metadata",
    title: "Sidans titel och beskrivning saknas.",
    detail:
      "Lägg till metadata i layout eller page. Det stoppar inte publicering, men hjälper i sökresultat.",
  },
  "missing-title": {
    id: "seo-missing-title",
    title: "Sidans titel saknas.",
    detail:
      "Lägg till en title i metadata. Det stoppar inte publicering, men hjälper i sökresultat.",
  },
} as const;

type SeoAdvisoryCode = keyof typeof SEO_ADVISORY_CODES;

type ReadinessIssue = {
  code: string;
  category: string | null;
};

function isSeoAdvisoryCode(value: string): value is SeoAdvisoryCode {
  return value in SEO_ADVISORY_CODES;
}

function parseReadinessIssues(meta: unknown): ReadinessIssue[] {
  if (!meta || typeof meta !== "object") return [];
  const rawIssues = (meta as Record<string, unknown>).issues;
  if (!Array.isArray(rawIssues)) return [];

  const parsed: ReadinessIssue[] = [];
  for (const issue of rawIssues) {
    if (!issue || typeof issue !== "object") continue;
    const record = issue as Record<string, unknown>;
    if (typeof record.code !== "string" || record.code.trim().length === 0) continue;
    parsed.push({
      code: record.code.trim(),
      category: typeof record.category === "string" ? record.category : null,
    });
  }
  return parsed;
}

export function buildSeoAdvisoriesFromMeta(meta: unknown): ChatReadinessItem[] {
  const issues = parseReadinessIssues(meta);
  const items: ChatReadinessItem[] = [];
  const seenCodes = new Set<string>();

  for (const issue of issues) {
    if (!isSeoAdvisoryCode(issue.code) || seenCodes.has(issue.code)) continue;
    if (issue.category && issue.category !== "non_blocking_quality_warning") continue;
    seenCodes.add(issue.code);
    const copy = SEO_ADVISORY_CODES[issue.code];
    items.push({
      id: copy.id,
      title: copy.title,
      detail: copy.detail,
      severity: "warning",
      category: "advisory",
      action: "seo",
    });
  }

  return items;
}

/**
 * Ö1-paritet (A#12): spegla deploy-API:ts ReleaseGate-lås i readiness så
 * `canDeploy` aldrig visar grönt när `POST /api/v0/deployments` skulle svara
 * 409 `DEPLOY_RELEASE_GATE_NOT_GREEN` (F3-version som inte är passed/promoted).
 *
 * `failed`/`draft`/`repair_available` blockeras redan av lifecycle-blockern —
 * gate-blockern läggs bara till när ingen lifecycle-blocker redan finns
 * (typiskt F3 `verifying`/`repairing`, som annars bara blir en warning).
 *
 * User-facing copy is plain Swedish — do not surface `releaseGate.message`
 * (it may contain internal vocabulary). Technical detail stays in logs / DB.
 */
export function buildReleaseGateBlocker(
  releaseGate: DeployReleaseGateResult,
  hasLifecycleBlocker: boolean,
): ChatReadinessItem | null {
  if (releaseGate.allowed) return null;
  if (releaseGate.code !== "DEPLOY_RELEASE_GATE_NOT_GREEN") return null;
  if (hasLifecycleBlocker) return null;
  return {
    id: "release-gate-not-green",
    title: "Integrationerna är inte klara att publicera ännu.",
    detail:
      "Vänta tills kontrollerna är klara, eller kör om byggandet av integrationer innan du publicerar.",
    severity: "blocker",
    action: "versions",
  };
}

export function withReadinessCategory(item: ChatReadinessItem): ChatReadinessItem {
  if (item.category) return item;
  return {
    ...item,
    category: resolveReadinessCategoryFromSeverity(item.severity),
  };
}
