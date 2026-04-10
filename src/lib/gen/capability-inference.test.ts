import { describe, expect, it } from "vitest";
import {
  inferCapabilities,
  buildCapabilityHints,
} from "./capability-inference";

describe("inferCapabilities", () => {
  it("detects app-like cinematic 3D website prompts in Swedish", () => {
    const caps = inferCapabilities(
      "Jag vill ha en hemsida som är mycket app-lik med en massa coola 3dsaker och filmisk neon-känsla.",
    );

    expect(caps.needs3D).toBe(true);
    expect(caps.needsMotion).toBe(true);
    expect(caps.needsAppShell).toBe(true);
    expect(caps.needsPremiumVisuals).toBe(true);
  });

  it("detects carousel + charts from a mixed prompt", () => {
    const caps = inferCapabilities(
      "Jag vill ha en portfolio med karusell för bilder och statistik-grafer.",
    );
    expect(caps.needsCarousel).toBe(true);
    expect(caps.needsCharts).toBe(true);
  });

  it("detects forms + ecommerce without false positives on hospitality", () => {
    const caps = inferCapabilities("Build a webshop with a checkout form and product pages");
    expect(caps.needsEcommerce).toBe(true);
    expect(caps.needsForms).toBe(true);
  });
});

describe("buildCapabilityHints (pack-based)", () => {
  it("returns null for empty capabilities", () => {
    const caps = inferCapabilities("en enkel hemsida");
    expect(buildCapabilityHints(caps)).toBeNull();
  });

  it("suppresses motion hint when 3D is active", () => {
    const caps = inferCapabilities("3d animation site with particle effects");
    expect(caps.needs3D).toBe(true);
    expect(caps.needsMotion).toBe(true);
    const hints = buildCapabilityHints(caps)!;
    expect(hints).toContain("3D/WebGL");
    expect(hints).not.toContain("Motion/animation requested");
  });

  it("includes motion hint when 3D is not active", () => {
    const caps = inferCapabilities("a landing page with parallax scroll effects");
    expect(caps.needsMotion).toBe(true);
    expect(caps.needs3D).toBe(false);
    const hints = buildCapabilityHints(caps)!;
    expect(hints).toContain("Motion/animation requested");
  });

  it("generates hints for previously uncovered capabilities", () => {
    const appShellCaps = inferCapabilities("Build a dashboard with sidebar navigation");
    expect(buildCapabilityHints(appShellCaps)).toContain("App shell");

    const dataUiCaps = inferCapabilities("A data table with sorting and pagination");
    expect(buildCapabilityHints(dataUiCaps)).toContain("Data table");

    const ecommerceCaps = inferCapabilities("An ecommerce storefront with a cart");
    expect(buildCapabilityHints(ecommerceCaps)).toContain("E-commerce");
  });
});

