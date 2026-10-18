/**
 * Runtime owner for the public Sajtmaskin proof/showcase surface (`/exempel`).
 *
 * Byråflöde, Springa, Palma, Paddlelines and Glass are reconstructions of
 * earlier examples and must not be described as live businesses. DG97,
 * Kontorshotellkartan, Persona Royale, Scout Gaming and Nexus OS are own live
 * projects, businesses and concepts; DG97 is operated by Pretty Good AB. None
 * is a customer testimonial or exact current Sajtmaskin output.
 *
 * Glass must only link to the umber alias. The bare glass-showcase host
 * without `-umber` is an unrelated wedding site and must never be referenced.
 */

export const EXEMPEL_PATH = "/exempel" as const;
export const EXEMPEL_CANONICAL_URL = "https://sajtmaskin.se/exempel" as const;
export const EXEMPEL_BUILDER_HREF = "/builder?new=1" as const;
export const EXEMPEL_SECONDARY_HREF = "/skapa-hemsida-med-ai" as const;

export const SHOWCASE_EXTERNAL_REL = "noopener noreferrer nofollow" as const;

export type ShowcaseSiteId =
  | "dg97"
  | "kontorshotellkartan"
  | "persona-royale"
  | "sajtmaskin-casino"
  | "futuristic-dashboard"
  | "byraflode"
  | "springa"
  | "palma"
  | "paddlelines"
  | "glass";

export type ShowcaseSite = {
  id: ShowcaseSiteId;
  name: string;
  industry: string;
  highlight: string;
  href: string;
  screenshotSrc: string;
  screenshotAlt: string;
  summary: string;
  featuredOnHome: boolean;
};

export const SHOWCASE_SITES: readonly ShowcaseSite[] = [
  {
    id: "dg97",
    name: "DG97 Kontorsguiden",
    industry: "Fastighet / kontorsguide",
    highlight: "Stockholm · Jämförelse & rumspreview",
    href: "https://www.dg97.org",
    screenshotSrc: "/exempel/dg97.webp",
    screenshotAlt:
      "DG97 Kontorsguiden: redaktionell guidesajt om kontorshotell i Stockholm med rumsöversikt.",
    summary:
      "Redaktionell guidesajt inför kontorsval i Stockholm med jämförelsetabell, checklista inför visning och rumsöversikt för Drottninggatan 97.",
    featuredOnHome: true,
  },
  {
    id: "kontorshotellkartan",
    name: "Kontorshotellkartan",
    industry: "Karta / jämförelsetjänst",
    highlight: "Stockholm · Interaktiv karta & filter",
    href: "https://kontorshotellkartan.se",
    screenshotSrc: "/exempel/kontorshotellkartan.webp",
    screenshotAlt:
      "Kontorshotellkartan: mörk kartsajt för att jämföra kontorshotell i Stockholm.",
    summary:
      "Interaktiv kart- och katalogvy över kontorshotell i Stockholm med områdesfilter, sid-vid-sida-jämförelse och samlad visningsförfrågan.",
    featuredOnHome: true,
  },
  {
    id: "persona-royale",
    name: "Persona Royale",
    industry: "Live studio / B2B-koncept",
    highlight: "Svart & guld · Konfigurator & 2 språk",
    href: "https://persona-royale-casino.vercel.app",
    screenshotSrc: "/exempel/persona-royale.webp",
    screenshotAlt:
      "Persona Royale: mörk B2B-presentationssajt i svart och guld för en tänkt livecasino-studio.",
    summary:
      "Mörk B2B-presentation i svart och guld för en tänkt livecasino-studio med spelformat, interaktiv studiokonfigurator och språkväxling.",
    featuredOnHome: true,
  },
  {
    id: "sajtmaskin-casino",
    name: "Scout Gaming",
    industry: "Spellobby / interaktiv demo",
    highlight: "Spelmatris · 3D-vy & arkadläge",
    href: "https://sajtmaskin-casino-f440ccf7.vercel.app",
    screenshotSrc: "/exempel/sajtmaskin-casino.webp",
    screenshotAlt:
      "Scout Gaming: mörk spellobby med neonaccenter, nivåmatris och lokalt minispel.",
    summary:
      "Atmosfärisk spellobby med neonaccenter, nivåindelad spelmatris, visuell bordsförhandsvisning och ett lokalt arkadminispel i webbläsaren.",
    featuredOnHome: true,
  },
  {
    id: "futuristic-dashboard",
    name: "Nexus OS",
    industry: "System-dashboard / UI-koncept",
    highlight: "Kontrollpanel · Realtidskort & larm",
    href: "https://futuristic-dashboard-five-indol.vercel.app",
    screenshotSrc: "/exempel/futuristic-dashboard.webp",
    screenshotAlt:
      "Nexus OS: futuristisk mörk kontrollpanel med systemgrafer, säkerhetsstatus och resursreglage.",
    summary:
      "Futuristisk kontrollpanel med systemstatus, prestandavyer, säkerhetslarm och interaktiva miljöreglage i ett sammanhållet UI-koncept.",
    featuredOnHome: true,
  },
  {
    id: "byraflode",
    name: "Byråflöde",
    industry: "Redovisning / corporate SaaS",
    highlight: "Byrå-SaaS · Prislayout & demovy",
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
    highlight: "Outdoor · Redaktionell rytm",
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
    highlight: "Barkonsult · Mörk editorial",
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
    highlight: "Mallorca · Lekfull livsstil",
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
    highlight: "Glasskiosk · Varm identitet",
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
  "Byråflöde, Springa, Palma, Paddlelines och Glass är rekonstruktioner av påhittade verksamheter. De övriga fem är egna projekt, verksamheter och koncept som vi själva har byggt. Exemplen är inte kundomdömen och inte exakt output från nuvarande Sajtmaskin.";
