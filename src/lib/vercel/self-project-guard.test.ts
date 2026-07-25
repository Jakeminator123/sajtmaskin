import { afterEach, describe, expect, it } from "vitest";
import {
  getSelfVercelProjectId,
  isSelfVercelProject,
} from "@/lib/vercel/self-project-guard";

const ORIGINAL = process.env.VERCEL_PROJECT_ID;

afterEach(() => {
  if (ORIGINAL === undefined) {
    delete process.env.VERCEL_PROJECT_ID;
  } else {
    process.env.VERCEL_PROJECT_ID = ORIGINAL;
  }
});

describe("self-project guard", () => {
  it("recognises Sajtmaskin's own project id", () => {
    process.env.VERCEL_PROJECT_ID = "prj_own";
    expect(getSelfVercelProjectId()).toBe("prj_own");
    expect(isSelfVercelProject("prj_own")).toBe(true);
  });

  it("ignores case and surrounding whitespace", () => {
    process.env.VERCEL_PROJECT_ID = "prj_Own";
    expect(isSelfVercelProject(" PRJ_OWN ")).toBe(true);
  });

  it("does not protect other projects", () => {
    process.env.VERCEL_PROJECT_ID = "prj_own";
    expect(isSelfVercelProject("prj_customer")).toBe(false);
  });

  it("protects nothing when the env var is unset, and never matches empty input", () => {
    delete process.env.VERCEL_PROJECT_ID;
    expect(getSelfVercelProjectId()).toBeNull();
    expect(isSelfVercelProject("prj_own")).toBe(false);

    process.env.VERCEL_PROJECT_ID = "prj_own";
    expect(isSelfVercelProject("")).toBe(false);
    expect(isSelfVercelProject(null)).toBe(false);
    expect(isSelfVercelProject(undefined)).toBe(false);
  });
});
