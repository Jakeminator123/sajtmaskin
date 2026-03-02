export type ShadcnComponentCategoryId =
  | "inputs"
  | "forms"
  | "overlay"
  | "navigation"
  | "layout"
  | "feedback"
  | "data"
  | "table"
  | "typography"
  | "other";

export type ComponentPreviewKind =
  | "inputs"
  | "forms"
  | "overlay"
  | "navigation"
  | "layout"
  | "feedback"
  | "data"
  | "table"
  | "typography"
  | "other";

export interface ShadcnComponentMetadata {
  category: ShadcnComponentCategoryId;
  previewKind: ComponentPreviewKind;
  iconKey: ComponentPreviewKind;
  usageHint: string;
}

const DEFAULT_COMPONENT_METADATA: ShadcnComponentMetadata = {
  category: "other",
  previewKind: "other",
  iconKey: "other",
  usageHint: "Bra bas-komponent att anpassa efter din layout och ditt innehåll.",
};

const CATEGORY_LABELS_SV: Record<ShadcnComponentCategoryId, string> = {
  inputs: "Inmatning",
  forms: "Formulär",
  overlay: "Overlay",
  navigation: "Navigation",
  layout: "Layout",
  feedback: "Feedback",
  data: "Data",
  table: "Tabeller",
  typography: "Typografi",
  other: "Övrigt",
};

