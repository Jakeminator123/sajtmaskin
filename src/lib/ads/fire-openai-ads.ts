import { hasAcceptedCookieConsent } from "@/lib/ads/fire-google-ads-conversion";
import { isAdminAppPath, isOpenAiAdsEnabled } from "@/lib/ads/openai-ads";

export type OpenAiOrderContents = {
  id: string;
  name: string;
  content_type: "product";
  quantity: number;
};

export type OpenAiOrderCreatedInput = {
  eventId: string;
  amount?: number;
  currency?: string;
  contents?: OpenAiOrderContents[];
};

const STORAGE_PREFIX = "sajtmaskin:openai-ads:";
const REGISTRATION_EVENT = "registration_completed";
const ORDER_EVENT = "order_created";

declare global {
  interface Window {
    sajtmaskinOpenAiAdsTransientState?: {
      pendingRegistration: boolean;
      claimedRegistration: boolean;
      pendingOrders: Record<string, OpenAiOrderCreatedInput>;
      claimedOrders: Set<string>;
    };
  }
}

function localStore(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function sessionStore(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function storageGet(storage: Storage | null, key: string): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(storage: Storage | null, key: string, value: string): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function storageRemove(storage: Storage | null, key: string): void {
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function transientState() {
  if (typeof window === "undefined") return undefined;
  return (window.sajtmaskinOpenAiAdsTransientState ??= {
    pendingRegistration: false,
    claimedRegistration: false,
    pendingOrders: {},
    claimedOrders: new Set<string>(),
  });
}

function registrationEventId(explicit?: string): string {
  const key = `${STORAGE_PREFIX}registration-event-id`;
  if (explicit?.trim()) {
    storageSet(localStore(), key, explicit.trim());
    return explicit.trim();
  }
  const existing = storageGet(localStore(), key);
  if (existing) return existing;
  const generated =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `reg_${Date.now().toString(36)}`;
  storageSet(localStore(), key, generated);
  return generated;
}

export function syncOpenAiAdsConsent(): void {
  if (typeof window === "undefined") return;
  if (typeof window.oaiq !== "function") return;
  try {
    window.oaiq("consent", hasAcceptedCookieConsent());
  } catch {
    /* tag may throw before the remote script is ready */
  }
}

export function isOpenAiRegistrationClaimed(): boolean {
  return (
    storageGet(localStore(), `${STORAGE_PREFIX}claimed:${REGISTRATION_EVENT}`) === "1" ||
    transientState()?.claimedRegistration === true
  );
}

export function isOpenAiRegistrationPending(): boolean {
  return (
    !isOpenAiRegistrationClaimed() &&
    (storageGet(localStore(), `${STORAGE_PREFIX}pending:${REGISTRATION_EVENT}`) === "1" ||
      transientState()?.pendingRegistration === true)
  );
}

export function isOpenAiOrderClaimed(eventId: string): boolean {
  if (!eventId) return false;
  return (
    storageGet(localStore(), `${STORAGE_PREFIX}claimed:order:${eventId}`) === "1" ||
    transientState()?.claimedOrders.has(eventId) === true
  );
}

export function isOpenAiOrderPending(eventId: string): boolean {
  if (!eventId || isOpenAiOrderClaimed(eventId)) return false;
  return (
    storageGet(sessionStore(), `${STORAGE_PREFIX}pending:order:${eventId}`) != null ||
    Boolean(transientState()?.pendingOrders[eventId])
  );
}

function canSendOpenAiAds(): boolean {
  if (typeof window === "undefined") return false;
  if (!isOpenAiAdsEnabled()) return false;
  if (!hasAcceptedCookieConsent()) return false;
  if (isAdminAppPath(window.location.pathname)) return false;
  if (typeof window.oaiq !== "function") return false;
  if (window.sajtmaskinOpenAiAdsTagLoaded !== true) return false;
  return true;
}

function markRegistrationPending(): void {
  if (!storageSet(localStore(), `${STORAGE_PREFIX}pending:${REGISTRATION_EVENT}`, "1")) {
    const state = transientState();
    if (state) state.pendingRegistration = true;
  }
}

function markRegistrationClaimed(): void {
  if (!storageSet(localStore(), `${STORAGE_PREFIX}claimed:${REGISTRATION_EVENT}`, "1")) {
    const state = transientState();
    if (state) state.claimedRegistration = true;
  }
  const state = transientState();
  if (state) state.pendingRegistration = false;
  storageRemove(localStore(), `${STORAGE_PREFIX}pending:${REGISTRATION_EVENT}`);
}

function markOrderPending(input: OpenAiOrderCreatedInput): void {
  const serialized = JSON.stringify(input);
  if (!storageSet(sessionStore(), `${STORAGE_PREFIX}pending:order:${input.eventId}`, serialized)) {
    const state = transientState();
    if (state) state.pendingOrders[input.eventId] = input;
  }
}

function markOrderClaimed(eventId: string): void {
  if (!storageSet(localStore(), `${STORAGE_PREFIX}claimed:order:${eventId}`, "1")) {
    transientState()?.claimedOrders.add(eventId);
  }
  const state = transientState();
  if (state) delete state.pendingOrders[eventId];
  storageRemove(sessionStore(), `${STORAGE_PREFIX}pending:order:${eventId}`);
}

function readPendingOrder(eventId: string): OpenAiOrderCreatedInput | null {
  const raw = storageGet(sessionStore(), `${STORAGE_PREFIX}pending:order:${eventId}`);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as OpenAiOrderCreatedInput;
      if (parsed && parsed.eventId === eventId) return parsed;
    } catch {
      /* ignore */
    }
  }
  return transientState()?.pendingOrders[eventId] ?? null;
}

function pendingOrderIds(): string[] {
  const ids = new Set<string>();
  const storage = sessionStore();
  if (storage) {
    try {
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (key?.startsWith(`${STORAGE_PREFIX}pending:order:`)) {
          ids.add(key.slice(`${STORAGE_PREFIX}pending:order:`.length));
        }
      }
    } catch {
      /* ignore */
    }
  }
  for (const id of Object.keys(transientState()?.pendingOrders ?? {})) {
    ids.add(id);
  }
  return [...ids];
}

