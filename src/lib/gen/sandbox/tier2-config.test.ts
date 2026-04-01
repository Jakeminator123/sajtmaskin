import { afterEach, describe, expect, it } from "vitest";
import { getTier2RuntimeMode } from "./tier2-config";

const ORIGINAL_RUNTIME = process.env.SAJTMASKIN_TIER2_RUNTIME;
const ORIGINAL_BASE_URL = process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL;

afterEach(() => {
  if (ORIGINAL_RUNTIME === undefined) delete process.env.SAJTMASKIN_TIER2_RUNTIME;
  else process.env.SAJTMASKIN_TIER2_RUNTIME = ORIGINAL_RUNTIME;

  if (ORIGINAL_BASE_URL === undefined) delete process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL;
  else process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = ORIGINAL_BASE_URL;
});

describe("getTier2RuntimeMode", () => {
  it("uses explicit preview_host when requested", () => {
    process.env.SAJTMASKIN_TIER2_RUNTIME = "preview_host";
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://vm-fly-jakem.fly.dev";
    expect(getTier2RuntimeMode()).toBe("preview_host");
  });

  it("prefers preview_host_then_vercel when preview-host is configured and runtime is unset", () => {
    delete process.env.SAJTMASKIN_TIER2_RUNTIME;
    process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL = "https://vm-fly-jakem.fly.dev";
    expect(getTier2RuntimeMode()).toBe("preview_host_then_vercel");
  });

  it("falls back to vercel_sandbox when no preview-host base url exists", () => {
    delete process.env.SAJTMASKIN_TIER2_RUNTIME;
    delete process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL;
    expect(getTier2RuntimeMode()).toBe("vercel_sandbox");
  });
});
