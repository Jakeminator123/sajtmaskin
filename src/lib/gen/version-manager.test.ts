import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/chat-repository-pg", () => ({
  getPreferredVersion: vi.fn(),
  getLatestVersion: vi.fn(),
  getVersionById: vi.fn(),
  getKnownBrokenImageReplacements: vi.fn(),
  updateVersionFiles: vi.fn(),
}));

import {
  getKnownBrokenImageReplacements,
  getLatestVersion,
  getPreferredVersion,
  getVersionById,
  updateVersionFiles,
} from "@/lib/db/chat-repository-pg";
import {
  mergePackageJsonContent,
  mergeVersionFilesWithWarnings,
  resolveChatPreferredVersionId,
  resolveFollowUpPreviousFiles,
} from "./version-manager";
import type { CodeFile } from "./parser";

const getPreferredVersionMock = vi.mocked(getPreferredVersion);
const getLatestVersionMock = vi.mocked(getLatestVersion);
const getVersionByIdMock = vi.mocked(getVersionById);
const getKnownBrokenImageReplacementsMock = vi.mocked(getKnownBrokenImageReplacements);
const updateVersionFilesMock = vi.mocked(updateVersionFiles);

const file = (path: string, content: string): CodeFile => ({
  path,
  content,
  language: "tsx",
});

describe("mergePackageJsonContent", () => {
  it("unions dependencies, devDependencies and scripts from prev and new", () => {
    const prev = JSON.stringify({
      name: "site",
      version: "0.1.0",
      dependencies: {
        next: "16.0.0",
        react: "19.0.0",
        "lucide-react": "^1.0.0",
      },
      devDependencies: { typescript: "^5.5.0" },
      scripts: { dev: "next dev", build: "next build" },
    });
    const next = JSON.stringify({
      name: "site",
      version: "0.1.0",
      dependencies: {
        three: "^0.176.0",
        "@react-three/fiber": "^9.1.2",
      },
    });

    const merged = JSON.parse(mergePackageJsonContent(prev, next));

    expect(merged.dependencies).toEqual({
      next: "16.0.0",
      react: "19.0.0",
      "lucide-react": "^1.0.0",
      three: "^0.176.0",
      "@react-three/fiber": "^9.1.2",
    });
    expect(merged.devDependencies).toEqual({ typescript: "^5.5.0" });
    expect(merged.scripts).toEqual({ dev: "next dev", build: "next build" });
  });

  it("lets new file override duplicate dependency versions", () => {
    const prev = JSON.stringify({ dependencies: { react: "18.0.0" } });
    const next = JSON.stringify({ dependencies: { react: "19.0.0" } });
    const merged = JSON.parse(mergePackageJsonContent(prev, next));
    expect(merged.dependencies.react).toBe("19.0.0");
  });

  it("preserves prev dependencies even when new file omits the dependencies key entirely", () => {
    const prev = JSON.stringify({
      name: "site",
      dependencies: { next: "16.0.0", react: "19.0.0" },
    });
    const next = JSON.stringify({
      name: "site",
      version: "0.2.0",
    });

    const merged = JSON.parse(mergePackageJsonContent(prev, next));

    expect(merged.dependencies).toEqual({ next: "16.0.0", react: "19.0.0" });
    expect(merged.version).toBe("0.2.0");
  });

  it("returns next content unchanged when either side is invalid JSON", () => {
    expect(mergePackageJsonContent("not json", '{"a":1}')).toBe('{"a":1}');
    expect(mergePackageJsonContent('{"a":1}', "not json")).toBe("not json");
  });
});

