import { describe, expect, it } from "vitest";

import {
  addressKindHelp,
  addressKindLabel,
  cardAddressText,
  publishStateLabel,
} from "./site-labels";
import type { SiteAddressKind, SitePublishState } from "./project-client";

describe("addressKindLabel / addressKindHelp", () => {
  it("never presents the provider fallback as the customer's own address", () => {
    // The portal contract: a `*.vercel.app` host is a technical address. Calling
    // it "din adress" would tell the customer something untrue about their site.
    expect(addressKindLabel("provider")).toBe("Teknisk adress");
    expect(addressKindHelp("provider")).toMatch(/teknisk adress/i);
    expect(addressKindHelp("provider")).not.toMatch(/din adress/i);
  });

  it("explains what is missing when nothing is published", () => {
    expect(addressKindLabel("none")).toBe("Ingen adress än");
    expect(addressKindHelp("none")).toMatch(/publicera/i);
  });

  it("says nothing extra once the customer's own domain serves the site", () => {
    expect(addressKindLabel("custom")).toBe("Din egen domän");
    expect(addressKindHelp("custom")).toBeNull();
  });

  it("covers every address kind", () => {
    const kinds: SiteAddressKind[] = ["custom", "branded", "provider", "none"];
    for (const kind of kinds) {
      expect(addressKindLabel(kind)).toBeTruthy();
    }
  });
});

describe("cardAddressText", () => {
  it("shows the host when a live URL exists", () => {
    expect(
      cardAddressText({ liveUrl: "https://butik.example/se", kind: "custom" }),
    ).toBe("butik.example");
  });

  it("falls back to the kind label when nothing is published", () => {
    expect(cardAddressText({ liveUrl: null, kind: "none" })).toBe("Ingen adress än");
  });

  it("does not rewrite a provider host into customer-owned copy", () => {
    expect(
      cardAddressText({ liveUrl: "https://proj-abc.vercel.app", kind: "provider" }),
    ).toBe("proj-abc.vercel.app");
    expect(addressKindLabel("provider")).toBe("Teknisk adress");
  });
});

describe("publishStateLabel", () => {
  it("separates a live site from one that is still building", () => {
    expect(publishStateLabel("ready")).toEqual({ label: "Publicerad", tone: "live" });
    expect(publishStateLabel("building").tone).toBe("progress");
  });

  it("marks failed and cancelled publishes as problems, not as progress", () => {
    expect(publishStateLabel("error").tone).toBe("problem");
    expect(publishStateLabel("cancelled").tone).toBe("problem");
  });

  it("covers every publish state", () => {
    const states: SitePublishState[] = [
      "never_published",
      "pending",
      "building",
      "ready",
      "error",
      "cancelled",
    ];
    for (const state of states) {
      expect(publishStateLabel(state).label).toBeTruthy();
    }
  });
});
