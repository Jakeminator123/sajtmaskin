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

  it("detects calendar from Swedish 'almanacka' and implies needsForms", () => {
    const caps = inferCapabilities("Jag vill ha en almanacka på sidan där man kan se datum");
    expect(caps.needsCalendar).toBe(true);
    expect(caps.needsForms).toBe(true);
  });

  it("detects calendar from 'boka tid' prompt", () => {
    const caps = inferCapabilities("En sida där kunder kan boka tid för klippning");
    expect(caps.needsCalendar).toBe(true);
    expect(caps.needsForms).toBe(true);
  });

  it("detects theme toggle from 'dark mode' prompt", () => {
    const caps = inferCapabilities("I want a dark mode toggle on the site");
    expect(caps.needsThemeToggle).toBe(true);
  });

  it("detects theme toggle from Swedish 'mörkt tema'", () => {
    const caps = inferCapabilities("Lägg till en knapp för att byta mellan ljust och mörkt tema");
    expect(caps.needsThemeToggle).toBe(true);
  });

  it("detects command search from 'cmd+k' prompt", () => {
    const caps = inferCapabilities("Add a cmd+k command palette for quick navigation");
    expect(caps.needsCommandSearch).toBe(true);
  });

  it("detects command search from Swedish 'sökpalett'", () => {
    const caps = inferCapabilities("Jag vill ha en sökpalett som öppnas med tangentbordsgenväg");
    expect(caps.needsCommandSearch).toBe(true);
  });

  it("capability-inference detects physics keywords", () => {
    const caps = inferCapabilities("en figur som åker omkring och studsar");
    expect(caps.needs3D).toBe(true);
    expect(caps.needsPhysics).toBe(true);
  });

  it("does not flag physics for plain 3D corner art", () => {
    const caps = inferCapabilities("en 3d-bild i hörnet");
    expect(caps.needs3D).toBe(true);
    expect(caps.needsPhysics).toBe(false);
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

  it("calendar hint includes react-day-picker and Popover", () => {
    const caps = inferCapabilities("En kalender för att välja datum");
    const hints = buildCapabilityHints(caps)!;
    expect(hints).toContain("react-day-picker");
    expect(hints).toContain("Popover");
    expect(hints).toContain("Calendar");
  });

  it("forms hint includes Calendar reference when needsCalendar is also true", () => {
    const caps = inferCapabilities("Ett bokningsformulär med kalender för att välja datum");
    expect(caps.needsCalendar).toBe(true);
    expect(caps.needsForms).toBe(true);
    const hints = buildCapabilityHints(caps)!;
    expect(hints).toContain("DatePicker pattern");
  });

  it("forms hint does NOT mention Calendar when needsCalendar is false", () => {
    const caps = inferCapabilities("A contact form with name and email");
    expect(caps.needsForms).toBe(true);
    expect(caps.needsCalendar).toBe(false);
    const hints = buildCapabilityHints(caps)!;
    expect(hints).not.toContain("DatePicker");
  });

  it("command search hint includes cmdk and Dialog", () => {
    const caps = inferCapabilities("Add a cmd+k command palette");
    const hints = buildCapabilityHints(caps)!;
    expect(hints).toContain("cmdk");
    expect(hints).toContain("Dialog");
  });

  it("theme toggle hint includes next-themes and useTheme", () => {
    const caps = inferCapabilities("Dark mode toggle on the site");
    const hints = buildCapabilityHints(caps)!;
    expect(hints).toContain("next-themes");
    expect(hints).toContain("useTheme");
  });

  it("app shell hint includes dashboard component guidance", () => {
    const caps = inferCapabilities("Build a dashboard with sidebar");
    const hints = buildCapabilityHints(caps)!;
    expect(hints).toContain("Chart");
    expect(hints).toContain("Table");
    expect(hints).toContain("Skeleton");
  });

  it("ecommerce hint includes Drawer and Dialog guidance", () => {
    const caps = inferCapabilities("An ecommerce shop with product pages");
    const hints = buildCapabilityHints(caps)!;
    expect(hints).toContain("Drawer");
    expect(hints).toContain("Dialog");
    expect(hints).toContain("Carousel");
  });

  it("3D hint warns against the reduced-motion trap and points at motion-safe:", () => {
    const caps = inferCapabilities("3d animation site with particle effects");
    const hints = buildCapabilityHints(caps)!;
    expect(hints).toContain(`motion-reduce` + `:hidden`);
    expect(hints).toContain("motion-safe:");
    expect(hints).toContain("Reduced-motion trap");
  });

  it("3D hint upgrades to rapier when physics keywords are present", () => {
    const caps = inferCapabilities("en figur som åker omkring och studsar");
    expect(caps.needsPhysics).toBe(true);
    const hints = buildCapabilityHints(caps)!;
    expect(hints).toContain("@react-three/rapier");
    expect(hints).toContain("Physics");
    expect(hints).toContain("RigidBody");
  });
});
