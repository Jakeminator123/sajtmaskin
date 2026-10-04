/**
 * Litet sessionskvitto bredvid den sammanställda prompten.
 *
 * Fail-closed: hashar beskrivning/USP och kapar förhandsvisning. Rå e-post,
 * telefon, personnummer eller secret-formade token loggas inte.
 */
import crypto from "crypto";
import type { KostnadsfriFollowupAnswers } from "./agent-followups";

export const KOSTNADSFRI_WIZARD_SNAPSHOT_KEY = "wizardSnapshot";

const PREVIEW_MAX = 80;

export type KostnadsfriWizardSnapshot = {
  industryId: string | null;
  followupOverrodeIndustry: boolean;
  resolvedIndustryId: string | null;
  descriptionHash: string | null;
  uspHash: string | null;
  descriptionPreview: string | null;
  uspPreview: string | null;
};

type SnapshotWizard = {
  industry: string;
  description: string;
  usp: string;
};

function normalizeReceiptText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PERSONNUMMER_RE = /\b(?:\d{6}|\d{8})[-+]?\d{4}\b/g;
const SECRETISH_RE =
  /\b(?:sk-|pk-|rk-|api[_-]?key|bearer|secret|password|token)[=:\s]?\S+/gi;
const PHONE_RE = /(?:\+|00)?(?:46|47|45)?[\s().-]*(?:\d[\s().-]*){8,12}/g;

function redactPreview(value: string): string | null {
  const stripped = value
    .replace(EMAIL_RE, " ")
    .replace(PERSONNUMMER_RE, " ")
    .replace(SECRETISH_RE, " ")
    .replace(PHONE_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) return null;
  if (/@/.test(stripped) || /\d{8,}/.test(stripped)) return null;
  return stripped.slice(0, PREVIEW_MAX);
}

function fieldReceipt(value: string | null | undefined): {
  hash: string | null;
  preview: string | null;
} {
  const normalized = typeof value === "string" ? normalizeReceiptText(value) : "";
  if (!normalized) return { hash: null, preview: null };
  return {
    hash: sha256Hex(normalized.toLowerCase()),
    preview: redactPreview(normalized),
  };
}

function clipId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().slice(0, 80);
  return text || null;
}

export function buildKostnadsfriWizardSnapshot(
  wizard: SnapshotWizard,
  followupAnswers?: KostnadsfriFollowupAnswers | null,
): KostnadsfriWizardSnapshot {
  const answers = followupAnswers ?? {};
  const wizardIndustry = clipId(wizard.industry);
  const followupIndustry = clipId(answers.industryId);
  const resolvedIndustry = followupIndustry ?? wizardIndustry;
  const descriptionReceipt = fieldReceipt(answers.description ?? wizard.description);
  const uspReceipt = fieldReceipt(answers.usp ?? wizard.usp);
  return {
    industryId: wizardIndustry,
    followupOverrodeIndustry: Boolean(followupIndustry && followupIndustry !== wizardIndustry),
    resolvedIndustryId: resolvedIndustry,
    descriptionHash: descriptionReceipt.hash,
    uspHash: uspReceipt.hash,
    descriptionPreview: descriptionReceipt.preview,
    uspPreview: uspReceipt.preview,
  };
}

export function sanitizeKostnadsfriWizardSnapshot(
  value: unknown,
): KostnadsfriWizardSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const takeHash = (key: string): string | null => {
    if (typeof raw[key] !== "string") return null;
    return /^[a-f0-9]{64}$/i.test(raw[key]) ? raw[key].toLowerCase() : null;
  };
  const takePreview = (key: string): string | null => {
    if (typeof raw[key] !== "string") return null;
    return redactPreview(raw[key].slice(0, PREVIEW_MAX + 40));
  };
  return {
    industryId: clipId(raw.industryId),
    followupOverrodeIndustry: raw.followupOverrodeIndustry === true,
    resolvedIndustryId: clipId(raw.resolvedIndustryId),
    descriptionHash: takeHash("descriptionHash"),
    uspHash: takeHash("uspHash"),
    descriptionPreview: takePreview("descriptionPreview"),
    uspPreview: takePreview("uspPreview"),
  };
}

export function readKostnadsfriWizardSnapshotFromHandoffPayload(
  payload: unknown,
): KostnadsfriWizardSnapshot | null {
  if (!payload || typeof payload !== "object") return null;
  const raw = payload as Record<string, unknown>;
  return sanitizeKostnadsfriWizardSnapshot(raw[KOSTNADSFRI_WIZARD_SNAPSHOT_KEY]);
}
