/** Short-lived, tab-local recovery for an explicitly rejected generation. No auth credentials. */
export const BUILDER_AUTH_RESUME_PARAM = "builderAuthResume";
export const BUILDER_AUTH_DRAFT_KEY = "sajtmaskin:builder-auth-draft:v1";
export const BUILDER_AUTH_DRAFT_TTL_MS = 30 * 60 * 1000;
const MAX_DRAFT_CHARS = 500_000;

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type BuilderAuthDraftInput = {
  message?: string;
  chatId?: string | null;
  projectId?: string | null;
  promptHandoffId?: string | null;
  ownerId?: string | null;
};

function builderUrl(href: string): URL {
  const url = new URL(href);
  if (url.pathname !== "/builder") throw new Error("Not a builder URL");
  return url;
}

function contextKey(url: URL): string {
  return JSON.stringify([
    url.pathname,
    url.searchParams.get("chatId"),
    url.searchParams.get("project"),
    url.searchParams.get("promptId"),
    url.searchParams.get("buildMethod"),
  ]);
}

export function isBuilderAuthResume(href: string): boolean {
  try {
    return Boolean(builderUrl(href).searchParams.get(BUILDER_AUTH_RESUME_PARAM));
  } catch {
    return false;
  }
}

export function saveBuilderAuthDraft(
  storage: DraftStorage | null,
  href: string,
  input: BuilderAuthDraftInput,
  id: string,
  now = Date.now(),
): { returnTo: string; draftSaved: boolean } {
  const url = builderUrl(href);
  const routedChatId = url.searchParams.get("chatId");
  const routedProjectId = url.searchParams.get("project");
  if (
    (routedChatId && input.chatId && routedChatId !== input.chatId) ||
    (routedProjectId && input.projectId && routedProjectId !== input.projectId)
  ) {
    // A late rejection from a previous chat must not redirect the active tab
    // back to that chat or overwrite its draft-recovery record.
    url.searchParams.set(BUILDER_AUTH_RESUME_PARAM, id);
    return { returnTo: `${url.pathname}${url.search}${url.hash}`, draftSaved: false };
  }
  if (input.chatId) url.searchParams.set("chatId", input.chatId);
  if (input.projectId) url.searchParams.set("project", input.projectId);
  if (input.promptHandoffId && !input.chatId) {
    url.searchParams.set("promptId", input.promptHandoffId);
  }
  // A return after rejection is a manual retry, never a fresh campaign auto-start.
  url.searchParams.set(BUILDER_AUTH_RESUME_PARAM, id);
  const returnTo = `${url.pathname}${url.search}${url.hash}`;
  const message = input.message;
  if (!storage || !message?.trim() || message.length > MAX_DRAFT_CHARS) {
    return { returnTo, draftSaved: false };
  }
  try {
    storage.setItem(BUILDER_AUTH_DRAFT_KEY, JSON.stringify({
      version: 1,
      id,
      createdAt: now,
      context: contextKey(url),
      ownerId: input.ownerId ?? null,
      message,
    }));
    return { returnTo, draftSaved: true };
  } catch {
    // Storage can be blocked; same-page login still preserves the mounted composer.
    return { returnTo, draftSaved: false };
  }
}

/** One-shot restore, only on the matching OAuth return, same context and same account. */
export function consumeBuilderAuthDraft(
  storage: DraftStorage | null,
  href: string,
  userId: string,
  now = Date.now(),
): string | null {
  if (!storage || !userId) return null;
  try {
    const url = builderUrl(href);
    const id = url.searchParams.get(BUILDER_AUTH_RESUME_PARAM);
    if (!id) return null;
    const raw = storage.getItem(BUILDER_AUTH_DRAFT_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const draft = value as Record<string, unknown>;
    if (draft.id !== id) return null;
    storage.removeItem(BUILDER_AUTH_DRAFT_KEY);
    if (
      draft.version !== 1 ||
      typeof draft.createdAt !== "number" ||
      !Number.isFinite(draft.createdAt) ||
      now < draft.createdAt ||
      now - draft.createdAt > BUILDER_AUTH_DRAFT_TTL_MS ||
      draft.context !== contextKey(url) ||
      (draft.ownerId !== null && draft.ownerId !== userId) ||
      typeof draft.message !== "string" ||
      !draft.message.trim() ||
      draft.message.length > MAX_DRAFT_CHARS
    ) return null;
    return draft.message;
  } catch {
    return null;
  }
}