describe("mergeVersionFilesWithWarnings", () => {
  it("warns about significant shrink and rejects when option set", () => {
    const prev = [file("app/page.tsx", "x".repeat(1000))];
    const next = [file("app/page.tsx", "x".repeat(50))];

    const result = mergeVersionFilesWithWarnings(prev, next, {
      rejectSignificantShrinks: true,
    });

    expect(result.warnings).toEqual([
      {
        type: "significant-shrink",
        file: "app/page.tsx",
        previousSize: 1000,
        newSize: 50,
      },
    ]);
    expect(result.files).toEqual([prev[0]]);
  });

  it("accepts shrunk files when reject option is not set", () => {
    const prev = [file("app/page.tsx", "x".repeat(1000))];
    const next = [file("app/page.tsx", "x".repeat(50))];

    const result = mergeVersionFilesWithWarnings(prev, next);

    expect(result.warnings).toHaveLength(1);
    expect(result.files[0].content.length).toBe(50);
  });

  it("preserves prev package.json deps via deep-merge even when new file is shrunk and rejectShrinks is false", () => {
    const prevPkg = JSON.stringify(
      {
        name: "site",
        dependencies: {
          next: "16.0.0",
          react: "19.0.0",
          "lucide-react": "^1.0.0",
          "@radix-ui/react-dialog": "^1.0.0",
        },
        devDependencies: { typescript: "^5.5.0" },
        scripts: { dev: "next dev", build: "next build" },
      },
      null,
      2,
    );
    const newPkg = JSON.stringify({
      dependencies: {
        three: "^0.176.0",
        "@react-three/fiber": "^9.1.2",
      },
    });

    const prev = [file("package.json", prevPkg)];
    const next = [file("package.json", newPkg)];

    const result = mergeVersionFilesWithWarnings(prev, next);

    expect(result.warnings).toEqual([
      expect.objectContaining({ type: "significant-shrink", file: "package.json" }),
    ]);
    const merged = JSON.parse(result.files[0].content) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
      scripts: Record<string, string>;
    };
    expect(merged.dependencies).toMatchObject({
      next: "16.0.0",
      react: "19.0.0",
      "lucide-react": "^1.0.0",
      "@radix-ui/react-dialog": "^1.0.0",
      three: "^0.176.0",
      "@react-three/fiber": "^9.1.2",
    });
    expect(merged.devDependencies).toEqual({ typescript: "^5.5.0" });
    expect(merged.scripts).toEqual({ dev: "next dev", build: "next build" });
  });

  it("preserves prev package.json deps even when rejectShrinks is true (deep-merge takes precedence)", () => {
    const prevPkg = JSON.stringify({
      dependencies: { next: "16.0.0", react: "19.0.0" },
    });
    const newPkg = JSON.stringify({
      dependencies: { three: "^0.176.0" },
    });

    const result = mergeVersionFilesWithWarnings(
      [file("package.json", prevPkg)],
      [file("package.json", newPkg)],
      { rejectSignificantShrinks: true },
    );

    const merged = JSON.parse(result.files[0].content) as {
      dependencies: Record<string, string>;
    };
    expect(merged.dependencies).toEqual({
      next: "16.0.0",
      react: "19.0.0",
      three: "^0.176.0",
    });
  });

  it("returns sorted files including untouched prev files", () => {
    const prev = [
      file("a.tsx", "old-a"),
      file("b.tsx", "old-b"),
    ];
    const next = [file("b.tsx", "new-b"), file("c.tsx", "new-c")];

    const result = mergeVersionFilesWithWarnings(prev, next);

    expect(result.files.map((f) => f.path)).toEqual(["a.tsx", "b.tsx", "c.tsx"]);
    expect(result.files[1].content).toBe("new-b");
  });
});

describe("resolveChatPreferredVersionId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the preferred version id when one exists", async () => {
    getPreferredVersionMock.mockResolvedValue({ id: "ver_pref" } as never);
    getLatestVersionMock.mockResolvedValue({ id: "ver_latest" } as never);

    expect(await resolveChatPreferredVersionId("chat_1")).toBe("ver_pref");
    expect(getLatestVersionMock).not.toHaveBeenCalled();
  });

  it("falls back to the latest version id when no preferred exists", async () => {
    getPreferredVersionMock.mockResolvedValue(null);
    getLatestVersionMock.mockResolvedValue({ id: "ver_latest" } as never);

    expect(await resolveChatPreferredVersionId("chat_1")).toBe("ver_latest");
  });

  it("returns null when the chat has no versions", async () => {
    getPreferredVersionMock.mockResolvedValue(null);
    getLatestVersionMock.mockResolvedValue(null);

    expect(await resolveChatPreferredVersionId("chat_1")).toBeNull();
  });
});

describe("resolveFollowUpPreviousFiles known image heals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getKnownBrokenImageReplacementsMock.mockResolvedValue({});
    updateVersionFilesMock.mockResolvedValue(true);
  });

  // Bugbot HIGH+MEDIUM (PR #376): the heal must be in-memory only — writing
  // the healed files back to the base version's row mutated history (restore)
  // and cleared repair-offer state (`repaired_files_json`/`repair_available_at`).
  it("heals the explicit follow-up base in memory WITHOUT touching the base version row", async () => {
    const deadUrl =
      "https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=1200&h=800&fit=crop";
    const replacementUrl =
      "https://images.unsplash.com/photo-1647164789794?w=1200&h=800&fit=crop";
    getVersionByIdMock.mockResolvedValue({
      id: "ver_old",
      chat_id: "chat_1",
      files_json: JSON.stringify([
        file("app/page.tsx", `<img src="${deadUrl}" alt="Neon glassblowing" />`),
      ]),
    } as never);
    getKnownBrokenImageReplacementsMock.mockResolvedValue({
      [deadUrl]: replacementUrl,
    });

    const files = await resolveFollowUpPreviousFiles("chat_1", "ver_old");

    expect(files[0]?.content).toContain(replacementUrl);
    expect(files[0]?.content).not.toContain(deadUrl);
    // The base version's row must stay untouched — no files_json write, no
    // repair-offer/preview-url side effects, no verification-state reset.
    expect(updateVersionFilesMock).not.toHaveBeenCalled();
    expect(getPreferredVersionMock).not.toHaveBeenCalled();
    expect(getLatestVersionMock).not.toHaveBeenCalled();
  });
});
