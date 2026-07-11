import { describe, expect, it } from "vitest";
import { resolveDeploySeoOptions } from "./resolve-seo";

const persisted = {
  optIn: true,
  siteUrl: "https://legacy.example.com",
  brand: { companyName: "Persisted Co" },
  lastSetAt: null,
};

describe("resolveDeploySeoOptions", () => {
  it("uses the verified project live URL instead of a submitted or legacy URL", () => {
    expect(
      resolveDeploySeoOptions(
        { optIn: true, siteUrl: "https://unverified.example.com", brand: { companyName: "New Co" } },
        persisted,
        "https://new-co.sites.sajtmaskin.se",
      ),
    ).toEqual({
      siteUrl: "https://new-co.sites.sajtmaskin.se",
      brand: { companyName: "New Co" },
    });
  });

  it("uses persisted opt-in and brand with the current project domain", () => {
    expect(
      resolveDeploySeoOptions(undefined, persisted, "https://kund.se"),
    ).toEqual({
      siteUrl: "https://kund.se",
      brand: { companyName: "Persisted Co" },
    });
  });

  it("keeps the project-specific legacy URL as rollout fallback", () => {
    expect(resolveDeploySeoOptions({ optIn: true }, persisted, null)).toEqual({
      siteUrl: "https://legacy.example.com",
      brand: { companyName: "Persisted Co" },
    });
  });

  it("uses the body fallback before persisted fallback when no canonical domain exists", () => {
    expect(
      resolveDeploySeoOptions(
        { optIn: true, siteUrl: "https://body.example" },
        persisted,
        null,
      ),
    ).toEqual({
      siteUrl: "https://body.example",
      brand: { companyName: "Persisted Co" },
    });
  });

  it("uses a body brand override with the canonical domain", () => {
    expect(
      resolveDeploySeoOptions(
        { brand: { companyName: "Body Co" } },
        persisted,
        "https://kund.se",
      ),
    ).toEqual({
      siteUrl: "https://kund.se",
      brand: { companyName: "Body Co" },
    });
  });

  it("returns null when opted in but no canonical or fallback URL exists", () => {
    expect(
      resolveDeploySeoOptions(
        { optIn: true },
        { ...persisted, siteUrl: null },
        null,
      ),
    ).toBeNull();
  });

  it("honors a body opt-out", () => {
    expect(
      resolveDeploySeoOptions({ optIn: false }, persisted, "https://kund.se"),
    ).toBeNull();
  });

  it("honors siteUrl=null as an explicit one-deploy opt-out", () => {
    expect(
      resolveDeploySeoOptions(
        { siteUrl: null },
        persisted,
        "https://kund.se",
      ),
    ).toBeNull();
  });
});
