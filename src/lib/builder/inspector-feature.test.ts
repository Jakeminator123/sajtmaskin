import { afterEach, describe, expect, it } from "vitest";
import { isBuilderInspectorEnabled } from "./inspector-feature";

const ORIGINAL_SERVER = process.env.SAJTMASKIN_BUILDER_INSPECTOR;
const ORIGINAL_PUBLIC = process.env.NEXT_PUBLIC_SAJTMASKIN_BUILDER_INSPECTOR;

describe("isBuilderInspectorEnabled", () => {
  afterEach(() => {
    if (typeof ORIGINAL_SERVER === "undefined") {
      delete process.env.SAJTMASKIN_BUILDER_INSPECTOR;
    } else {
      process.env.SAJTMASKIN_BUILDER_INSPECTOR = ORIGINAL_SERVER;
    }

    if (typeof ORIGINAL_PUBLIC === "undefined") {
      delete process.env.NEXT_PUBLIC_SAJTMASKIN_BUILDER_INSPECTOR;
    } else {
      process.env.NEXT_PUBLIC_SAJTMASKIN_BUILDER_INSPECTOR = ORIGINAL_PUBLIC;
    }
  });

  it("defaults to enabled when no override is set", () => {
    delete process.env.SAJTMASKIN_BUILDER_INSPECTOR;
    delete process.env.NEXT_PUBLIC_SAJTMASKIN_BUILDER_INSPECTOR;

    expect(isBuilderInspectorEnabled()).toBe(true);
  });

  it("accepts a server-side disable flag", () => {
    process.env.SAJTMASKIN_BUILDER_INSPECTOR = "false";
    delete process.env.NEXT_PUBLIC_SAJTMASKIN_BUILDER_INSPECTOR;

    expect(isBuilderInspectorEnabled()).toBe(false);
  });

  it("lets the public flag override the server value", () => {
    process.env.SAJTMASKIN_BUILDER_INSPECTOR = "false";
    process.env.NEXT_PUBLIC_SAJTMASKIN_BUILDER_INSPECTOR = "true";

    expect(isBuilderInspectorEnabled()).toBe(true);
  });
});
