const STORAGE_KEY = "sajtmaskin:pending-builder-draft";
const MAX_AGE_MS = 30 * 60 * 1000;
const MAX_TEXT_CHARS = 20_000;

export type PendingBuilderDraft = {
  text: string;
  returnTo: string;
  /** Public http(s) URLs only. Local `File` objects are not serializable. */
  attachmentUrls: string[];
  savedAt: number;
};

export function currentBuilderReturnTo(): string {
  if (typeof window === "undefined") return "/builder";
  const path = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  return path.startsWith("/") ? path : "/builder";
}

export function googleOAuthStartHref(returnTo: string): string {
  return `/api/auth/google?redirect=${encodeURIComponent(returnTo)}`;
}

export function serializeAttachmentUrls(
  attachments?: Array<{ url?: string | null } | null> | null,
): string[] {
  if (!attachments?.length) return [];
  const urls: string[] = [];
  for (const attachment of attachments) {
    const url = typeof attachment?.url === "string" ? attachment.url.trim() : "";
    if (/^https?:\/\//i.test(url)) urls.push(url);
  }
  return urls;
}

function parseReturnTo(returnTo: string): URL | null {
  try {
    return new URL(returnTo, "https://sajtmaskin.local");
  } catch {
    return null;
  }
}

export function builderDraftMatchesContext(draftReturnTo: string, currentReturnTo: string): boolean {
  const draft = parseReturnTo(draftReturnTo);
  const current = parseReturnTo(currentReturnTo);
  if (!draft || !current) return false;
  if (draft.pathname !== current.pathname) return false;
  return (
    draft.searchParams.get("project") === current.searchParams.get("project") &&
    draft.searchParams.get("chatId") === current.searchParams.get("chatId")
  );
}

function readStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function readPendingBuilderDraft(now: number = Date.now()): PendingBuilderDraft | null {
  const storage = readStorage();
  if (!storage) return null;
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PendingBuilderDraft>;
    const text = typeof parsed.text === "string" ? parsed.text : "";
    const returnTo = typeof parsed.returnTo === "string" ? parsed.returnTo : "";
    const savedAt = typeof parsed.savedAt === "number" ? parsed.savedAt : 0;
    const attachmentUrls = Array.isArray(parsed.attachmentUrls)
      ? parsed.attachmentUrls.filter(
          (url): url is string => typeof url === "string" && /^https?:\/\//i.test(url),
        )
      : [];
    if (!text.trim() || !returnTo.startsWith("/") || now - savedAt > MAX_AGE_MS) {
      storage.removeItem(STORAGE_KEY);
      return null;
    }
    return { text, returnTo, attachmentUrls, savedAt };
  } catch {
    storage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function savePendingBuilderDraft(input: {
  text: string;
  returnTo?: string;
  attachmentUrls?: string[];
  now?: number;
}): PendingBuilderDraft | null {
  const storage = readStorage();
  if (!storage) return null;
  const text = input.text.trim().slice(0, MAX_TEXT_CHARS);
  if (!text) return null;
  const draft: PendingBuilderDraft = {
    text,
    returnTo: input.returnTo?.trim() || currentBuilderReturnTo(),
    attachmentUrls: (input.attachmentUrls ?? []).filter((url) => /^https?:\/\//i.test(url)),
    savedAt: input.now ?? Date.now(),
  };
  storage.setItem(STORAGE_KEY, JSON.stringify(draft));
  return draft;
}

export function touchPendingBuilderDraftReturnTo(returnTo: string): PendingBuilderDraft | null {
  const existing = readPendingBuilderDraft();
  if (!existing) return null;
  return savePendingBuilderDraft({
    text: existing.text,
    returnTo,
    attachmentUrls: existing.attachmentUrls,
    now: existing.savedAt,
  });
}

export function clearPendingBuilderDraft(): void {
  readStorage()?.removeItem(STORAGE_KEY);
}

export function consumeMatchingPendingBuilderDraft(
  currentReturnTo: string,
  now: number = Date.now(),
): PendingBuilderDraft | null {
  const draft = readPendingBuilderDraft(now);
  if (!draft || !builderDraftMatchesContext(draft.returnTo, currentReturnTo)) {
    return null;
  }
  clearPendingBuilderDraft();
  return draft;
}
