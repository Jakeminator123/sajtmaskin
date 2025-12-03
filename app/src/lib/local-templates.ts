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
  // LANDING PAGES (alla TYP A - direkt från v0 API!)
  // ════════════════════════════════════════════════════════════════════════════

  // Landing Page 1: Cosmos 3D Orbit Gallery
  // URL: https://v0.app/templates/cosmos-3d-orbit-gallery-template-W8w0SZdos3x
  {
    id: "cosmos-3d",
    name: "Cosmos — 3D Orbit Gallery",
    description:
      "Hero-sektion med 3D-sfär av bilder och partiklar som liknar kosmos",
    category: "landing-page",
    previewUrl: "/templates/landing_page/1/preview.jpg",
    sourceUrl:
      "https://v0.app/templates/cosmos-3d-orbit-gallery-template-W8w0SZdos3x",
    mainFile: "", // TYP A: ingen lokal kod behövs
    folderPath: "", // TYP A: ingen lokal kod behövs
    v0TemplateId: "W8w0SZdos3x",
    complexity: "advanced",
  },

  // Landing Page 2: AI Agency Landing Page & Portfolio Site
  // URL: https://v0.app/templates/ai-agency-landing-page-and-portfolio-site-Ka8r7wzBAS0
  {
    id: "ai-agency",
    name: "AI Agency Landing Page",
    description:
      "Modern landningssida för AI-byråer med dark mode, portfolio och kontaktformulär",
    category: "landing-page",
    previewUrl: "/templates/landing_page/2/preview.jpg",
    sourceUrl:
      "https://v0.app/templates/ai-agency-landing-page-and-portfolio-site-Ka8r7wzBAS0",
    mainFile: "", // TYP A
    folderPath: "", // TYP A
    v0TemplateId: "Ka8r7wzBAS0",
    complexity: "simple",
  },

  // Landing Page 3: Next.js Boilerplate (ComponentCraft UI Library)
  // URL: https://v0.app/templates/next-js-boilerplate-dNTdgBEhEAn
  {
    id: "nextjs-boilerplate",
    name: "Next.js Boilerplate",
    description:
      "Modern UI-komponentbibliotek med TypeScript, Tailwind CSS och Framer Motion",
    category: "landing-page",
    previewUrl: "/templates/landing_page/3/preview.jpg",
    sourceUrl: "https://v0.app/templates/next-js-boilerplate-dNTdgBEhEAn",
    mainFile: "", // TYP A
    folderPath: "", // TYP A
    v0TemplateId: "dNTdgBEhEAn",
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
  // WEBSITES / HOMEPAGES (5 st)
  // ════════════════════════════════════════════════════════════════════════════

  // Website 1: Lorenzo Motocross Landing Page
  // URL: https://v0.app/templates/lorenzo-motocross-landing-page-jz21jJIFr0i
  {
    id: "lorenzo-motocross",
    name: "Lorenzo Motocross",
    description: "Dynamisk motocross-landningssida med action-bilder och modern design",
    category: "website",
    previewUrl: "/templates/homepage/1/preview.jpg",
    sourceUrl: "https://v0.app/templates/lorenzo-motocross-landing-page-jz21jJIFr0i",
    mainFile: "",
    folderPath: "",
    v0TemplateId: "jz21jJIFr0i",
    complexity: "simple",
  },

  // Website 2: Marketing Website
  // URL: https://v0.app/templates/marketing-website-sV0OtrkXM6x
  {
    id: "marketing-website",
    name: "Marketing Website",
    description: "Professionell marknadsföringssida med clean design och CTA-sektioner",
    category: "website",
    previewUrl: "/templates/homepage/2/preview.jpg",
    sourceUrl: "https://v0.app/templates/marketing-website-sV0OtrkXM6x",
    mainFile: "",
    folderPath: "",
    v0TemplateId: "sV0OtrkXM6x",
    complexity: "simple",
  },

  // Website 3: Paperfolio
  // URL: https://v0.app/templates/paperfolio-dDPFIVqPGXR
  {
    id: "paperfolio",
    name: "Paperfolio",
    description: "Minimalistisk portfolio-webbplats med elegant typografi",
    category: "website",
    previewUrl: "/templates/homepage/3/preview.jpg",
    sourceUrl: "https://v0.app/templates/paperfolio-dDPFIVqPGXR",
    mainFile: "",
    folderPath: "",
    v0TemplateId: "dDPFIVqPGXR",
    complexity: "simple",
  },

  // Website 4: A Boring Agency
  // URL: https://v0.app/templates/a-boring-agency-Nynl8DJ6xUH
  {
    id: "boring-agency",
    name: "A Boring Agency",
    description: "Kreativ byrå-webbplats med unik design och interaktiva element",
    category: "website",
    previewUrl: "/templates/homepage/4/preview.jpg",
    sourceUrl: "https://v0.app/templates/a-boring-agency-Nynl8DJ6xUH",
    mainFile: "",
    folderPath: "",
    v0TemplateId: "Nynl8DJ6xUH",
    complexity: "simple",
  },

  // Website 5: TODO - Ge mig en till URL för att ersätta duplicatet!
  // {
  //   id: "website-5",
  //   name: "???",
  //   category: "website",
  //   v0TemplateId: "???",
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
