import { describe, expect, it, vi } from "vitest";
import type { RequestAttachment } from "@/lib/gen/request-metadata";

vi.mock("@/lib/media/stock-providers", () => ({
  buildStockImageQueries: () => [],
  fetchStockImages: async () => [],
  fetchStockVideos: async () => [],
}));

vi.mock("@/lib/utils/debug", () => ({
  debugLog: () => undefined,
}));

import { buildMediaCatalogForOrchestration } from "./build-media-catalog";

function attachment(partial: Partial<RequestAttachment>): RequestAttachment {
  return {
    url: "https://example.com/pic.png",
    mimeType: "image/png",
    purpose: undefined,
    filename: undefined,
    ...partial,
  } as RequestAttachment;
}

describe("buildMediaCatalogForOrchestration — logo detection", () => {
  it("assigns USER_LOGO alias and kind='logo' when purpose mentions 'logo'", async () => {
    const result = await buildMediaCatalogForOrchestration({
      requestAttachments: [
        attachment({ url: "https://cdn/x/brand.png", purpose: "logo" }),
        attachment({ url: "https://cdn/x/photo-1.jpg" }),
      ],
      brief: null,
      offerFallback: "",
    });

    const logo = result.mediaCatalog.find((m) => m.alias === "USER_LOGO");
    expect(logo).toBeDefined();
    expect(logo!.kind).toBe("logo");
    expect(logo!.source).toBe("user");
    expect(result.urlMapOverrides.USER_LOGO).toBe("https://cdn/x/brand.png");
  });

  it("detects logo via filename matches like 'logotyp.svg'", async () => {
    const result = await buildMediaCatalogForOrchestration({
      requestAttachments: [
        attachment({ url: "https://cdn/x/logotyp.svg", filename: "logotyp.svg" }),
      ],
      brief: null,
      offerFallback: "",
    });
    const logo = result.mediaCatalog.find((m) => m.alias === "USER_LOGO");
    expect(logo).toBeDefined();
    expect(logo!.kind).toBe("logo");
  });

  it("only assigns USER_LOGO to the first logo match; subsequent images get USER_IMG_N", async () => {
    const result = await buildMediaCatalogForOrchestration({
      requestAttachments: [
        attachment({ url: "https://cdn/x/logo-a.png", purpose: "Company logo" }),
        attachment({ url: "https://cdn/x/logo-b.png", purpose: "Secondary logo" }),
      ],
      brief: null,
      offerFallback: "",
    });
    const aliases = result.mediaCatalog.map((m) => m.alias);
    expect(aliases).toContain("USER_LOGO");
    expect(aliases).toContain("USER_IMG_1");
    expect(aliases.filter((a) => a === "USER_LOGO")).toHaveLength(1);
  });

  it("falls back to USER_IMG_1 numbering when no logo is present", async () => {
    const result = await buildMediaCatalogForOrchestration({
      requestAttachments: [
        attachment({ url: "https://cdn/x/photo-1.jpg" }),
        attachment({ url: "https://cdn/x/photo-2.jpg" }),
      ],
      brief: null,
      offerFallback: "",
    });
    const aliases = result.mediaCatalog.map((m) => m.alias);
    expect(aliases).toEqual(["USER_IMG_1", "USER_IMG_2"]);
    expect(aliases).not.toContain("USER_LOGO");
  });
});
