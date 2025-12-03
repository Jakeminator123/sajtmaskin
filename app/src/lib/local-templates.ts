/**
 * Local Templates Registry
 * ========================
 *
 * Hanterar mallar som användare kan använda som utgångspunkt.
 *
 * TVÅ TYPER AV MALLAR:
 *
 * TYP A: v0TemplateId-baserade (REKOMMENDERAT)
 * ─────────────────────────────────────────────
 * - Har v0TemplateId satt (t.ex. "hUI7hCyGNye")
 * - mainFile och folderPath kan vara tomma ("")
 * - Laddas DIREKT från v0 API - inget lokalt behövs!
 * - Ger fullständig mall med alla filer och demoUrl
 * - KAN REDIGERAS efteråt (chatId returneras)
 *
 * TYP B: Lokal-kod-baserade (fallback)
 * ─────────────────────────────────────
 * - Har INTE v0TemplateId (eller det är en chat-URL)
 * - Kräver mainFile och folderPath till lokal kod
 * - Kod lagras i: src/templates/{category}/{template-id}/
 * - Koden skickas till v0 API för att generera preview
 *
 * FLÖDE NÄR ANVÄNDARE VÄLJER EN MALL:
 *
 * 1. Frontend anropar /api/local-template?id=xxx
 * 2. Om mallen har v0TemplateId OCH tomma filsökvägar:
 *    → Returnerar useV0Api: true
 *    → Frontend anropar generateFromTemplate(v0TemplateId)
 *    → v0 API returnerar demoUrl + chatId + filer
 *
 * 3. Om mallen har lokal kod:
 *    → Läser filer från src/templates/
 *    → Skickar till generateWebsite() för att få demoUrl
 *
 * VIKTIGT OM v0TemplateId:
 * ────────────────────────
 * Template ID är BARA hash-delen av URL:en!
 *
 * Exempel:
 *   URL: https://v0.app/templates/vercel-style-black-friday-map-hUI7hCyGNye
 *   ID:  hUI7hCyGNye  ✅ (bara hashen!)
 *   FEL: vercel-style-black-friday-map-hUI7hCyGNye ❌ (hela sluggen)
 *
 * COMPLEXITY-FÄLTET:
 * - "simple": CSS/SVG/standard React - v0 kan återskapa nära originalet
 * - "advanced": Three.js/d3/WebGL - v0 skapar förenklad version
 */

export interface LocalTemplate {
  id: string; // Unikt ID för denna mall (används i URL)
  name: string; // Visningsnamn
  description: string; // Beskrivning för UI
  category: string; // "landing-page" | "dashboard" | "website"
  previewUrl: string; // Bild för UI (kan vara placeholder)
  sourceUrl: string; // Original v0 URL för referens

  // TYP A (v0TemplateId): Sätt dessa tomma ("")
  // TYP B (lokal kod): Sätt dessa till filsökvägar
  mainFile: string; // "app/page.tsx" eller "" för TYP A
  folderPath: string; // "landing-page/cosmos-3d" eller "" för TYP A

  // VIKTIG: Bara hash-delen av URL! Se dokumentation ovan.
  v0TemplateId?: string; // "hUI7hCyGNye" (ej full slug!)

  complexity: "simple" | "advanced";
}

