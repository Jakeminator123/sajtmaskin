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

import { configure } from "@testing-library/react";

/**
 * `waitFor` / `findBy*` deadline, raised from testing-library's 1 s default.
 *
 * 1 s is a LOAD assumption, not a correctness one: it says "one second of
 * wall clock is enough for this component to settle". That holds on an idle
 * machine and breaks in `quality-core`, where ~10 000 tests share a full
 * worker pool. A worker that loses the CPU between the act and the assertion
 * blows the deadline and reports a bogus failure on code nobody touched.
 *
 * Two files have already burned CI this way — `PreviewPanelDossiers`
 * (2026-09-08) and `PreviewPanelF3Trigger` (PR #1326, green on a plain rerun
 * with no code change) — so this is a category, not a bad test. The suite has
 * 400+ `waitFor`/`findBy*` call sites; the deadline belongs here, once, not
 * sprinkled per call site.
 *
 * A correct test costs nothing extra: `waitFor` polls and resolves the moment
 * the assertion passes. Only a genuinely failing assertion waits out the full
 * budget, and a slower honest failure beats a green suite nobody trusts.
 * `testTimeout` in `vitest.config.ts` is kept above this so the reported error
 * is testing-library's ("unable to find …"), not a bare test timeout.
 */
configure({ asyncUtilTimeout: 5000 });

class NoopObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): unknown[] {
    return [];
  }
}

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = NoopObserver as unknown as typeof ResizeObserver;
}

if (typeof globalThis.IntersectionObserver === "undefined") {
  globalThis.IntersectionObserver =
    NoopObserver as unknown as typeof IntersectionObserver;
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
