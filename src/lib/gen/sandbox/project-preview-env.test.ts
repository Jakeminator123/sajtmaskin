import { describe, expect, it } from "vitest";
import { buildProjectPreviewPlaceholderRecord } from "./project-preview-env";

describe("buildProjectPreviewPlaceholderRecord", () => {
  it("returns empty record for blank id", () => {
    expect(buildProjectPreviewPlaceholderRecord("")).toEqual({});
    expect(buildProjectPreviewPlaceholderRecord(null)).toEqual({});
  });

  it("is deterministic per project id and uses lowercase alnum tokens", () => {
    const a = buildProjectPreviewPlaceholderRecord("proj_abc");
    const b = buildProjectPreviewPlaceholderRecord("proj_abc");
    const c = buildProjectPreviewPlaceholderRecord("proj_xyz");
    expect(a).toEqual(b);
    expect(a.NEXT_PUBLIC_SAJTMASKIN_PROJECT_ID).toBe("proj_abc");
    expect(a.SAJTMASKIN_APP_PROJECT_ID).toBe("proj_abc");
    expect(a.PREVIEW_PROJECT_SECRET).toMatch(/^[a-z0-9]{16}$/);
    expect(a.PREVIEW_API_KEY).toMatch(/^pk_[a-z0-9]{12}$/);
    expect(c.PREVIEW_PROJECT_SECRET).not.toBe(a.PREVIEW_PROJECT_SECRET);
  });
});
