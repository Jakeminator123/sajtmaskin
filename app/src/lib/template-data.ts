// Curated template data for each category
// Template IDs are from v0.app/templates community

export interface Template {
  id: string; // v0 chat ID
  name: string;
  description: string;
  previewUrl?: string; // Screenshot URL
}

export interface CategoryInfo {
  id: string;
  title: string;
  description: string;
  icon: string; // Lucide icon name
  templates: Template[];
}

// Category metadata with templates
export const CATEGORIES: Record<string, CategoryInfo> = {
  "landing-page": {
    id: "landing-page",
    title: "Landing Page",
    description: "Produktsidor, startups, kampanjer",
    icon: "FileText",
    templates: [
      {
        id: "brillance-saas",
        name: "Brillance SaaS",
        description: "Elegant SaaS landing med gradient och animationer",
      },
      {
        id: "pointer-ai",
        name: "Pointer AI",
        description: "Modern AI-produkt landing page",
      },
      {
        id: "skal-ventures",
        name: "Skal Ventures",
        description: "Professionell startup/VC landing",
      },
      {
        id: "mindspace-saas",
        name: "MindSpace SaaS",
        description: "Minimalistisk SaaS-template",
      },
      {
        id: "auralink-saas",
        name: "Auralink",
        description: "Färgglad SaaS med glassmorphism",
      },
    ],
  },
  website: {
    id: "website",
    title: "Hemsida",
    description: "Kompletta flersidiga webbplatser",
    icon: "Globe",
    templates: [
      {
        id: "marketing-website",
        name: "Marketing Website",
        description: "Komplett marknadsföringssajt med flera sidor",
      },
      {
        id: "agency-liquid-glass",
        name: "Agency Liquid Glass",
        description: "Modern byrå-webbplats med glaseffekter",
      },
      {
        id: "katachi-website",
        name: "Katachi",
        description: "Japansk-inspirerad minimalistisk design",
      },
    ],
  },
  "apps-games": {
    id: "apps-games",
    title: "Apps & Spel",
    description: "Interaktiva applikationer och spel",
    icon: "Gamepad2",
    templates: [
      {
        id: "nano-banana",
        name: "Nano Banana Playground",
        description: "Kreativ app-playground med 3D-element",
      },
      {
        id: "habbo-chatroom",
        name: "Habbo Chatroom",
        description: "Multiplayer chatroom med retro-stil",
      },
      {
        id: "macos-simulator",
        name: "macOS Simulator",
        description: "Realistisk macOS-liknande interface",
      },
    ],
  },
  dashboard: {
    id: "dashboard",
    title: "Dashboard",
    description: "Admin-paneler, statistik, data",
    icon: "LayoutDashboard",
    templates: [
      {
        id: "monky-dashboard",
        name: "M.O.N.K.Y Dashboard",
        description: "Mörk admin-panel med diagram och statistik",
      },
      {
        id: "finbro-dashboard",
        name: "FINBRO Dashboard",
        description: "Finansiell dashboard med grafer",
      },
      {
        id: "cms-admin",
        name: "CMS Admin",
        description: "Content management system-panel",
      },
    ],
  },
  ecommerce: {
    id: "ecommerce",
    title: "E-commerce",
    description: "Webbshoppar och produktkataloger",
    icon: "ShoppingCart",
    templates: [
      {
        id: "shopify-template",
        name: "Shopify Template",
        description: "Komplett e-handelslösning",
      },
    ],
  },
  "blog-portfolio": {
    id: "blog-portfolio",
    title: "Blogg & Portfolio",
    description: "Visa upp ditt arbete och innehåll",
    icon: "Briefcase",
    templates: [
      {
        id: "minimalist-portfolio",
        name: "Minimalist Portfolio",
        description: "Ren portfolio för kreativa",
      },
      {
        id: "paperfolio",
        name: "Paperfolio",
        description: "Pappersliknande portfolio-design",
      },
      {
        id: "3d-gallery",
        name: "3D Gallery",
        description: "Fotografportfolio med 3D-effekter",
      },
      {
        id: "brutalist-portfolio",
        name: "Brutalist Void",
        description: "Experimentell brutalistisk design",
      },
    ],
  },
  components: {
    id: "components",
    title: "Komponenter",
    description: "Enskilda UI-komponenter",
    icon: "Puzzle",
    templates: [
      {
        id: "newsletter-template",
        name: "Newsletter",
        description: "Nyhetsbrev signup-sektion",
      },
      {
        id: "form-template",
        name: "Form Template",
        description: "Snygg formulär-komponent",
      },
      {
        id: "waitlist",
        name: "Waitlist",
        description: "Väntelista signup-komponent",
      },
    ],
  },
  "login-signup": {
    id: "login-signup",
    title: "Login & Sign Up",
    description: "Autentiseringssidor",
    icon: "LogIn",
    templates: [
      {
        id: "modern-login",
        name: "Modern Login",
        description: "Stilren inloggningssida",
      },
    ],
  },
  animations: {
    id: "animations",
    title: "Animationer",
    description: "Animerade komponenter och effekter",
    icon: "Sparkles",
    templates: [
      {
        id: "fluid-cta",
        name: "Fluid CTA Animation",
        description: "Flytande animerad CTA-knapp",
      },
      {
        id: "shader-gradient",
        name: "Shader Gradient",
        description: "WebGL shader-bakgrund",
      },
      {
        id: "shaders-landing",
        name: "Shaders Landing",
        description: "Landing page med shader-animationer",
      },
    ],
  },
};

// Get all category IDs
export const CATEGORY_IDS = Object.keys(CATEGORIES);

// Get category by ID
export function getCategory(id: string): CategoryInfo | undefined {
  return CATEGORIES[id];
}

// Get templates for a category
export function getTemplatesForCategory(categoryId: string): Template[] {
  return CATEGORIES[categoryId]?.templates || [];
}

// Category titles in Swedish for display
export const CATEGORY_TITLES: Record<string, string> = {
  "landing-page": "Landing Page",
  website: "Hemsida",
  "apps-games": "Apps & Spel",
  dashboard: "Dashboard",
  ecommerce: "E-commerce",
  "blog-portfolio": "Blogg & Portfolio",
  components: "Komponenter",
  "login-signup": "Login & Sign Up",
  animations: "Animationer",
};

