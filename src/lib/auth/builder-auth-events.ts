"use client";

import { useAuthStore } from "./auth-store";
import { saveBuilderAuthDraft, type BuilderAuthDraftInput } from "./builder-auth-draft";

export const BUILDER_AUTH_REQUIRED_EVENT = "sajtmaskin:builder-auth-required";
export type BuilderAuthRequiredDetail = {
  returnTo: string;
  draftSaved: boolean;
};

/** A blocked storage getter must not turn an expected auth rejection into an API error. */
export function builderAuthStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Only for explicit app-session rejection, never a bare/provider 401.
 * Drop cached UI identity without calling logout or changing cookies.
 * No retry is scheduled: the composer keeps the unconsumed draft.
 */
export function requestBuilderAuthentication(input: Omit<BuilderAuthDraftInput, "ownerId"> = {}): void {
  const ownerId = useAuthStore.getState().user?.id ?? null;
  try {
    useAuthStore.getState().setUser(null);
  } catch {
    // Persisted UI-cache storage can itself be blocked. Still open login.
  }
  if (typeof window === "undefined") return;
  let detail: BuilderAuthRequiredDetail = { returnTo: "/builder", draftSaved: false };
  try {
    detail = saveBuilderAuthDraft(
      builderAuthStorage(), window.location.href, { ...input, ownerId }, crypto.randomUUID(),
    );
  } catch {
    // Keep the login UI reachable even when draft recovery is unavailable.
    detail.returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  }
  window.dispatchEvent(new CustomEvent<BuilderAuthRequiredDetail>(BUILDER_AUTH_REQUIRED_EVENT, { detail }));
}
