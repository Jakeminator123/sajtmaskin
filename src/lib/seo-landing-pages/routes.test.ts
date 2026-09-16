import { describe, expect, it } from "vitest";
import * as aiHemsidebyggare from "@/app/ai-hemsidebyggare/page";
import * as hemsidaTillForetag from "@/app/hemsida-till-foretag/page";
import * as hemsideprogram from "@/app/hemsideprogram/page";
import * as lovableAlternativ from "@/app/lovable-alternativ/page";
import * as skapaHemsidaMedAi from "@/app/skapa-hemsida-med-ai/page";
import * as skapaHemsida from "@/app/skapa-hemsida/page";
import * as wixAlternativ from "@/app/wix-alternativ/page";
import * as wordpressAlternativ from "@/app/wordpress-alternativ/page";
import { SEO_LANDING_SLUGS } from "./registry";

const PAGE_MODULES = {
  "skapa-hemsida-med-ai": skapaHemsidaMedAi,
  "ai-hemsidebyggare": aiHemsidebyggare,
  "hemsida-till-foretag": hemsidaTillForetag,
  hemsideprogram,
  "skapa-hemsida": skapaHemsida,
  "wix-alternativ": wixAlternativ,
  "wordpress-alternativ": wordpressAlternativ,
  "lovable-alternativ": lovableAlternativ,
} as const;

describe("SEO landing App Router pages", () => {
  it.each(SEO_LANDING_SLUGS)("exports server metadata and a default page for /%s", (slug) => {
    const mod = PAGE_MODULES[slug];
    expect(mod.metadata.robots).toEqual({ index: false, follow: false });
    expect(typeof mod.default).toBe("function");
  });
});
