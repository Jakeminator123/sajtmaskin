import { afterEach, describe, expect, it } from "vitest";
import { isMessageScrollerEnabled } from "./message-scroller-feature";

const ORIGINAL_PUBLIC = process.env.NEXT_PUBLIC_SAJTMASKIN_MESSAGE_SCROLLER;

function restore(key: string, original: string | undefined) {
  if (typeof original === "undefined") {
    delete process.env[key];
  } else {
    process.env[key] = original;
  }
}

describe("isMessageScrollerEnabled", () => {
  afterEach(() => {
    restore("NEXT_PUBLIC_SAJTMASKIN_MESSAGE_SCROLLER", ORIGINAL_PUBLIC);
  });

  it("defaults to enabled when no override is set", () => {
    delete process.env.NEXT_PUBLIC_SAJTMASKIN_MESSAGE_SCROLLER;

    expect(isMessageScrollerEnabled()).toBe(true);
  });

  it("treats 0/false/off as disabled", () => {
    process.env.NEXT_PUBLIC_SAJTMASKIN_MESSAGE_SCROLLER = "0";
    expect(isMessageScrollerEnabled()).toBe(false);
    process.env.NEXT_PUBLIC_SAJTMASKIN_MESSAGE_SCROLLER = "false";
    expect(isMessageScrollerEnabled()).toBe(false);
    process.env.NEXT_PUBLIC_SAJTMASKIN_MESSAGE_SCROLLER = "off";
    expect(isMessageScrollerEnabled()).toBe(false);
  });

  it("treats affirmative values as enabled", () => {
    process.env.NEXT_PUBLIC_SAJTMASKIN_MESSAGE_SCROLLER = "1";
    expect(isMessageScrollerEnabled()).toBe(true);
    process.env.NEXT_PUBLIC_SAJTMASKIN_MESSAGE_SCROLLER = "true";
    expect(isMessageScrollerEnabled()).toBe(true);
  });

  it("ignores the legacy server-only variable (client-read flag must be build-inlined)", () => {
    // A server-only env var is invisible in the browser bundle; honoring it
    // would make SSR and client render different trees (hydration mismatch).
    process.env.SAJTMASKIN_MESSAGE_SCROLLER = "false";
    delete process.env.NEXT_PUBLIC_SAJTMASKIN_MESSAGE_SCROLLER;
    try {
      expect(isMessageScrollerEnabled()).toBe(true);
    } finally {
      delete process.env.SAJTMASKIN_MESSAGE_SCROLLER;
    }
  });
});
