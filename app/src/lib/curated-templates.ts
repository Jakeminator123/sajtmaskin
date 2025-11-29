// Curated templates from v0 community
// These are hand-picked popular templates that users can use as starting points

export interface CuratedTemplate {
  id: string;           // v0 template ID (the hash at the end of URL)
  slug: string;         // Full URL slug for linking to v0
  name: string;         // Display name
  description: string;  // Short description
  previewUrl: string;   // Preview image URL
  category: string;     // Category ID
  users: string;        // Approximate user count
  likes: string;        // Approximate like count
}

// Preview image URL helper
function getPreviewUrl(slug: string): string {
  return `https://v0.app/api/og/template/${slug}`;
}

// Dashboard templates
const DASHBOARD_TEMPLATES: CuratedTemplate[] = [
  {
    id: "b7GDYVxuoGC",
    slug: "dashboard-m-o-n-k-y-b7GDYVxuoGC",
    name: "Dashboard – M.O.N.K.Y",
    description: "Modern dashboard med mörkt tema, statistik och chat-integration",
    previewUrl: getPreviewUrl("dashboard-m-o-n-k-y-b7GDYVxuoGC"),
    category: "dashboard",
    users: "8.3K",
    likes: "827",
  },
  {
    id: "7KUQGRDlLR7",
    slug: "finbro-dashboard-7KUQGRDlLR7",
    name: "FINBRO Dashboard",
    description: "Finansiell dashboard med grafer och KPI-kort",
    previewUrl: getPreviewUrl("finbro-dashboard-7KUQGRDlLR7"),
    category: "dashboard",
    users: "149",
    likes: "34",
  },
  {
    id: "CmCk1a3Z8Dt",
    slug: "cms-full-form-admin-dashboard-tailwind-template-CmCk1a3Z8Dt",
    name: "CMS Admin Dashboard",
    description: "Komplett admin-panel med Tailwind CSS och formulär",
    previewUrl: getPreviewUrl("cms-full-form-admin-dashboard-tailwind-template-CmCk1a3Z8Dt"),
    category: "dashboard",
    users: "1.7K",
    likes: "229",
  },
  {
    id: "energy-dashboard-xyz",
    slug: "energy-dashboard-xH5mK9pQrLn",
    name: "Energy Dashboard",
    description: "Dashboard för energiövervakning med realtidsdata",
    previewUrl: getPreviewUrl("energy-dashboard-xH5mK9pQrLn"),
    category: "dashboard",
    users: "798",
    likes: "98",
  },
];

// Landing page templates
const LANDING_PAGE_TEMPLATES: CuratedTemplate[] = [
  {
    id: "XQxxv76lK5w",
    slug: "pointer-ai-landing-page-XQxxv76lK5w",
    name: "Pointer AI Landing Page",
    description: "Modern AI-produktsida med mörkt tema och animationer",
    previewUrl: getPreviewUrl("pointer-ai-landing-page-XQxxv76lK5w"),
    category: "landing-page",
    users: "15.6K",
    likes: "1.2K",
  },
  {
    id: "UyYCuYOTkIl",
    slug: "mindspace-saas-landing-page-template-UyYCuYOTkIl",
    name: "MindSpace SaaS Landing",
    description: "Professionell SaaS-landningssida med pricing och features",
    previewUrl: getPreviewUrl("mindspace-saas-landing-page-template-UyYCuYOTkIl"),
    category: "landing-page",
    users: "1.4K",
    likes: "192",
  },
  {
    id: "P9Z65Qo7EJn",
    slug: "flowly-saas-landing-page-template-P9Z65Qo7EJn",
    name: "Flowly SaaS Landing",
    description: "Elegant SaaS-sida med flytande design och CTA-sektioner",
    previewUrl: getPreviewUrl("flowly-saas-landing-page-template-P9Z65Qo7EJn"),
    category: "landing-page",
    users: "516",
    likes: "110",
  },
  {
    id: "brillance-saas",
    slug: "brillance-saas-landing-page-BrLsAaPg123",
    name: "Brillance SaaS",
    description: "Stilren landningssida med gradient-effekter",
    previewUrl: getPreviewUrl("brillance-saas-landing-page-BrLsAaPg123"),
    category: "landing-page",
    users: "7.2K",
    likes: "1.1K",
  },
];

// Website templates
const WEBSITE_TEMPLATES: CuratedTemplate[] = [
  {
    id: "G6XfftYdoJD",
    slug: "shopify-ecommerce-template-G6XfftYdoJD",
    name: "Shopify E-commerce",
    description: "Komplett webshop med produktsidor och varukorg",
    previewUrl: getPreviewUrl("shopify-ecommerce-template-G6XfftYdoJD"),
    category: "website",
    users: "2K",
    likes: "365",
  },
  {
    id: "a0AQPHWDqr3",
    slug: "portfolio-template-a0AQPHWDqr3",
    name: "Portfolio Template",
    description: "Kreativ portfolio för designers och utvecklare",
    previewUrl: getPreviewUrl("portfolio-template-a0AQPHWDqr3"),
    category: "website",
    users: "1.4K",
    likes: "248",
  },
  {
    id: "newsletter-template",
    slug: "newsletter-template-NwLtTr456",
    name: "Newsletter Template",
    description: "Modern nyhetsbrevssida med signup-formulär",
    previewUrl: getPreviewUrl("newsletter-template-NwLtTr456"),
    category: "website",
    users: "1.9K",
    likes: "396",
  },
  {
    id: "3d-gallery",
    slug: "3d-gallery-photography-template-3DgLr789",
    name: "3D Gallery Photography",
    description: "Imponerande 3D-galleri för fotografer",
    previewUrl: getPreviewUrl("3d-gallery-photography-template-3DgLr789"),
    category: "website",
    users: "2.2K",
    likes: "503",
  },
];

// All templates organized by category
export const CURATED_TEMPLATES: Record<string, CuratedTemplate[]> = {
  "dashboard": DASHBOARD_TEMPLATES,
  "landing-page": LANDING_PAGE_TEMPLATES,
  "website": WEBSITE_TEMPLATES,
};

// Get templates for a specific category
export function getTemplatesForCategory(categoryId: string): CuratedTemplate[] {
  return CURATED_TEMPLATES[categoryId] || [];
}

// Get all templates
export function getAllTemplates(): CuratedTemplate[] {
  return [
    ...DASHBOARD_TEMPLATES,
    ...LANDING_PAGE_TEMPLATES,
    ...WEBSITE_TEMPLATES,
  ];
}

// Get a specific template by ID
export function getTemplateById(templateId: string): CuratedTemplate | undefined {
  return getAllTemplates().find((t) => t.id === templateId);
}

