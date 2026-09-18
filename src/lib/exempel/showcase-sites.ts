/**
 * Runtime owner for the public Sajtmaskin proof/showcase surface (`/exempel`).
 *
 * The five sites are reconstructions of earlier examples. They are not verified
 * customer cases and must not be described as live businesses or as exact
 * current Sajtmaskin output.
 *
 * Glass must only link to the umber alias. `glass-showcase.vercel.app` belongs
 * to an unrelated wedding site and must never be referenced.
 */

export const EXEMPEL_PATH = "/exempel" as const;
export const EXEMPEL_CANONICAL_URL = "https://sajtmaskin.se/exempel" as const;
export const EXEMPEL_BUILDER_HREF = "/builder?new=1" as const;
export const EXEMPEL_SECONDARY_HREF = "/skapa-hemsida-med-ai" as const;

export const FORBIDDEN_GLASS_ALIAS = "https://glass-showcase.vercel.app" as const;
export const SHOWCASE_EXTERNAL_REL = "noopener noreferrer nofollow" as const;

export type ShowcaseSiteId = "byraflode" | "springa" | "palma" | "paddlelines" | "glass";

export type ShowcaseSite = {
  id: ShowcaseSiteId;
  name: string;
  industry: string;
  href: string;
  screenshotSrc: string;
  screenshotAlt: string;
  summary: string;
  featuredOnHome: boolean;
};

export const SHOWCASE_SITES: readonly ShowcaseSite[] = [
  {
    id: "byraflode",
    name: "Byråflöde",
    industry: "Redovisning / corporate SaaS",
    href: "https://byraflode-showcase.vercel.app",
    screenshotSrc: "/exempel/byraflode.webp",
    screenshotAlt: "Byråflöde-exemplet: mörk corporate landningssida för en tänkt byråprodukt.",
    summary:
      "Mörk marknadssajt för en tänkt produkt mot redovisningsbyråer. Visar landning, prislayout och intern vy som mönster — inte en live-tjänst.",
    featuredOnHome: true,
  },
  {
    id: "springa",
    name: "Springa",
    industry: "Löpning / editorial",
    href: "https://springa-showcase.vercel.app",
    screenshotSrc: "/exempel/springa.webp",
    screenshotAlt: "Springa-exemplet: editorial outdoor-sida om skogslöpning.",
    summary:
      "Editorial outdoor-sida om skogslöpning. Visar stämning och community-känsla, inte en förening eller uppmätt led.",
    featuredOnHome: true,
  },
  {
    id: "palma",
    name: "Palma",
    industry: "Premium service",
    href: "https://palma-showcase.vercel.app",
    screenshotSrc: "/exempel/palma.webp",
    screenshotAlt: "Palma-exemplet: mörk premium serviceyta med guldtoner.",
    summary:
      "Mörk, stillsam serviceyta för en tänkt bar-konsult. Exemplet visar ton och layout, inte ett bokningsbart bolag.",
    featuredOnHome: true,
  },
  {
    id: "paddlelines",
    name: "Paddlelines",
    industry: "Padel / lekfull editorial",
    href: "https://paddlelines-showcase.vercel.app",
    screenshotSrc: "/exempel/paddlelines.webp",
    screenshotAlt: "Paddlelines-exemplet: lekfull Mallorca-editorial om padel.",
    summary:
      "Lekfull Mallorca-editorial om padel och vardag. Fiktiva figurer, ingen resebyrå och inga öppettider.",
    featuredOnHome: false,
  },
  {
    id: "glass",
    name: "Glass",
    industry: "Lokal verksamhet",
    href: "https://glass-showcase-umber.vercel.app",
    screenshotSrc: "/exempel/glass.webp",
    screenshotAlt: "Glass-exemplet: varm, färgglad sida för en tänkt glasskiosk.",
    summary:
      "Varm, färgglad kiosksida för en tänkt lokal glassverksamhet. Rekonstruktion av en identitet — inte ett stånd du kan besöka.",
    featuredOnHome: false,
  },
] as const;

export const HOME_SHOWCASE_SITES = SHOWCASE_SITES.filter((site) => site.featuredOnHome);

export const EXEMPEL_DISCLOSURE =
  "Exemplen är demonstrations- och rekonstruktionsprojekt. De visar visuella riktningar och användningsfall; de är inte kundomdömen eller riktiga verksamheter.";