const CURATED_COMPONENT_METADATA: Record<string, ShadcnComponentMetadata> = {
  accordion: {
    category: "layout",
    previewKind: "layout",
    iconKey: "layout",
    usageHint: "Visa längre innehåll i vikbara sektioner för bättre överblick.",
  },
  alert: {
    category: "feedback",
    previewKind: "feedback",
    iconKey: "feedback",
    usageHint: "Lyft viktiga meddelanden och status direkt i innehållet.",
  },
  "alert-dialog": {
    category: "overlay",
    previewKind: "overlay",
    iconKey: "overlay",
    usageHint: "Använd för kritiska bekräftelser, t.ex. radera eller återställ.",
  },
  "aspect-ratio": {
    category: "layout",
    previewKind: "layout",
    iconKey: "layout",
    usageHint: "Håll bilder och media i konsekvent proportion över alla skärmar.",
  },
  avatar: {
    category: "data",
    previewKind: "data",
    iconKey: "data",
    usageHint: "Visa användaridentitet i listor, kort och konversationer.",
  },
  badge: {
    category: "feedback",
    previewKind: "feedback",
    iconKey: "feedback",
    usageHint: "Markera status, etiketter och små metadata visuellt.",
  },
  breadcrumb: {
    category: "navigation",
    previewKind: "navigation",
    iconKey: "navigation",
    usageHint: "Hjälper användaren förstå plats i informationshierarkin.",
  },
  button: {
    category: "inputs",
    previewKind: "inputs",
    iconKey: "inputs",
    usageHint: "Primär call-to-action för nästa steg i flödet.",
  },
  calendar: {
    category: "inputs",
    previewKind: "inputs",
    iconKey: "inputs",
    usageHint: "Perfekt för datumval i bokning, filter och formulär.",
  },
  card: {
    category: "layout",
    previewKind: "layout",
    iconKey: "layout",
    usageHint: "Bygg modulära innehållssektioner med en tydlig struktur.",
  },
  carousel: {
    category: "layout",
    previewKind: "layout",
    iconKey: "layout",
    usageHint: "Visa flera objekt i ett kompakt, svepbart format.",
  },
  chart: {
    category: "data",
    previewKind: "data",
    iconKey: "data",
    usageHint: "Visualisera data med tydliga diagram och trendindikatorer.",
  },
  checkbox: {
    category: "inputs",
    previewKind: "inputs",
    iconKey: "inputs",
    usageHint: "För flerval i formulär, filter och inställningar.",
  },
  collapsible: {
    category: "layout",
    previewKind: "layout",
    iconKey: "layout",
    usageHint: "Dölj sekundärt innehåll tills användaren behöver det.",
  },
  command: {
    category: "navigation",
    previewKind: "navigation",
    iconKey: "navigation",
    usageHint: "Snabbnavigering via kommandopalett och tangentbordsflöde.",
  },
  "context-menu": {
    category: "navigation",
    previewKind: "navigation",
    iconKey: "navigation",
    usageHint: "Visa kontextuella åtgärder nära det valda objektet.",
  },
  dialog: {
    category: "overlay",
    previewKind: "overlay",
    iconKey: "overlay",
    usageHint: "Öppna fokuserade arbetsflöden utan att lämna sidan.",
  },
  drawer: {
    category: "overlay",
    previewKind: "overlay",
    iconKey: "overlay",
    usageHint: "Bra för inställningar och detaljpaneler från sidan.",
  },
  "dropdown-menu": {
    category: "navigation",
    previewKind: "navigation",
    iconKey: "navigation",
    usageHint: "Kompakt meny för sekundära val och åtgärder.",
  },
  form: {
    category: "forms",
    previewKind: "forms",
    iconKey: "forms",
    usageHint: "Bygg robusta formulär med validering och tydlig struktur.",
  },
  "hover-card": {
    category: "overlay",
    previewKind: "overlay",
    iconKey: "overlay",
    usageHint: "Visa extra kontext vid hover utan att störa flödet.",
  },
  input: {
    category: "inputs",
    previewKind: "inputs",
    iconKey: "inputs",
    usageHint: "Basfält för textinmatning i nästan alla formulär.",
  },
  "input-otp": {
    category: "inputs",
    previewKind: "inputs",
    iconKey: "inputs",
    usageHint: "Specialiserat fält för engångskoder och verifiering.",
  },
  label: {
    category: "forms",
    previewKind: "forms",
    iconKey: "forms",
    usageHint: "Gör formulär tydligare och mer tillgängliga.",
  },
  menubar: {
    category: "navigation",
    previewKind: "navigation",
    iconKey: "navigation",
    usageHint: "Klassisk menyrad för app-liknande gränssnitt.",
  },
  "navigation-menu": {
    category: "navigation",
    previewKind: "navigation",
    iconKey: "navigation",
    usageHint: "Bygg primär navigering med dropdown-stöd.",
  },
  pagination: {
    category: "navigation",
    previewKind: "navigation",
    iconKey: "navigation",
    usageHint: "Låt användaren bläddra i längre listor och resultat.",
  },
  popover: {
    category: "overlay",
    previewKind: "overlay",
    iconKey: "overlay",
    usageHint: "Visa små interaktiva paneler nära trigger-elementet.",
  },
  progress: {
    category: "feedback",
    previewKind: "feedback",
    iconKey: "feedback",
    usageHint: "Visualisera status i uppladdning, onboarding och processer.",
  },
  "radio-group": {
    category: "inputs",
    previewKind: "inputs",
    iconKey: "inputs",
    usageHint: "Låt användaren välja exakt ett alternativ.",
  },
  resizable: {
    category: "layout",
    previewKind: "layout",
    iconKey: "layout",
    usageHint: "Ge användaren möjlighet att justera panelstorlek.",
  },
  "scroll-area": {
    category: "layout",
    previewKind: "layout",
    iconKey: "layout",
    usageHint: "För snyggare scroll i paneler med begränsat utrymme.",
  },
  select: {
    category: "inputs",
    previewKind: "inputs",
    iconKey: "inputs",
    usageHint: "Dropdown för kontrollerade val i formulär och filter.",
  },
  separator: {
    category: "layout",
    previewKind: "layout",
    iconKey: "layout",
    usageHint: "Skapa tydlig visuell separation mellan innehållsdelar.",
  },
  sheet: {
    category: "overlay",
    previewKind: "overlay",
    iconKey: "overlay",
    usageHint: "Sidopanel för snabba actions och contextual settings.",
  },
  sidebar: {
    category: "navigation",
    previewKind: "navigation",
    iconKey: "navigation",
    usageHint: "Stabil appnavigation med plats för menyer och grupper.",
  },
  skeleton: {
    category: "feedback",
    previewKind: "feedback",
    iconKey: "feedback",
    usageHint: "Minska upplevd väntetid med laddningsplaceholder.",
  },
  slider: {
    category: "inputs",
    previewKind: "inputs",
    iconKey: "inputs",
    usageHint: "Numeriskt intervallval med snabb visuell kontroll.",
  },
  sonner: {
    category: "feedback",
    previewKind: "feedback",
    iconKey: "feedback",
    usageHint: "Toast-notiser för bekräftelser och bakgrundshändelser.",
  },
  switch: {
    category: "inputs",
    previewKind: "inputs",
    iconKey: "inputs",
    usageHint: "Tydlig av/på-kontroll i inställningar och preferenser.",
  },
  table: {
    category: "table",
    previewKind: "table",
    iconKey: "table",
    usageHint: "Presentera strukturerad data med rader och kolumner.",
  },
  tabs: {
    category: "navigation",
    previewKind: "navigation",
    iconKey: "navigation",
    usageHint: "Dela upp relaterat innehåll i tydliga vyer.",
  },
  textarea: {
    category: "inputs",
    previewKind: "inputs",
    iconKey: "inputs",
    usageHint: "För längre textinmatning som meddelanden eller beskrivningar.",
  },
  toast: {
    category: "feedback",
    previewKind: "feedback",
    iconKey: "feedback",
    usageHint: "Diskreta notiser som bekräftar handlingar i bakgrunden.",
  },
  toggle: {
    category: "inputs",
    previewKind: "inputs",
    iconKey: "inputs",
    usageHint: "Enstaka togglaction med tydlig aktiv/inaktiv status.",
  },
  "toggle-group": {
    category: "inputs",
    previewKind: "inputs",
    iconKey: "inputs",
    usageHint: "Låt användaren växla mellan flera relaterade val.",
  },
  tooltip: {
    category: "overlay",
    previewKind: "overlay",
    iconKey: "overlay",
    usageHint: "Visa kort hjälpinformation nära ett UI-element.",
  },
  typography: {
    category: "typography",
    previewKind: "typography",
    iconKey: "typography",
    usageHint: "Standardiserad textstil för rubriker, brödtext och listor.",
  },
};

