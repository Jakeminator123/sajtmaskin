import { describe, expect, it } from "vitest";
import * as aiHemsidebyggare from "@/app/ai-hemsidebyggare/page";
import * as hemsidaTillForetag from "@/app/hemsida-till-foretag/page";
import * as hemsidaUtanKod from "@/app/hemsida-utan-kod/page";
import * as hemsideprogram from "@/app/hemsideprogram/page";
import * as lovableAlternativ from "@/app/lovable-alternativ/page";
import * as skapaHemsidaMedAi from "@/app/skapa-hemsida-med-ai/page";
import * as skapaHemsida from "@/app/skapa-hemsida/page";
import * as vadKostarEnHemsida from "@/app/vad-kostar-en-hemsida/page";
import * as wixAlternativ from "@/app/wix-alternativ/page";
import * as wordpressAlternativ from "@/app/wordpress-alternativ/page";
import { publicIndexRobots } from "@/lib/public-canonical-url";
import { getSeoLandingEntry, SEO_LANDING_SLUGS } from "./registry";

const PAGE_MODULES = {
  "skapa-hemsida": skapaHemsida,
  "skapa-hemsida-med-ai": skapaHemsidaMedAi,
  "ai-hemsidebyggare": aiHemsidebyggare,
  "hemsida-till-foretag": hemsidaTillForetag,
  hemsideprogram,
  "hemsida-utan-kod": hemsidaUtanKod,
  "vad-kostar-en-hemsida": vadKostarEnHemsida,
  "wix-alternativ": wixAlternativ,
  "wordpress-alternativ": wordpressAlternativ,
  "lovable-alternativ": lovableAlternativ,
} as const;

describe("SEO landing App Router pages", () => {
  it.each(SEO_LANDING_SLUGS)("exports server metadata and a default page for /%s", (slug) => {
    const mod = PAGE_MODULES[slug];
    const ready = getSeoLandingEntry(slug).status === "ready";
    expect(mod.metadata.robots).toEqual(
      ready ? publicIndexRobots() : { index: false, follow: false },
    );
    expect(typeof mod.default).toBe("function");
  });
});
