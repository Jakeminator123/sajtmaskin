/**
 * Local Templates Registry
 * ========================
 *
 * Nedladdade v0-mallar som användare kan använda som utgångspunkt.
 * Mallarna lagras i: src/templates/{category}/{template-id}/
 *
 * FLÖDE NÄR ANVÄNDARE VÄLJER EN MALL:
 *
 * 1. Om mallen har v0TemplateId:
 *    → Försök ladda direkt från v0 API (bästa kvalitet)
 *    → Om det misslyckas, fall tillbaka till kod-baserad approach
 *
 * 2. Om mallen INTE har v0TemplateId (chat-URL):
 *    → Läs lokal kod från src/templates/
 *    → Skicka koden till v0 API för att få hostad preview
 *    → v0 genererar en förenklad version baserad på koden
 *
 * COMPLEXITY-FÄLTET:
 * - "simple": CSS/SVG/standard React - v0 kan återskapa nära originalet
 * - "advanced": Three.js/d3/WebGL - v0 skapar förenklad "inspirerad" version
 *
 * MAPPSTRUKTUR (src/templates/):
 * └── landing-page/
 *     ├── cosmos-3d/        (advanced - Three.js)
 *     ├── animated-hero/    (simple - CSS/SVG)
 *     └── brillance-saas/   (simple - standard React)
 */

export interface LocalTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  previewUrl: string; // For display (can be placeholder or screenshot)
  sourceUrl: string; // Original v0 URL for reference
  mainFile: string; // Path to the main page.tsx file
  folderPath: string; // Path to the template folder
  v0TemplateId?: string; // Direct v0 template ID if available (use this first!)
  complexity: "simple" | "advanced"; // Simple = can recreate, Advanced = needs simplification
}

export const LOCAL_TEMPLATES: LocalTemplate[] = [
  // ========== LANDING PAGES ==========
  {
    id: "cosmos-3d",
    name: "Cosmos — 3D Orbit Gallery",
    description:
      "Fantastisk 3D-partikelsfär med orbiterande bildgalleri och rymdtema",
    category: "landing-page",
    previewUrl: "/templates/landing_page/1/preview.png",
    sourceUrl:
      "https://v0.app/templates/cosmos-3d-orbit-gallery-template-W8w0SZdos3x",
    mainFile: "app/page.tsx",
    folderPath: "landing-page/cosmos-3d",
    v0TemplateId: "cosmos-3d-orbit-gallery-template-W8w0SZdos3x", // Can use directly!
    complexity: "advanced", // Three.js - will be simplified
  },
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
    // No v0TemplateId - it's a chat URL, will use code
    complexity: "simple", // Pure CSS/SVG - can recreate accurately
  },
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
    // No v0TemplateId - it's a chat URL, will use code
    complexity: "simple", // Standard React - can recreate accurately
  },

  // ========== DASHBOARDS ==========
  // TEST: Using v0TemplateId directly - no local files needed!
  {
    id: "black-friday-map",
    name: "Vercel Black Friday Map",
    description:
      "Pixelerad världskarta i Vercel-stil med interaktiv datavisualisering",
    category: "dashboard",
    previewUrl: "/templates/dashboards/1/preview.png", // Placeholder - can add later
    sourceUrl:
      "https://v0.app/templates/vercel-style-black-friday-map-hUI7hCyGNye",
    mainFile: "", // Not needed - using v0TemplateId
    folderPath: "", // Not needed - using v0TemplateId
    v0TemplateId: "vercel-style-black-friday-map-hUI7hCyGNye", // Direct v0 template!
    complexity: "advanced", // Pixel map visualization
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