const HEURISTIC_RULES: Array<{
  category: ShadcnComponentCategoryId;
  previewKind: ComponentPreviewKind;
  usageHint: string;
  nameTokens: string[];
}> = [
  {
    category: "overlay",
    previewKind: "overlay",
    usageHint: "Overlay-komponent för fokuserat innehåll eller snabba actions.",
    nameTokens: ["dialog", "drawer", "sheet", "popover", "tooltip", "hover-card", "modal"],
  },
  {
    category: "navigation",
    previewKind: "navigation",
    usageHint: "Navigationskomponent som hjälper användaren orientera sig.",
    nameTokens: ["menu", "breadcrumb", "sidebar", "tabs", "pagination", "command"],
  },
  {
    category: "forms",
    previewKind: "forms",
    usageHint: "Formulärbyggsten med fokus på struktur och validering.",
    nameTokens: ["form", "field", "label"],
  },
  {
    category: "inputs",
    previewKind: "inputs",
    usageHint: "Inmatningskomponent för användarens val och data.",
    nameTokens: ["input", "checkbox", "radio", "select", "slider", "switch", "toggle", "textarea"],
  },
  {
    category: "feedback",
    previewKind: "feedback",
    usageHint: "Feedbackkomponent för status, laddning och notifieringar.",
    nameTokens: ["alert", "toast", "skeleton", "progress", "badge"],
  },
  {
    category: "table",
    previewKind: "table",
    usageHint: "Tabellkomponent för strukturerad data i rader och kolumner.",
    nameTokens: ["table", "datatable"],
  },
  {
    category: "data",
    previewKind: "data",
    usageHint: "Datakomponent för visualisering och objektpresentation.",
    nameTokens: ["chart", "avatar", "stat", "metric"],
  },
  {
    category: "layout",
    previewKind: "layout",
    usageHint: "Layoutkomponent för att strukturera innehåll och ytor.",
    nameTokens: ["card", "accordion", "collapsible", "resizable", "separator", "aspect-ratio", "scroll"],
  },
  {
    category: "typography",
    previewKind: "typography",
    usageHint: "Typografikomponent för konsekvent textpresentation.",
    nameTokens: ["typography", "heading", "text"],
  },
];

function resolveFromHeuristics(
  normalizedName: string,
  normalizedDescription: string,
): ShadcnComponentMetadata {
  for (const rule of HEURISTIC_RULES) {
    const match = rule.nameTokens.some(
      (token) =>
        normalizedName.includes(token) ||
        (normalizedDescription.length > 0 && normalizedDescription.includes(token)),
    );
    if (match) {
      return {
        category: rule.category,
        previewKind: rule.previewKind,
        iconKey: rule.previewKind,
        usageHint: rule.usageHint,
      };
    }
  }
  return DEFAULT_COMPONENT_METADATA;
}

export function resolveShadcnComponentMetadata(
  name: string,
  description?: string,
): ShadcnComponentMetadata {
  const normalizedName = name.trim().toLowerCase();
  const normalizedDescription = (description || "").trim().toLowerCase();
  const curated = CURATED_COMPONENT_METADATA[normalizedName];
  if (curated) return curated;
  return resolveFromHeuristics(normalizedName, normalizedDescription);
}

export function getShadcnComponentCategoryLabelSv(category: string): string {
  const key = category.trim().toLowerCase() as ShadcnComponentCategoryId;
  return CATEGORY_LABELS_SV[key] ?? CATEGORY_LABELS_SV.other;
}