export function fireOpenAiRegistrationCompleted(eventId?: string): boolean {
  if (isOpenAiRegistrationClaimed()) {
    const state = transientState();
    if (state) state.pendingRegistration = false;
    storageRemove(localStore(), `${STORAGE_PREFIX}pending:${REGISTRATION_EVENT}`);
    return false;
  }
  if (!canSendOpenAiAds()) return false;
  if (typeof window.oaiq !== "function") return false;
  const id = registrationEventId(eventId);
  try {
    window.oaiq(
      "measure",
      REGISTRATION_EVENT,
      { type: "customer_action" },
      { event_id: id },
    );
  } catch {
    return false;
  }
  markRegistrationClaimed();
  return true;
}

export function noteOpenAiRegistrationCompleted(eventId?: string): void {
  if (isOpenAiRegistrationClaimed()) return;
  if (eventId?.trim()) registrationEventId(eventId);
  markRegistrationPending();
  fireOpenAiRegistrationCompleted(eventId);
}

/** Capture the callback snapshot before a route removes signup from the URL. */
export function noteOpenAiRegistrationIfSignup(signup: string | null): void {
  if (signup === "1") noteOpenAiRegistrationCompleted();
}

export function noteOpenAiRegistrationFromLocation(
  search: string = typeof window !== "undefined" ? window.location.search : "",
): void {
  const params = new URLSearchParams(
    search.startsWith("?") || search.length === 0 ? search : `?${search}`,
  );
  noteOpenAiRegistrationIfSignup(params.get("signup"));
}

export function fireOpenAiOrderCreated(input: OpenAiOrderCreatedInput): boolean {
  const eventId = input.eventId.trim();
  if (!eventId) return false;
  if (isOpenAiOrderClaimed(eventId)) {
    const state = transientState();
    if (state) delete state.pendingOrders[eventId];
    storageRemove(sessionStore(), `${STORAGE_PREFIX}pending:order:${eventId}`);
    return false;
  }
  if (!canSendOpenAiAds()) return false;
  if (typeof window.oaiq !== "function") return false;

  const data: Record<string, unknown> = { type: "contents" };
  if (typeof input.amount === "number" && Number.isFinite(input.amount)) {
    data.amount = Math.round(input.amount);
  }
  if (input.currency) data.currency = input.currency;
  if (input.contents?.length) data.contents = input.contents;

  try {
    window.oaiq("measure", ORDER_EVENT, data, { event_id: eventId });
  } catch {
    return false;
  }
  markOrderClaimed(eventId);
  return true;
}

export function noteOpenAiOrderCreated(input: OpenAiOrderCreatedInput): void {
  const eventId = input.eventId.trim();
  if (!eventId || isOpenAiOrderClaimed(eventId)) return;
  markOrderPending({ ...input, eventId });
  fireOpenAiOrderCreated({ ...input, eventId });
}

export function hasPendingOpenAiAdsEvents(): boolean {
  return isOpenAiRegistrationPending() || pendingOrderIds().some((id) => isOpenAiOrderPending(id));
}

export function flushPendingOpenAiAdsEvents(): void {
  if (isOpenAiRegistrationPending()) {
    fireOpenAiRegistrationCompleted();
  }
  for (const eventId of pendingOrderIds()) {
    const pending = readPendingOrder(eventId);
    if (pending) fireOpenAiOrderCreated(pending);
  }
}

