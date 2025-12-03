// Local templates stored in the project
// These are downloaded v0 templates that users can use as starting points

export interface LocalTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  previewUrl: string; // For display (can be placeholder or screenshot)
  sourceUrl: string; // Original v0 URL for reference
  mainFile: string; // Path to the main page.tsx file
  folderPath: string; // Path to the template folder
}

export const LOCAL_TEMPLATES: LocalTemplate[] = [
  {
    id: "globe-to-map",
    name: "Globe To Map Transform",
    description:
      "Interaktiv 3D-visualisering som transformerar en glob till en 2D-karta med animationer",
    category: "landing-page",
    previewUrl: "/templates/landing_page/1/preview.png",
    sourceUrl: "https://v0.app/templates/globe-to-map-transform-99MAOQptgL3",
    mainFile: "app/page.tsx",
    folderPath: "landing-page/globe-to-map",
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
