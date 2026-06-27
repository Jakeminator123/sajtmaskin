import { afterEach, describe, expect, it, vi } from "vitest";
import type { ShadcnRegistryItem } from "@/lib/shadcn/registry-types";
import {
  buildShadcnBlockPrompt,
  buildShadcnComponentPrompt,
  buildShadcnPreviewUrl,
  mapRegistryFilePath,
  rewriteRegistryImports,
} from "./registry-utils";

describe("registry-utils", () => {
  it("rewrites radix-vega registry imports to local aliases", () => {
    const content = [
      'import { useIsMobile } from "@/registry/radix-vega/hooks/use-mobile";',
      'import { cn } from "@/registry/radix-vega/lib/utils";',
      'import { Button } from "@/registry/radix-vega/ui/button";',
    ].join("\n");

    expect(rewriteRegistryImports(content, "radix-vega")).toContain(
      'import { useIsMobile } from "@/lib/hooks/use-mobile";',
    );
    expect(rewriteRegistryImports(content, "radix-vega")).toContain(
      'import { cn } from "@/lib/utils";',
    );
    expect(rewriteRegistryImports(content, "radix-vega")).toContain(
      'import { Button } from "@/components/ui/button";',
    );
  });

  it("maps registry hook files into src/lib/hooks", () => {
    expect(mapRegistryFilePath("hooks/use-mobile.ts")).toBe("src/lib/hooks/use-mobile.ts");
    expect(mapRegistryFilePath("registry/radix-vega/hooks/use-mobile.ts")).toBe(
      "src/lib/hooks/use-mobile.ts",
    );
  });
});

describe("buildShadcnPreviewUrl (official registry /view/ URL)", () => {
  it("defaults to new-york-v4", () => {
    expect(buildShadcnPreviewUrl("login-01")).toBe(
      "https://ui.shadcn.com/view/new-york-v4/login-01",
    );
  });

  it("coerces the incomplete radix-vega alias to new-york-v4", () => {
    expect(buildShadcnPreviewUrl("login-01", "radix-vega")).toBe(
      "https://ui.shadcn.com/view/new-york-v4/login-01",
    );
  });

  it("coerces the legacy new-york alias to new-york-v4", () => {
    expect(buildShadcnPreviewUrl("dashboard-01", "new-york")).toBe(
      "https://ui.shadcn.com/view/new-york-v4/dashboard-01",
    );
  });

  it("keeps new-york-v4 as-is and never leaks radix-vega", () => {
    const url = buildShadcnPreviewUrl("login-01", "new-york-v4");
    expect(url).toBe("https://ui.shadcn.com/view/new-york-v4/login-01");
    expect(url).not.toContain("radix-vega");
  });
});

/**
 * Hardened oversized-payload behavior: when a registry block/component is too
 * large to embed in full, the prompt must NOT silently degrade to a paths-only
 * summary (the model would then fabricate broken component code). It must keep
 * embedding real source, mark any dropped file loudly, and warn server-side.
 */
describe("registry add-prompt oversized fallback hardening", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const GIANT_TOKEN = "GIANT_OMITTED_PAYLOAD_TOKEN";
  const SMALL_BUTTON: ShadcnRegistryItem["files"] = [
    {
      path: "registry/new-york-v4/ui/button.tsx",
      content: "export function ButtonMarker() { return null; }",
    },
  ];

  function oversizedBlock(): ShadcnRegistryItem {
    return {
      name: "login-01",
      type: "registry:block",
      files: [
        ...(SMALL_BUTTON ?? []),
        {
          path: "registry/new-york-v4/blocks/login-01/page.tsx",
          // > MAX_PROMPT_CHARS (60000) so the full prompt overflows the budget.
          content: GIANT_TOKEN.repeat(2600),
        },
      ],
    };
  }

  it("keeps full content for normal-sized blocks (no warning, no omission)", () => {
    const prompt = buildShadcnBlockPrompt(
      {
        name: "hero-01",
        type: "registry:block",
        files: [
          {
            path: "registry/new-york-v4/blocks/hero-01/page.tsx",
            content: "export function Hero() { return <section>hi</section>; }",
          },
        ],
      },
      { style: "new-york-v4" },
    );
    expect(prompt).toContain("export function Hero()");
    expect(prompt).not.toContain("CONTENT OMITTED");
    expect(prompt).not.toContain("WARNING:");
  });

  it("structured fallback embeds real source + marks dropped files loudly", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const prompt = buildShadcnBlockPrompt(oversizedBlock(), { style: "new-york-v4" });

    // Loud, explicit signalling instead of silent truncation.
    expect(prompt).toContain("WARNING:");
    expect(prompt).toContain("CONTENT OMITTED");
    // The dropped file is named by its real target path so it can be re-fetched.
    expect(prompt).toContain("src/components/blocks/login-01/page.tsx");
    // The first (small) file is still embedded in full.
    expect(prompt).toContain("export function ButtonMarker()");
    // The oversized payload is NOT embedded (no silent half-prompt with content).
    expect(prompt).not.toContain(GIANT_TOKEN);
    // The old silent paths-only phrasing must be gone.
    expect(prompt).not.toContain("content omitted to keep prompt short");
    // Server-side warning fired.
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain("login-01");
  });

  it("embeds a single oversized file in full rather than forcing a guess", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const prompt = buildShadcnBlockPrompt(
      {
        name: "mega-01",
        type: "registry:block",
        files: [
          {
            path: "registry/new-york-v4/blocks/mega-01/page.tsx",
            content: `${GIANT_TOKEN.repeat(2600)} // export function MegaMarker() {}`,
          },
        ],
      },
      { style: "new-york-v4" },
    );
    // Only one file: it is embedded in full, nothing is omitted/fabricated.
    expect(prompt).toContain(GIANT_TOKEN);
    expect(prompt).not.toContain("CONTENT OMITTED");
    expect(prompt).not.toContain("WARNING:");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("component prompt uses the same hardened fallback", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const prompt = buildShadcnComponentPrompt(
      {
        name: "chart",
        type: "registry:component",
        files: [
          {
            path: "registry/new-york-v4/ui/chart.tsx",
            content: "export function ChartMarker() { return null; }",
          },
          {
            path: "registry/new-york-v4/ui/chart-data.ts",
            content: GIANT_TOKEN.repeat(2600),
          },
        ],
      },
      { style: "new-york-v4" },
    );
    expect(prompt).toContain("WARNING:");
    expect(prompt).toContain("CONTENT OMITTED");
    expect(prompt).toContain("export function ChartMarker()");
    expect(prompt).not.toContain(GIANT_TOKEN);
    expect(prompt).not.toContain("content omitted to keep prompt short");
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
