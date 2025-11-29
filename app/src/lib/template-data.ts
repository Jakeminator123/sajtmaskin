// Curated template data for each category
// Template IDs are from v0.app/templates community

export interface Template {
  id: string; // v0 chat ID
  name: string;
  description: string;
  previewUrl?: string; // Screenshot URL
}

export interface QuickPrompt {
  label: string;
  prompt: string;
}

export interface CategoryInfo {
  id: string;
  title: string;
  description: string;
  icon: string; // Lucide icon name
  templates: Template[];
  quickPrompts: QuickPrompt[];
}

// Category metadata with templates and quick prompts
export const CATEGORIES: Record<string, CategoryInfo> = {
  "landing-page": {
    id: "landing-page",
    title: "Landing Page",
    description: "Enkla one-pagers för produkter och kampanjer",
    icon: "FileText",
    quickPrompts: [
      {
        label: "Modern SaaS-startup",
        prompt:
          "Skapa en modern landing page för en SaaS-startup med hero-sektion, features, pricing och kontaktformulär. Använd en mörk tema med blå accenter och moderna animationer.",
      },
      {
        label: "Portfolio för fotograf",
        prompt:
          "Skapa en elegant portfolio-landing page för en fotograf med bildgalleri, om mig-sektion och kontaktformulär. Minimalistisk design med fokus på bilderna.",
      },
      {
        label: "Produktlansering",
        prompt:
          "Skapa en produktlanseringssida med hero-sektion, produktbilder, features, testimonials och call-to-action. Lyxig och professionell känsla.",
      },
      {
        label: "Event/konferens",
        prompt:
          "Skapa en landing page för en tech-konferens med datum, talare, agenda, plats och registreringsformulär. Modern och energisk design.",
      },
    ],
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
    quickPrompts: [
      {
        label: "Tech-företag",
        prompt:
          "Skapa en komplett företagswebbplats för ett tech-företag med startsida, om oss, tjänster och kontakt. Professionell design med navigation mellan sidorna.",
      },
      {
        label: "Restaurang med meny",
        prompt:
          "Skapa en restaurangwebbplats med startsida, meny, om oss, galleri och kontakt/bokning. Varm och inbjudande design med bilder på mat.",
      },
      {
        label: "Konsultbyrå",
        prompt:
          "Skapa en webbplats för en konsultbyrå med startsida, tjänster, team, case studies och kontakt. Professionell och trovärdig design.",
      },
      {
        label: "Ideell organisation",
        prompt:
          "Skapa en webbplats för en ideell organisation med startsida, om oss, projekt, hur man kan hjälpa till och kontakt. Engagerande och inspirerande design.",
      },
    ],
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
  dashboard: {
    id: "dashboard",
    title: "Dashboard",
    description: "Admin-paneler och datavisualisering",
    icon: "LayoutDashboard",
    quickPrompts: [
      {
        label: "Försäljningsstatistik",
        prompt:
          "Skapa en försäljnings-dashboard med KPI-kort, linjediagram för försäljning över tid, cirkeldiagram för kategorier och en tabell med senaste ordrar. Mörkt tema.",
      },
      {
        label: "Projekthantering",
        prompt:
          "Skapa en projekthanteringsdashboard med uppgiftslista, kanban-vy, teammedlemmar, tidslinjer och statusöversikt. Modern och funktionell design.",
      },
      {
        label: "Analytics-panel",
        prompt:
          "Skapa en analytics-dashboard med besökarstatistik, sidvisningar, bounce rate, geografisk fördelning och realtidsdata. Liknande Google Analytics.",
      },
      {
        label: "CRM-översikt",
        prompt:
          "Skapa en CRM-dashboard med leads pipeline, kundlista, aktivitetslogg och försäljningsmål. Professionell B2B-design.",
      },
    ],
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
};

// Components that can be added to any project (used in builder)
export const COMPONENTS: QuickPrompt[] = [
  {
    label: "Header/Navigation",
    prompt: "Lägg till en modern header med logotyp, navigation och CTA-knapp.",
  },
  {
    label: "Footer",
    prompt:
      "Lägg till en footer med länkar, sociala medier-ikoner och copyright.",
  },
  {
    label: "Pricing Table",
    prompt: "Lägg till en pricing-sektion med 3 prisplaner och features-lista.",
  },
  {
    label: "Contact Form",
    prompt:
      "Lägg till ett kontaktformulär med namn, email, meddelande och skicka-knapp.",
  },
  {
    label: "Testimonials",
    prompt:
      "Lägg till en testimonials-sektion med kundcitat, bilder och företagsnamn.",
  },
  {
    label: "FAQ Accordion",
    prompt:
      "Lägg till en FAQ-sektion med expanderbara frågor och svar i accordion-stil.",
  },
  {
    label: "Feature Grid",
    prompt:
      "Lägg till en feature-sektion med ikoner, rubriker och beskrivningar i ett grid.",
  },
  {
    label: "Newsletter Signup",
    prompt:
      "Lägg till en newsletter-sektion med email-input och prenumerera-knapp.",
  },
  {
    label: "Hero Section",
    prompt:
      "Lägg till en hero-sektion med stor rubrik, beskrivning och CTA-knappar.",
  },
  {
    label: "Image Gallery",
    prompt:
      "Lägg till ett bildgalleri med hover-effekter och lightbox-funktionalitet.",
  },
];

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

// Get quick prompts for a category
export function getQuickPromptsForCategory(categoryId: string): QuickPrompt[] {
  return CATEGORIES[categoryId]?.quickPrompts || [];
}

// Category titles in Swedish for display
export const CATEGORY_TITLES: Record<string, string> = {
  "landing-page": "Landing Page",
  website: "Hemsida",
  dashboard: "Dashboard",
};
