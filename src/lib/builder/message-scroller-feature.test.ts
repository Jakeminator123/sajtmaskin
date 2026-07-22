import { afterEach, describe, expect, it } from "vitest";
import { isMessageScrollerEnabled } from "./message-scroller-feature";

const ORIGINAL_SERVER = process.env.SAJTMASKIN_MESSAGE_SCROLLER;
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
    restore("SAJTMASKIN_MESSAGE_SCROLLER", ORIGINAL_SERVER);
    restore("NEXT_PUBLIC_SAJTMASKIN_MESSAGE_SCROLLER", ORIGINAL_PUBLIC);
  });

  it("defaults to enabled when no override is set", () => {
    delete process.env.SAJTMASKIN_MESSAGE_SCROLLER;
    delete process.env.NEXT_PUBLIC_SAJTMASKIN_MESSAGE_SCROLLER;

    expect(isMessageScrollerEnabled()).toBe(true);
  });

  it("accepts a server-side disable flag", () => {
    process.env.SAJTMASKIN_MESSAGE_SCROLLER = "false";
    delete process.env.NEXT_PUBLIC_SAJTMASKIN_MESSAGE_SCROLLER;

    expect(isMessageScrollerEnabled()).toBe(false);
  });

  it("treats 0/off as disabled", () => {
    delete process.env.NEXT_PUBLIC_SAJTMASKIN_MESSAGE_SCROLLER;
    process.env.SAJTMASKIN_MESSAGE_SCROLLER = "0";
    expect(isMessageScrollerEnabled()).toBe(false);
    process.env.SAJTMASKIN_MESSAGE_SCROLLER = "off";
    expect(isMessageScrollerEnabled()).toBe(false);
  });

  it("lets the public flag override the server value", () => {
    process.env.SAJTMASKIN_MESSAGE_SCROLLER = "false";
    process.env.NEXT_PUBLIC_SAJTMASKIN_MESSAGE_SCROLLER = "true";

    expect(isMessageScrollerEnabled()).toBe(true);
  });

  it("public disable overrides server enable", () => {
    process.env.SAJTMASKIN_MESSAGE_SCROLLER = "true";
    process.env.NEXT_PUBLIC_SAJTMASKIN_MESSAGE_SCROLLER = "0";

    expect(isMessageScrollerEnabled()).toBe(false);
  });
});
