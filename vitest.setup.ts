/**
 * Global test setup (jsdom).
 *
 * jsdom does not implement the layout/observation APIs that the
 * `@shadcn/react` MessageScroller primitive relies on (ResizeObserver,
 * IntersectionObserver, element scroll methods). Without these, any component
 * test that mounts the builder chat (`Conversation` → MessageScroller) throws.
 *
 * These are minimal, non-destructive polyfills: each is installed only when the
 * environment does not already provide it, so a real implementation (or a
 * per-test mock) always wins.
 */

class NoopObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): unknown[] {
    return [];
  }
}

if (typeof globalThis.ResizeObserver === "undefined") {
  // @ts-expect-error - assigning a minimal polyfill onto the global
  globalThis.ResizeObserver = NoopObserver;
}

if (typeof globalThis.IntersectionObserver === "undefined") {
  // @ts-expect-error - assigning a minimal polyfill onto the global
  globalThis.IntersectionObserver = NoopObserver;
}

if (typeof Element !== "undefined") {
  if (typeof Element.prototype.scrollTo !== "function") {
    Element.prototype.scrollTo = function scrollTo(): void {};
  }
  if (typeof Element.prototype.scrollIntoView !== "function") {
    Element.prototype.scrollIntoView = function scrollIntoView(): void {};
  }
}

if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