export const LOCAL_TEMPLATES: LocalTemplate[] = [
  // ════════════════════════════════════════════════════════════════════════════
  // LANDING PAGES
  // ════════════════════════════════════════════════════════════════════════════

  // TYP A: v0TemplateId + lokal kod (v0 API prioriteras, lokal som fallback)
  // URL: https://v0.app/templates/cosmos-3d-orbit-gallery-template-W8w0SZdos3x
  {
    id: "cosmos-3d",
    name: "Cosmos — 3D Orbit Gallery",
    description:
      "Fantastisk 3D-partikelsfär med orbiterande bildgalleri och rymdtema",
    category: "landing-page",
    previewUrl: "/templates/landing_page/1/preview.png",
    sourceUrl:
      "https://v0.app/templates/cosmos-3d-orbit-gallery-template-W8w0SZdos3x",
    mainFile: "app/page.tsx", // Lokal fallback finns
    folderPath: "landing-page/cosmos-3d",
    v0TemplateId: "W8w0SZdos3x", // ← HASH ONLY! Prioriteras
    complexity: "advanced",
  },

  // TYP B: Endast lokal kod (chat-URL har inget templateId)
  {
    id: "animated-hero",
    name: "Minimal Animated Hero",
    description:
      "Modern hero-sektion med orange neonlinjer, animationer och responsiv design",
    category: "landing-page",
    previewUrl: "/templates/landing_page/2/preview.png",
    sourceUrl: "https://v0.app/chat/mnimal-animated-hero-xGyEFskYA9w",
    mainFile: "app/page.tsx",
    folderPath: "landing-page/animated-hero",
    // Inget v0TemplateId - chat-URL → använder lokal kod
    complexity: "simple",
  },

  // TYP B: Endast lokal kod
  {
    id: "brillance-saas",
    name: "Brillance SaaS Landing Page",
    description:
      "Komplett SaaS-landningssida med hero, pricing, testimonials, FAQ och footer",
    category: "landing-page",
    previewUrl: "/templates/landing_page/3/preview.png",
    sourceUrl: "https://v0.app/chat/brillance-saa-s-landing-page-Kqi1r3AuLk3",
    mainFile: "app/page.tsx",
    folderPath: "landing-page/brillance-saas",
    // Inget v0TemplateId - chat-URL → använder lokal kod
    complexity: "simple",
  },

  // ════════════════════════════════════════════════════════════════════════════
  // DASHBOARDS
  // ════════════════════════════════════════════════════════════════════════════

  // TYP A: Endast v0TemplateId (ingen lokal kod behövs!)
  // URL: https://v0.app/templates/vercel-style-black-friday-map-hUI7hCyGNye
  {
    id: "black-friday-map",
    name: "Vercel Black Friday Map",
    description:
      "Pixelerad världskarta i Vercel-stil med interaktiv datavisualisering",
    category: "dashboard",
    previewUrl: "/templates/dashboards/1/preview.png",
    sourceUrl:
      "https://v0.app/templates/vercel-style-black-friday-map-hUI7hCyGNye",
    mainFile: "", // TYP A: tomma filsökvägar
    folderPath: "", // TYP A: ingen lokal kod
    v0TemplateId: "hUI7hCyGNye", // ← HASH ONLY! Laddas direkt från v0
    complexity: "advanced",
  },

  // ════════════════════════════════════════════════════════════════════════════
  // WEBSITES (TODO: Lägg till 3 mallar)
  // ════════════════════════════════════════════════════════════════════════════
  // Exempel på hur en website-mall ser ut:
  // {
  //   id: "business-template",
  //   name: "Business Website",
  //   category: "website",
  //   v0TemplateId: "ABC123xyz", // ← Hämta hash från v0.app/templates
  //   mainFile: "", folderPath: "", // Tomma för TYP A
  //   ...
  // }
];

// Get templates for a specific category
export function getLocalTemplatesForCategory(
  categoryId: string
): LocalTemplate[] {
  return LOCAL_TEMPLATES.filter((t) => t.category === categoryId);
}

// Get all local templates
export function getAllLocalTemplates(): LocalTemplate[] {
  return LOCAL_TEMPLATES;
}

// Get a specific template by ID
export function getLocalTemplateById(
  templateId: string
): LocalTemplate | undefined {
  return LOCAL_TEMPLATES.find((t) => t.id === templateId);
}

// Check if a template ID is a local template
export function isLocalTemplate(templateId: string): boolean {
  return LOCAL_TEMPLATES.some((t) => t.id === templateId);
}
