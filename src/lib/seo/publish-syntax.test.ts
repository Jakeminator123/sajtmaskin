import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectTextFile } from "@/lib/gen/scaffolds/seo-defaults";

const deterministic = vi.hoisted(() => vi.fn());
const copy = vi.hoisted(() => vi.fn());
vi.mock("./improve", async (original) => ({
  ...(await original<object>()),
  applyDeterministicSeoImprovements: deterministic,
}));
vi.mock("./llm-copy", () => ({ improveSeoCopyWithLlm: copy }));
import { runSeoPublishPass } from "./index";

const files: ProjectTextFile[] = [
  {
    name: "app/layout.tsx",
    content:
      'export const metadata = { title: "Tekosom", description: "Production, small batches" }; export default function Layout() { return <html lang="en"><body /></html>; }',
  },
];
const broken = [
  { name: "app/layout.tsx", content: 'export const metadata = { description: "Production,\n };' },
];
beforeEach(() => {
  vi.clearAllMocks();
  deterministic.mockReturnValue({ files, improvements: [] });
});

describe("publish syntax rollback", () => {
  it("rolls back deterministic syntax corruption before asking the copy model", async () => {
    deterministic.mockReturnValueOnce({
      files: broken,
      improvements: [{ findingId: "missing-open-graph", file: "app/layout.tsx" }],
    });
    const result = await runSeoPublishPass(files, {
      siteUrl: "https://example.test",
      copyModelId: "test",
    });
    expect(result.files).toBe(files);
    expect(result.report.improvements).toEqual([]);
    expect(result.report.llmSkippedReason).toBe("seo_pass_error");
    expect(copy).not.toHaveBeenCalled();
  });

  it("rolls back all SEO edits when copy output is invalid", async () => {
    copy.mockResolvedValueOnce({ files: broken, improvements: [], skippedReason: null });
    const result = await runSeoPublishPass(files, {
      siteUrl: "https://example.test",
      copyModelId: "test",
    });
    expect(result.files).toBe(files);
    expect(result.report.after).toEqual(result.report.before);
    expect(result.report.llmSkippedReason).toBe("seo_pass_error");
  });

  it("checks newly added code files, not only modified layouts", async () => {
    deterministic.mockReturnValueOnce({
      files: [...files, { name: "app/robots.ts", content: "export default function robots( {" }],
      improvements: [],
    });
    const result = await runSeoPublishPass(files, { siteUrl: "https://example.test" });
    expect(result.files).toBe(files);
    expect(result.report.llmSkippedReason).toBe("seo_pass_error");
  });
});
