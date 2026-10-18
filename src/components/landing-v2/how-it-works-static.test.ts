// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readHowItWorksStaticOnly } from "@/components/landing-v2/landing-hooks";

function stubMatchMedia(
  options: boolean | { reducedMotion?: boolean; narrow?: boolean } = false,
): typeof window.matchMedia {
  const reducedMotion = typeof options === "boolean" ? options : Boolean(options.reducedMotion);
  const narrow = typeof options === "boolean" ? false : Boolean(options.narrow);
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: query.includes("prefers-reduced-motion")
      ? reducedMotion
      : query.includes("max-width")
        ? narrow
        : false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  return original;
}

describe("how-it-works static gate", () => {
  let originalMatchMedia: typeof window.matchMedia | undefined;

  afterEach(() => {
    if (originalMatchMedia) {
      window.matchMedia = originalMatchMedia;
      originalMatchMedia = undefined;
    }
  });

  it("uses one gate for rendering and preloading the 3D scene", () => {
    const lazy = readFileSync(
      resolve(process.cwd(), "src/components/landing-v2/landing-how-it-works-lazy.tsx"),
      "utf8",
    );
    const preload = readFileSync(
      resolve(process.cwd(), "src/components/landing-v2/use-landing-controller.ts"),
      "utf8",
    );
    const call = "readHowItWorksStaticOnly(reduceMotion, saveData)";
    expect(lazy).toContain(call);
    expect(preload).toContain(call);
    expect(preload).toContain('import("./how-it-works-scene")');
  });

  it("blocks the scene on a narrow viewport even when hook flags are still false", () => {
    originalMatchMedia = stubMatchMedia({ narrow: true });
    expect(readHowItWorksStaticOnly(false, false)).toBe(true);
  });

  it("blocks the scene for reduced motion and save-data, and allows a capable desktop", () => {
    originalMatchMedia = stubMatchMedia(false);
    expect(readHowItWorksStaticOnly(false, false)).toBe(false);
    expect(readHowItWorksStaticOnly(true, false)).toBe(true);
    expect(readHowItWorksStaticOnly(false, true)).toBe(true);

    window.matchMedia = originalMatchMedia;
    originalMatchMedia = stubMatchMedia({ reducedMotion: true });
    expect(readHowItWorksStaticOnly(false, false)).toBe(true);
  });
});
