import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PUBLIC_CANONICAL_HOST,
  PUBLIC_CANONICAL_ORIGIN,
  allowsPublicSearchIndexing,
  canonicalPublicUrlForDuplicateHost,
  isCanonicalPublicHost,
  isDuplicatePublicAliasHost,
  publicCanonicalPath,
  publicIndexRobots,
  publicPageAlternates,
  shouldRedirectDuplicatePublicPath,
} from "./public-canonical-url";

describe("public canonical host helpers", () => {
  it("treats only sajtmaskin.se as the canonical host", () => {
    expect(isCanonicalPublicHost("sajtmaskin.se")).toBe(true);
    expect(isCanonicalPublicHost("SAJTMASKIN.SE.")).toBe(true);
    expect(isCanonicalPublicHost("www.sajtmaskin.se")).toBe(false);
    expect(isCanonicalPublicHost("sajtmaskin.vercel.app")).toBe(false);
  });

  it("treats only the production Vercel alias as a duplicated public host", () => {
    expect(isDuplicatePublicAliasHost("sajtmaskin.vercel.app")).toBe(true);
    expect(isDuplicatePublicAliasHost("Sajtmaskin.Vercel.App.")).toBe(true);
    expect(isDuplicatePublicAliasHost("sajtmaskin-git-preview-jakeminator123s-projects.vercel.app")).toBe(
      false,
    );
    expect(
      isDuplicatePublicAliasHost("sajtmaskin-abc12def34-jakeminator123s-projects.vercel.app"),
    ).toBe(false);
    expect(isDuplicatePublicAliasHost("preview.sajtmaskin.se")).toBe(false);
    expect(isDuplicatePublicAliasHost("localhost")).toBe(false);
    expect(isDuplicatePublicAliasHost("sajtmaskin.vercel.app.evil.example")).toBe(false);
  });

  it("keeps machine and registry contracts on the alias host", () => {
    expect(shouldRedirectDuplicatePublicPath("/foo")).toBe(true);
    expect(shouldRedirectDuplicatePublicPath("/sitemap.xml")).toBe(true);
    expect(shouldRedirectDuplicatePublicPath("/robots.txt")).toBe(true);
    expect(shouldRedirectDuplicatePublicPath("/api")).toBe(false);
    expect(shouldRedirectDuplicatePublicPath("/api/projects")).toBe(false);
    expect(shouldRedirectDuplicatePublicPath("/r/button.json")).toBe(false);
    expect(shouldRedirectDuplicatePublicPath("/.well-known/acme-challenge/x")).toBe(false);
  });

  it("builds absolute sajtmaskin.se canonicals without collapsing children to /", () => {
    expect(publicCanonicalPath()).toBe(PUBLIC_CANONICAL_ORIGIN);
    expect(publicCanonicalPath("/")).toBe(PUBLIC_CANONICAL_ORIGIN);
    expect(publicCanonicalPath("/om")).toBe(`${PUBLIC_CANONICAL_ORIGIN}/om`);
    expect(publicPageAlternates("/faq")).toEqual({
      canonical: `${PUBLIC_CANONICAL_ORIGIN}/faq`,
    });
  });
});

describe("canonicalPublicUrlForDuplicateHost", () => {
  it("redirects the duplicated host while preserving path and query", () => {
    const next = canonicalPublicUrlForDuplicateHost(
      new URL("https://sajtmaskin.vercel.app/foo?a=1&b=2"),
    );
    expect(next?.toString()).toBe("https://sajtmaskin.se/foo?a=1&b=2");
  });

  it("does not redirect the canonical host (loop guard)", () => {
    expect(
      canonicalPublicUrlForDuplicateHost(new URL("https://sajtmaskin.se/foo?a=1")),
    ).toBeNull();
  });

  it("does not redirect preview or local hosts", () => {
    expect(
      canonicalPublicUrlForDuplicateHost(
        new URL("https://sajtmaskin-git-preview-jakeminator123s-projects.vercel.app/foo?a=1"),
      ),
    ).toBeNull();
    expect(
      canonicalPublicUrlForDuplicateHost(new URL("https://preview.sajtmaskin.se/foo?a=1")),
    ).toBeNull();
    expect(canonicalPublicUrlForDuplicateHost(new URL("http://127.0.0.1:3999/foo?a=1"))).toBeNull();
  });

  it("does not redirect API or registry paths on the alias", () => {
    expect(
      canonicalPublicUrlForDuplicateHost(new URL("https://sajtmaskin.vercel.app/api/projects")),
    ).toBeNull();
    expect(
      canonicalPublicUrlForDuplicateHost(new URL("https://sajtmaskin.vercel.app/r/button.json")),
    ).toBeNull();
  });

  it("forces https on the canonical host and drops an explicit port", () => {
    const next = canonicalPublicUrlForDuplicateHost(
      new URL("http://sajtmaskin.vercel.app:443/om?ref=nav"),
    );
    expect(next?.protocol).toBe("https:");
    expect(next?.hostname).toBe(PUBLIC_CANONICAL_HOST);
    expect(next?.port).toBe("");
    expect(next?.pathname).toBe("/om");
    expect(next?.search).toBe("?ref=nav");
  });
});

describe("public search indexing gate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows indexing only on Vercel production", () => {
    expect(allowsPublicSearchIndexing("production")).toBe(true);
    expect(allowsPublicSearchIndexing("preview")).toBe(false);
    expect(allowsPublicSearchIndexing("development")).toBe(false);
    expect(allowsPublicSearchIndexing(undefined)).toBe(false);
    expect(publicIndexRobots()).toEqual({ index: false, follow: false });

    vi.stubEnv("VERCEL_ENV", "production");
    expect(publicIndexRobots()).toEqual({ index: true, follow: true });
  });
});
