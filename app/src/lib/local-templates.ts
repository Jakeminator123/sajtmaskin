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
    previewUrl: "", // Uses v0 OG image automatically
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
    previewUrl: "", // Uses v0 OG image automatically
    sourceUrl: "https://v0.app/templates/next-js-boilerplate-dNTdgBEhEAn",
    mainFile: "",
    folderPath: "",
    v0TemplateId: "dNTdgBEhEAn",
    complexity: "simple",
  },

  // Landing Page 4: Pointer AI Landing Page
  // URL: https://v0.app/templates/pointer-ai-landing-page-XQxxv76lK5w
  {
    id: "pointer-ai",
    name: "Pointer AI Landing Page",
    description:
      "AI-fokuserad landningssida med snabb anpassning via prompts, animationer och responsiv layout",
    category: "landing-page",
    previewUrl: "/templates/landing_page/4/preview.jpg",
    sourceUrl: "https://v0.app/templates/pointer-ai-landing-page-XQxxv76lK5w",
    mainFile: "",
    folderPath: "",
    v0TemplateId: "XQxxv76lK5w",
    complexity: "simple",
  },

  // Landing Page 5: Shaders Landing Page
  // URL: https://v0.app/templates/shaders-landing-page-R3n0gnvYFbO
  {
    id: "shaders-landing",
    name: "Shaders Landing Page",
    description:
      "Visuellt slående landningssida med Three.js, WebGL och interaktiva shader-effekter",
    category: "landing-page",
    previewUrl: "/templates/landing_page/5/preview.jpg",
    sourceUrl: "https://v0.app/templates/shaders-landing-page-R3n0gnvYFbO",
    mainFile: "",
    folderPath: "",
    v0TemplateId: "R3n0gnvYFbO",
    complexity: "advanced",
  },

  // Landing Page 6: Skal Ventures Template
  // URL: https://v0.app/templates/skal-ventures-template-tnZGzubtsTc
  {
    id: "skal-ventures",
    name: "Skal Ventures",
    description:
      "Djärv landningssida för riskkapitalbolag med imponerande shaders och WebGL-partikelanimationer",
    category: "landing-page",
    previewUrl: "/templates/landing_page/6/preview.jpg",
    sourceUrl: "https://v0.app/templates/skal-ventures-template-tnZGzubtsTc",
    mainFile: "",
    folderPath: "",
    v0TemplateId: "tnZGzubtsTc",
    complexity: "advanced",
  },

  // Landing Page 7: Auralink SaaS Landing Page
  // URL: https://v0.app/templates/auralink-saas-landing-page-zoQPxUaTqvE
  {
    id: "auralink-saas",
    name: "Auralink SaaS",
    description:
      "Modern SaaS-landningssida för AI-kommunikationsplattform med clean, minimal design",
    category: "landing-page",
    previewUrl: "/templates/landing_page/7/preview.jpg",
    sourceUrl:
      "https://v0.app/templates/auralink-saas-landing-page-zoQPxUaTqvE",
    mainFile: "",
    folderPath: "",
    v0TemplateId: "zoQPxUaTqvE",
    complexity: "simple",
  },

  // ════════════════════════════════════════════════════════════════════════════
  // DASHBOARDS
  // ════════════════════════════════════════════════════════════════════════════

  // Dashboard 1: Vercel Black Friday Map
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
    mainFile: "",
    folderPath: "",
    v0TemplateId: "hUI7hCyGNye",
    complexity: "advanced",
  },

  // Dashboard 2: Shaders Hero Section
  // URL: https://v0.app/templates/shaders-hero-section-lJXGkoM1koN
  {
    id: "shaders-hero",
    name: "Shaders Hero Section",
    description: "Imponerande shader-baserad hero-sektion med WebGL-effekter",
    category: "dashboard",
    previewUrl: "/templates/dashboards/2/preview.jpg",
    sourceUrl: "https://v0.app/templates/shaders-hero-section-lJXGkoM1koN",
    mainFile: "",
    folderPath: "",
    v0TemplateId: "lJXGkoM1koN",
    complexity: "advanced",
  },

  // Dashboard 3: Brillance SaaS Landing Page
  // URL: https://v0.app/templates/brillance-saa-s-landing-page-zdiN8dHwaaT
  {
    id: "brillance-dashboard",
    name: "Brillance SaaS Dashboard",
    description:
      "Professionell SaaS-dashboard med analytics och datavisualisering",
    category: "dashboard",
    previewUrl: "/templates/dashboards/3/preview.jpg",
    sourceUrl:
      "https://v0.app/templates/brillance-saa-s-landing-page-zdiN8dHwaaT",
    mainFile: "",
    folderPath: "",
    v0TemplateId: "zdiN8dHwaaT",
    complexity: "simple",
  },

  // Dashboard 4: Shadcn Dashboard
  // URL: https://v0.app/templates/shadcn-dashboard-Pf7lw1nypu5
  {
    id: "shadcn-dashboard",
    name: "Shadcn Dashboard",
    description:
      "Projekthantering och analytics-dashboard med sidofält, metrikkort, area-diagram och datatabeller",
    category: "dashboard",
    previewUrl: "/templates/dashboards/4/preview.jpg",
    sourceUrl: "https://v0.app/templates/shadcn-dashboard-Pf7lw1nypu5",
    mainFile: "",
    folderPath: "",
    v0TemplateId: "Pf7lw1nypu5",
    complexity: "simple",
  },

  // Dashboard 5: Workflow Design Dashboard
  // URL: https://v0.app/templates/workflow-design-dashboard-IVWc0rHCBAL
  {
    id: "workflow-dashboard",
    name: "Workflow Design Dashboard",
    description:
      "Arbetsflödeshantering med sektioner för översikt, analytics, mallar och team-inställningar",
    category: "dashboard",
    previewUrl: "/templates/dashboards/5/preview.jpg",
    sourceUrl: "https://v0.app/templates/workflow-design-dashboard-IVWc0rHCBAL",
    mainFile: "",
    folderPath: "",
    v0TemplateId: "IVWc0rHCBAL",
    complexity: "simple",
  },

  // Dashboard 6: Simple Dashboard
  // URL: https://v0.app/templates/simple-dashboard-ZZFpa3jFqnO
  {
    id: "simple-dashboard",
    name: "Simple Dashboard",
    description:
      "Affärsöversikt med intäkter, prenumerationer, aktiva användare och konverteringsgrad",
    category: "dashboard",
    previewUrl: "/templates/dashboards/6/preview.jpg",
    sourceUrl: "https://v0.app/templates/simple-dashboard-ZZFpa3jFqnO",
    mainFile: "",
    folderPath: "",
    v0TemplateId: "ZZFpa3jFqnO",
    complexity: "simple",
  },

  // Dashboard 7: Analytics Dashboard
  // URL: https://v0.app/templates/analytics-dashboard-NtDCHfJthfA
  {
    id: "analytics-dashboard",
    name: "Analytics Dashboard",
    description:
      "Dashboard för användarengagemang och app-prestanda med flikar för statistik, insikter och feedback",
    category: "dashboard",
    previewUrl: "/templates/dashboards/7/preview.jpg",
    sourceUrl: "https://v0.app/templates/analytics-dashboard-NtDCHfJthfA",
    mainFile: "",
    folderPath: "",
    v0TemplateId: "NtDCHfJthfA",
    complexity: "simple",
  },

  // ════════════════════════════════════════════════════════════════════════════
  // WEBSITES / HOMEPAGES
  // ════════════════════════════════════════════════════════════════════════════

  // Website 1: Lorenzo Motocross Landing Page
  // URL: https://v0.app/templates/lorenzo-motocross-landing-page-jz21jJIFr0i
  {
    id: "lorenzo-motocross",
    name: "Lorenzo Motocross",
    description:
      "Dynamisk motocross-landningssida med action-bilder och modern design",
    category: "website",
    previewUrl: "/templates/homepage/1/preview.jpg",
    sourceUrl:
      "https://v0.app/templates/lorenzo-motocross-landing-page-jz21jJIFr0i",
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
    description:
      "Professionell marknadsföringssida med clean design och CTA-sektioner",
    category: "website",
    previewUrl: "/templates/homepage/2/preview.jpg",
    sourceUrl: "https://v0.app/templates/marketing-website-sV0OtrkXM6x",
    mainFile: "",
    folderPath: "",
    v0TemplateId: "sV0OtrkXM6x",
    complexity: "simple",
  },

  // Website 3: Modern Artist Landing Template
  // URL: https://v0.app/templates/modern-artist-landing-template-QRieAUkBLIh
  {
    id: "modern-artist",
    name: "Modern Artist Landing",
    description:
      "Stilren konstnärs-landningssida med galleri och portfolio-fokus",
    category: "website",
    previewUrl: "/templates/homepage/3/preview.jpg",
    sourceUrl:
      "https://v0.app/templates/modern-artist-landing-template-QRieAUkBLIh",
    mainFile: "",
    folderPath: "",
    v0TemplateId: "QRieAUkBLIh",
    complexity: "simple",
  },

  // Website 4: Paperfolio
  // URL: https://v0.app/templates/paperfolio-dDPFIVqPGXR
  {
    id: "paperfolio",
    name: "Paperfolio",
    description: "Minimalistisk portfolio-webbplats med elegant typografi",
    category: "website",
    previewUrl: "/templates/homepage/4/preview.jpg",
    sourceUrl: "https://v0.app/templates/paperfolio-dDPFIVqPGXR",
    mainFile: "",
    folderPath: "",
    v0TemplateId: "dDPFIVqPGXR",
    complexity: "simple",
  },

  // Website 5: A Boring Agency
  // URL: https://v0.app/templates/a-boring-agency-Nynl8DJ6xUH
  {
    id: "boring-agency",
    name: "A Boring Agency",
    description:
      "Kreativ byrå-webbplats med unik design och interaktiva element",
    category: "website",
    previewUrl: "/templates/homepage/5/preview.jpg",
    sourceUrl: "https://v0.app/templates/a-boring-agency-Nynl8DJ6xUH",
    mainFile: "",
    folderPath: "",
    v0TemplateId: "Nynl8DJ6xUH",
    complexity: "simple",
  },

  // Website 6: An Unusual Hero
  // URL: https://v0.app/templates/an-unusual-hero-VZ9EEGUUq9M
  {
    id: "unusual-hero",
    name: "An Unusual Hero",
    description:
      "Modern hero-sektion med SVG-maskning och GSAP-animationer för dynamiska visuella effekter",
    category: "website",
    previewUrl: "/templates/homepage/6/preview.jpg",
    sourceUrl: "https://v0.app/templates/an-unusual-hero-VZ9EEGUUq9M",
    mainFile: "",
    folderPath: "",
    v0TemplateId: "VZ9EEGUUq9M",
    complexity: "advanced",
  },

  // Website 7: Modern Agency Website – Liquid Glass
  // URL: https://v0.app/templates/modern-agency-website-liquid-glass-ezmvVsZJxz8
  {
    id: "liquid-glass",
    name: "Liquid Glass Agency",
    description:
      "Fullständig flersidorswebbplats för byrå med unika flytande glas-effekter (MIT-licens)",
    category: "website",
    previewUrl: "/templates/homepage/7/preview.jpg",
    sourceUrl:
      "https://v0.app/templates/modern-agency-website-liquid-glass-ezmvVsZJxz8",
    mainFile: "",
    folderPath: "",
    v0TemplateId: "ezmvVsZJxz8",
    complexity: "advanced",
  },

  // Website 8: Enhanced Travel Website
  // URL: https://v0.app/templates/enhanced-travel-website-mEefgKyVifq
  {
    id: "travel-website",
    name: "Enhanced Travel Website",
    description:
      "Reseplaneringssida med hero, destinationer, testimonials, resetips och nyhetsbrev",
    category: "website",
    previewUrl: "/templates/homepage/8/preview.jpg",
    sourceUrl: "https://v0.app/templates/enhanced-travel-website-mEefgKyVifq",
    mainFile: "",
    folderPath: "",
    v0TemplateId: "mEefgKyVifq",
    complexity: "simple",
  },

  // Website 9: Minimalist Portfolio
  // URL: https://v0.app/templates/minimalist-portfolio-1DPeR9dunMc
  {
    id: "minimalist-portfolio",
    name: "Minimalist Portfolio",
    description:
      "Minimal portfolio med dark/light tema, elegant typografi och full responsivitet",
    category: "website",
    previewUrl: "/templates/homepage/9/preview.jpg",
    sourceUrl: "https://v0.app/templates/minimalist-portfolio-1DPeR9dunMc",
    mainFile: "",
    folderPath: "",
    v0TemplateId: "1DPeR9dunMc",
    complexity: "simple",
  },

  // Website 10: Portfolio by v0
  // URL: https://v0.app/templates/portfolio-template-by-v0-X6XcPALhbJD
  {
    id: "portfolio-v0",
    name: "Portfolio by v0",
    description:
      "Portfolio för personliga projekt med automatisk GitHub-synk och Vercel-deploy",
    category: "website",
    previewUrl: "/templates/homepage/10/preview.jpg",
    sourceUrl: "https://v0.app/templates/portfolio-template-by-v0-X6XcPALhbJD",
    mainFile: "",
    folderPath: "",
    v0TemplateId: "X6XcPALhbJD",
    complexity: "simple",
  },
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
