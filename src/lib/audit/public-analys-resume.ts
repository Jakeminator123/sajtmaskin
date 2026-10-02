import type { PublicAnalysReport, PublicImprovement } from "./public-report";

export const PUBLIC_ANALYS_PENDING_TTL_MS = 24 * 60 * 60 * 1_000;
export const PUBLIC_ANALYS_PENDING_MAX_BYTES = 64 * 1_024;

const STORAGE_KEY = "sajtmaskin:public-analys-resume:v1";
const MAX_TEXT = 600;
const MAX_URL = 2_048;
const MAX_LIST = 6;
const MAX_IMPROVEMENTS = 8;
const MAX_FUTURE_SKEW_MS = 30_000;

const SCORE_KEYS = [
  "seo",
  "technical_seo",
  "ux",
  "content",
  "performance",
  "accessibility",
  "security",
  "mobile",
] as const;

const CATEGORIES = new Set(["UX", "Tech", "Content", "Marketing", "Security"]);

export type PublicAnalysAction = "pdf" | "build";

export type PendingPublicAnalys = {
  v: 1;
  action: PublicAnalysAction;
  report: PublicAnalysReport;
  auditedUrl: string;
  savedAt: number;
};

type StorageOptions = {
  storage?: Storage | null;
  now?: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown, max = MAX_TEXT): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

function stringList(value: unknown, max = MAX_LIST): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const list = value
    .map((entry) => text(entry))
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, max);
  return list.length > 0 ? list : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function compact<T extends object>(value: T): T | undefined {
  return Object.keys(value).length > 0 ? value : undefined;
}

function normalizeScores(value: unknown): PublicAnalysReport["audit_scores"] {
  const source = asRecord(value);
  if (!source) return undefined;
  const result: NonNullable<PublicAnalysReport["audit_scores"]> = {};
  for (const key of SCORE_KEYS) {
    const score = finiteNumber(source[key]);
    if (score !== undefined) result[key] = Math.max(0, Math.min(100, Math.round(score)));
  }
  return compact(result);
}

function normalizeImprovements(value: unknown): PublicImprovement[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const improvements: PublicImprovement[] = [];
  for (const entry of value) {
    const source = asRecord(entry);
    const item = text(source?.item);
    if (!source || !item) continue;
    const improvement: PublicImprovement = {
      item,
      impact:
        source.impact === "high" || source.impact === "medium" || source.impact === "low"
          ? source.impact
          : "low",
      effort:
        source.effort === "low" || source.effort === "medium" || source.effort === "high"
          ? source.effort
          : "high",
    };
    if (typeof source.category === "string" && CATEGORIES.has(source.category)) {
      improvement.category = source.category as PublicImprovement["category"];
    }
    const why = text(source.why);
    if (why) improvement.why = why;
    const how = text(source.how);
    if (how) improvement.how = how;
    improvements.push(improvement);
    if (improvements.length >= MAX_IMPROVEMENTS) break;
  }
  return improvements.length > 0 ? improvements : undefined;
}

function normalizePublicReport(value: unknown): PublicAnalysReport | null {
  const source = asRecord(value);
  if (!source) return null;
  const report: PublicAnalysReport = {};

  for (const key of ["company", "domain", "timestamp", "industry"] as const) {
    const valueForKey = text(source[key]);
    if (valueForKey) report[key] = valueForKey;
  }
  if (source.audit_mode === "basic" || source.audit_mode === "advanced") {
    report.audit_mode = source.audit_mode;
  }

  const auditScores = normalizeScores(source.audit_scores);
  if (auditScores) report.audit_scores = auditScores;

  const audienceSource = asRecord(source.audience);
  if (audienceSource) {
    const audience = compact({
      ...(text(audienceSource.primary_segment)
        ? { primary_segment: text(audienceSource.primary_segment) }
        : {}),
      ...(text(audienceSource.demographics)
        ? { demographics: text(audienceSource.demographics) }
        : {}),
      ...(text(audienceSource.pain_points)
        ? { pain_points: text(audienceSource.pain_points) }
        : {}),
      ...(stringList(audienceSource.customer_needs, 4)
        ? { customer_needs: stringList(audienceSource.customer_needs, 4) }
        : {}),
    });
    if (audience) report.audience = audience;
  }

  const seoSource = asRecord(source.seo);
  if (seoSource) {
    const seo = compact({
      ...(text(seoSource.foundation) ? { foundation: text(seoSource.foundation) } : {}),
      ...(stringList(seoSource.key_pages, 5)
        ? { key_pages: stringList(seoSource.key_pages, 5) }
        : {}),
      ...(stringList(seoSource.conversion_paths, 3)
        ? { conversion_paths: stringList(seoSource.conversion_paths, 3) }
        : {}),
    });
    if (seo) report.seo = seo;
  }

  for (const key of ["strengths", "issues", "quick_wins", "major_projects", "expected_outcomes"] as const) {
    const list = stringList(source[key]);
    if (list) report[key] = list;
  }

  const improvements = normalizeImprovements(source.improvements);
  if (improvements) report.improvements = improvements;

  const technicalSource = asRecord(source.technical);
  if (technicalSource) {
    const recommendations = Array.isArray(technicalSource.recommendations)
      ? technicalSource.recommendations
          .map((entry) => {
            const recommendation = asRecord(entry);
            const area = text(recommendation?.area);
            const advice = text(recommendation?.recommendation);
            return area && advice ? { area, recommendation: advice } : null;
          })
          .filter((entry): entry is { area: string; recommendation: string } => entry !== null)
          .slice(0, 3)
      : undefined;
    const technical = compact({
      ...(text(technicalSource.https_status)
        ? { https_status: text(technicalSource.https_status) }
        : {}),
      ...(text(technicalSource.headers_analysis)
        ? { headers_analysis: text(technicalSource.headers_analysis) }
        : {}),
      ...(recommendations?.length ? { recommendations } : {}),
    });
    if (technical) report.technical = technical;
  }

  const qualitySource = asRecord(source.data_quality);
  if (qualitySource) {
    const dataQuality = compact({
      ...(finiteNumber(qualitySource.pages_sampled) !== undefined
        ? { pages_sampled: Math.max(0, Math.round(qualitySource.pages_sampled as number)) }
        : {}),
      ...(finiteNumber(qualitySource.aggregated_word_count) !== undefined
        ? {
            aggregated_word_count: Math.max(
              0,
              Math.round(qualitySource.aggregated_word_count as number),
            ),
          }
        : {}),
      ...(typeof qualitySource.is_js_rendered === "boolean"
        ? { is_js_rendered: qualitySource.is_js_rendered }
        : {}),
      ...(typeof qualitySource.used_fallback === "boolean"
        ? { used_fallback: qualitySource.used_fallback }
        : {}),
    });
    if (dataQuality) report.data_quality = dataQuality;
  }

  return Object.keys(report).length > 0 ? report : null;
}

function normalizeAuditedUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw || raw.length > MAX_URL || /[\u0000-\u001f\u007f]/.test(raw)) return null;
  const explicitScheme = raw.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  if (explicitScheme && explicitScheme !== "http" && explicitScheme !== "https") return null;
  try {
    const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password
    ) {
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function resolveStorage(options: StorageOptions): Storage | null {
  if (Object.prototype.hasOwnProperty.call(options, "storage")) return options.storage ?? null;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function removeSafely(storage: Storage): boolean {
  try {
    storage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

function parsePending(raw: string, now: number): PendingPublicAnalys | null {
  if (byteLength(raw) > PUBLIC_ANALYS_PENDING_MAX_BYTES) return null;
  try {
    const source = asRecord(JSON.parse(raw));
    if (
      !source ||
      source.v !== 1 ||
      (source.action !== "pdf" && source.action !== "build") ||
      typeof source.savedAt !== "number" ||
      !Number.isFinite(source.savedAt) ||
      source.savedAt > now + MAX_FUTURE_SKEW_MS ||
      now - source.savedAt > PUBLIC_ANALYS_PENDING_TTL_MS
    ) {
      return null;
    }
    const report = normalizePublicReport(source.report);
    const auditedUrl = normalizeAuditedUrl(source.auditedUrl);
    if (!report || !auditedUrl) return null;
    return {
      v: 1,
      action: source.action,
      report,
      auditedUrl,
      savedAt: source.savedAt,
    };
  } catch {
    return null;
  }
}

export function savePendingPublicAnalys(
  input: {
    action: PublicAnalysAction;
    report: PublicAnalysReport;
    auditedUrl: string;
  },
  options: StorageOptions = {},
): PendingPublicAnalys | null {
  const storage = resolveStorage(options);
  const report = normalizePublicReport(input.report);
  const auditedUrl = normalizeAuditedUrl(input.auditedUrl);
  if (!storage || !report || !auditedUrl) return null;
  const pending: PendingPublicAnalys = {
    v: 1,
    action: input.action,
    report,
    auditedUrl,
    savedAt: options.now ?? Date.now(),
  };
  const serialized = JSON.stringify(pending);
  if (byteLength(serialized) > PUBLIC_ANALYS_PENDING_MAX_BYTES) return null;
  try {
    storage.setItem(STORAGE_KEY, serialized);
    return pending;
  } catch {
    return null;
  }
}

export function readPendingPublicAnalys(options: StorageOptions = {}): PendingPublicAnalys | null {
  const storage = resolveStorage(options);
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const pending = parsePending(raw, options.now ?? Date.now());
    if (!pending) removeSafely(storage);
    return pending;
  } catch {
    return null;
  }
}

export function claimPendingPublicAnalys(
  action: PublicAnalysAction,
  options: StorageOptions = {},
): PendingPublicAnalys | null {
  const storage = resolveStorage(options);
  if (!storage) return null;
  const pending = readPendingPublicAnalys({ ...options, storage });
  if (!pending || pending.action !== action) return null;
  return removeSafely(storage) ? pending : null;
}
