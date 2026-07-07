import { describe, expect, it } from "vitest";
import { isDisallowedHost, isLoopbackHost } from "./is-disallowed-host";

describe("isDisallowedHost", () => {
  it("blocks loopback / localhost names", () => {
    expect(isDisallowedHost("localhost")).toBe(true);
    expect(isDisallowedHost("127.0.0.1")).toBe(true);
    expect(isDisallowedHost("::1")).toBe(true);
    expect(isDisallowedHost("0.0.0.0")).toBe(true);
    expect(isDisallowedHost("app.localhost")).toBe(true);
  });

  it("blocks private / reserved / metadata IP ranges", () => {
    expect(isDisallowedHost("10.10.1.1")).toBe(true);
    expect(isDisallowedHost("172.16.0.1")).toBe(true);
    expect(isDisallowedHost("192.168.0.42")).toBe(true);
    expect(isDisallowedHost("169.254.169.254")).toBe(true); // cloud metadata
    expect(isDisallowedHost("fd00::1")).toBe(true);
    expect(isDisallowedHost("fe80::1")).toBe(true);
  });

  it("allows regular public hosts", () => {
    expect(isDisallowedHost("example.com")).toBe(false);
    expect(isDisallowedHost("api.openai.com")).toBe(false);
    expect(isDisallowedHost("8.8.8.8")).toBe(false);
  });

  it("treats empty/garbage host as disallowed", () => {
    expect(isDisallowedHost("")).toBe(true);
  });
});

describe("isLoopbackHost", () => {
  it("recognizes the app's own loopback origin (dev preview)", () => {
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("127.5.5.5")).toBe(true);
    expect(isLoopbackHost("::1")).toBe(true);
    expect(isLoopbackHost("[::1]")).toBe(true);
    expect(isLoopbackHost("app.localhost")).toBe(true);
  });

  it("does NOT treat private/metadata targets as loopback", () => {
    // Security regression guard: a forged same-origin pointing at metadata /
    // private ranges must not be exempted from the SSRF guard.
    expect(isLoopbackHost("169.254.169.254")).toBe(false);
    expect(isLoopbackHost("10.0.0.1")).toBe(false);
    expect(isLoopbackHost("192.168.0.1")).toBe(false);
    expect(isLoopbackHost("0.0.0.0")).toBe(false);
    expect(isLoopbackHost("example.com")).toBe(false);
  });

  it("keeps the element-map guard combination secure", () => {
    // The route allows a target only when it is loopback OR not disallowed.
    // A forged metadata target is loopback=false AND disallowed=true => blocked.
    const metadata = "169.254.169.254";
    const allowed = isLoopbackHost(metadata) || !isDisallowedHost(metadata);
    expect(allowed).toBe(false);

    // The dev preview (loopback) stays allowed.
    const devPreview = "localhost";
    expect(isLoopbackHost(devPreview) || !isDisallowedHost(devPreview)).toBe(true);
  });
});
