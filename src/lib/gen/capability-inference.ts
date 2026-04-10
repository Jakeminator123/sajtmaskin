/**
 * Capability inference — classifies what a prompt needs so that the
 * system prompt and docs injection can be tuned accordingly.
 *
 * Runs before generation. Fast, deterministic, no API calls.
 */

export interface InferredCapabilities {
  needsMotion: boolean;
  needs3D: boolean;
  needsCharts: boolean;
  needsDatabase: boolean;
  needsAuth: boolean;
  needsAppShell: boolean;
  needsDataUI: boolean;
  needsForms: boolean;
  needsEcommerce: boolean;
  needsCarousel: boolean;
  needsPremiumVisuals: boolean;
}

interface CapabilityRule {
  key: keyof InferredCapabilities;
  patterns: RegExp[];
}

const RULES: CapabilityRule[] = [
  {
    key: "needsMotion",
    patterns: [
      /\b(animat|motion|framer|transition|fade|slide|parallax|stagger|entrance|animate|rörelse|animering|effekt|wow|premium|immersive|futurist)\b/i,
      /\b(hover.*(effect|animation)|scroll.*(reveal|trigger|animat))\b/i,
    ],
  },
  {
    key: "needs3D",
    patterns: [
      /\b(3d|three\.?js|webgl|canvas|mesh|orb|sphere|particle|three-fiber|@react-three|drei|scene|3d-?model)\b/i,
      /\b3d[a-zåäö-]+\b/i,
      /\b(rotat.*3d|tilt|perspect.*card|floating.*object)\b/i,
      /\b(rapier|cannon|physics|gravitation|gravity|rigidbody|collider|gltf|glb|usegltf)\b/i,
    ],
  },
  {
    key: "needsCharts",
    patterns: [
      /\b(chart|graph|diagram|analytics|visuali[sz]|recharts|line.?chart|bar.?chart|pie.?chart|area.?chart|statistik|graf|data.?viz)\b/i,
    ],
  },
  {
    key: "needsDatabase",
    patterns: [
      /\b(database|db|postgres|postgresql|mysql|sqlite|supabase|prisma|drizzle|sql|schema|migration|env\b.*database|databas)\b/i,
    ],
  },
  {
    key: "needsAuth",
    patterns: [
      /\b(auth|login|sign.?up|sign.?in|register|password|forgot.?password|reset.?password|inloggning|registrer|logga.?in|lösenord|konto|session|oauth|jwt)\b/i,
    ],
  },
  {
    key: "needsAppShell",
    patterns: [
      /\b(dashboard|admin.?panel|sidebar|crm|backoffice|settings.?page|user.?manage|instrumentpanel|kontrollpanel|workspace|portal)\b/i,
      /\b(app-?lik|appkänsla|app-känsla|app-?aktig|app shell|app-lik)\b/i,
      /\b(gränssnitt|interface|undersökningsgränssnitt|kontrollrum|control room)\b/i,
    ],
  },
  {
    key: "needsDataUI",
    patterns: [
      /\b(data.?table|sorting|filtering|pagination|tanstack|table|tabell|crud|list.?view|datav[iy])\b/i,
    ],
  },
  {
    key: "needsForms",
    patterns: [
      /\b(form|contact.?form|booking|boka|survey|questionnaire|formulär|kontakt|multi.?step|wizard.?form)\b/i,
    ],
  },
  {
    key: "needsEcommerce",
    patterns: [
      /\b(ecommerce|e-?commerce|e-?handel|shop|store|cart|varukorg|checkout|kassa|product|produkt|storefront|webshop|payment)\b/i,
    ],
  },
  {
    key: "needsCarousel",
    patterns: [
      /\b(carousel|slider|slideshow|gallery|swipe|karusell|bildspel|image.?gallery|hero.?slider)\b/i,
    ],
  },
  {
    key: "needsPremiumVisuals",
    patterns: [
      /\b(premium|luxury|glassmorphism|glass|neon|glow|gradient.?text|blur|frosted|modern.*design|sleek|elegant|sophisticated|futuristisk|exklusiv)\b/i,
      /\b(dark.?mode.*hero|spotlight|cinematic|atmospheric|immersive)\b/i,
      /\b(filmisk|filmiskt|cinematisk|cinematiskt|arkiv.?x|x-files|ufo|paranormal)\b/i,
    ],
  },
];

export function inferCapabilities(prompt: string): InferredCapabilities {
  const result: InferredCapabilities = {
    needsMotion: false,
    needs3D: false,
    needsCharts: false,
    needsDatabase: false,
    needsAuth: false,
    needsAppShell: false,
    needsDataUI: false,
    needsForms: false,
    needsEcommerce: false,
    needsCarousel: false,
    needsPremiumVisuals: false,
  };

  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(prompt)) {
        result[rule.key] = true;
        break;
      }
    }
  }

  if (result.needs3D) result.needsMotion = true;
  if (result.needsPremiumVisuals) result.needsMotion = true;

  if (result.needsEcommerce) {
    const hospitalityVeto =
      /\b(restaurang|restaurant|café|cafe|kafé|bistro|hotell|hotel|spa|salong|salon|klinik|clinic|bakeri|bageri|bakery|pizzeria|catering|matrestaurang|boka bord|book a table|meny|menu|öppettider|opening hours)\b/i;
    const strongEcommerceIntent =
      /\b(webshop|webbshop|e-handel|ecommerce|e-commerce|varukorg|kundvagn|cart|checkout|kassa|storefront|nätbutik|online store)\b/i;
    if (hospitalityVeto.test(prompt) && !strongEcommerceIntent.test(prompt)) {
      result.needsEcommerce = false;
    }
  }

  return result;
}

/**
 * True when any capability flag indicates a non-trivial UI/product feature.
 * Used to prevent capability-heavy follow-ups from being treated as tiny tweaks.
 */
export function hasHeavyCapabilities(caps: InferredCapabilities): boolean {
  return (
    caps.needs3D ||
    caps.needsCarousel ||
    caps.needsCharts ||
    caps.needsPremiumVisuals ||
    caps.needsAppShell ||
    caps.needsDataUI ||
    caps.needsEcommerce
  );
}

export {
  buildCapabilityHints,
  resolveCapabilityPacks,
  collectPackDeps,
  type CapabilityPack,
} from "./capability-packs";
