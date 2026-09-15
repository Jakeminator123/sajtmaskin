import type { MiniWizardData } from "@/lib/kostnadsfri";
import {
  normalizeKostnadsfriFollowupAnswers,
  type KostnadsfriFollowupAnswers,
} from "./agent-followups";

export const KOSTNADSFRI_PENDING_INIT_STORAGE_KEY = "sajtmaskin:kostnadsfri-pending-init";
export const KOSTNADSFRI_PENDING_INIT_TTL_MS = 24 * 60 * 60 * 1000;

const SLUG = /^[a-z0-9-]{1,120}$/;

export type KostnadsfriPendingInitBuild = {
  slug: string;
  wizardData: MiniWizardData;
  followupAnswers: KostnadsfriFollowupAnswers;
  savedAt: number;
  /** True only after follow-ups were skipped or answered. */
  ready: boolean;
};

type PendingStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

const memoryStorage = new Map<string, string>();

function fallbackStorage(): PendingStorage {
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

export function pendingInitBuildStorage(): PendingStorage {
  if (typeof localStorage === "undefined") return fallbackStorage();
  try {
    localStorage.getItem(KOSTNADSFRI_PENDING_INIT_STORAGE_KEY);
    return localStorage;
  } catch {
    return fallbackStorage();
  }
}

function clipText(value: unknown, max = 500): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export function normalizePendingWizardData(value: unknown): MiniWizardData | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const companyName = clipText(raw.companyName, 200);
  if (!companyName) return null;
  const purposes = Array.isArray(raw.purposes)
    ? raw.purposes
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 12)
    : [];
  return {
    companyName,
    industry: clipText(raw.industry, 80),
    website: clipText(raw.website, 300),
    location: clipText(raw.location, 200),
    description: clipText(raw.description, 2000),
    purposes,
    targetAudience: clipText(raw.targetAudience, 500),
    usp: clipText(raw.usp, 500),
    designVibe: clipText(raw.designVibe, 80),
    paletteName: clipText(raw.paletteName, 80) || null,
    colorPrimary: clipText(raw.colorPrimary, 32) || null,
    colorSecondary: clipText(raw.colorSecondary, 32) || null,
    colorAccent: clipText(raw.colorAccent, 32) || null,
  };
}

export function normalizePendingInitBuild(
  value: unknown,
  now = Date.now(),
): KostnadsfriPendingInitBuild | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const slug = typeof raw.slug === "string" ? raw.slug.trim() : "";
  if (!SLUG.test(slug)) return null;
  const wizardData = normalizePendingWizardData(raw.wizardData);
  if (!wizardData) return null;
  const savedAt = typeof raw.savedAt === "number" && Number.isFinite(raw.savedAt) ? raw.savedAt : 0;
  if (savedAt <= 0 || now - savedAt > KOSTNADSFRI_PENDING_INIT_TTL_MS) return null;
  return {
    slug,
    wizardData,
    followupAnswers: normalizeKostnadsfriFollowupAnswers(raw.followupAnswers),
    savedAt,
    ready: raw.ready === true,
  };
}

export function persistPendingInitBuild(
  input: {
    slug: string;
    wizardData: MiniWizardData;
    followupAnswers?: KostnadsfriFollowupAnswers | null;
    ready?: boolean;
  },
  storage: PendingStorage = pendingInitBuildStorage(),
  now = Date.now(),
): KostnadsfriPendingInitBuild | null {
  const pending = normalizePendingInitBuild(
    {
      slug: input.slug,
      wizardData: input.wizardData,
      followupAnswers: input.followupAnswers ?? {},
      savedAt: now,
      ready: input.ready === true,
    },
    now,
  );
  if (!pending) return null;
  try {
    storage.setItem(KOSTNADSFRI_PENDING_INIT_STORAGE_KEY, JSON.stringify(pending));
  } catch {
    return pending;
  }
  return pending;
}

export function readPendingInitBuild(
  slug: string,
  storage: PendingStorage = pendingInitBuildStorage(),
  now = Date.now(),
): KostnadsfriPendingInitBuild | null {
  try {
    const raw = storage.getItem(KOSTNADSFRI_PENDING_INIT_STORAGE_KEY);
    if (!raw) return null;
    const pending = normalizePendingInitBuild(JSON.parse(raw) as unknown, now);
    if (!pending || pending.slug !== slug) return null;
    return pending;
  } catch {
    return null;
  }
}

export function clearPendingInitBuild(
  slug?: string,
  storage: PendingStorage = pendingInitBuildStorage(),
): void {
  if (slug) {
    const current = readPendingInitBuild(slug, storage);
    if (!current) return;
  }
  try {
    storage.removeItem(KOSTNADSFRI_PENDING_INIT_STORAGE_KEY);
  } catch {
    /* privat läge */
  }
  memoryStorage.delete(KOSTNADSFRI_PENDING_INIT_STORAGE_KEY);
}

export function clearPendingInitBuildStorageForTests(
  storage: PendingStorage = pendingInitBuildStorage(),
): void {
  memoryStorage.clear();
  try {
    storage.removeItem(KOSTNADSFRI_PENDING_INIT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
