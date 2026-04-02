import type { LucideIcon } from "lucide-react";
import {
  Heading,
  FileText,
  Search,
  HelpCircle,
  Palette,
  LayoutGrid,
  Type,
  Smartphone,
  FilePlus,
  Users,
  Mail,
  BookOpen,
  DollarSign,
  Image,
  RefreshCw,
  Video,
  Figma,
  Key,
  Settings,
  StickyNote,
  Globe,
  Download,
  Rocket,
} from "lucide-react";

export type ActionHubItemAction =
  | { type: "prompt"; text: string }
  | { type: "callback"; id: string }
  | { type: "panel"; id: string };

export type ActionHubItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  action: ActionHubItemAction;
};

export type ActionHubCategory = {
  id: string;
  label: string;
  items: ActionHubItem[];
};

export const ACTION_HUB_CATEGORIES: ActionHubCategory[] = [
  {
    id: "content",
    label: "Innehåll",
    items: [
      { id: "edit-heading", label: "Ändra rubrik", icon: Heading, action: { type: "prompt", text: "Ändra huvudrubriken på sidan" } },
      { id: "improve-copy", label: "Förbättra copy", icon: FileText, action: { type: "prompt", text: "Förbättra texterna på sidan så de blir mer engagerande" } },
      { id: "seo", label: "SEO-optimera", icon: Search, action: { type: "prompt", text: "SEO-optimera sidans metadata och texter" } },
      { id: "faq", label: "Vanliga frågor", icon: HelpCircle, action: { type: "prompt", text: "Lägg till en FAQ-sektion med vanliga frågor" } },
    ],
  },
  {
    id: "design",
    label: "Design",
    items: [
      { id: "colors", label: "Färger", icon: Palette, action: { type: "prompt", text: "Ändra färgerna på sajten" } },
      { id: "layout", label: "Layout", icon: LayoutGrid, action: { type: "prompt", text: "Ändra layouten på sidan" } },
      { id: "typography", label: "Typsnitt", icon: Type, action: { type: "prompt", text: "Ändra typsnitten på sidan" } },
      { id: "mobile", label: "Mobil", icon: Smartphone, action: { type: "prompt", text: "Förbättra mobilanpassningen" } },
    ],
  },
  {
    id: "pages",
    label: "Sidor",
    items: [
      { id: "add-page", label: "Ny sida", icon: FilePlus, action: { type: "prompt", text: "Lägg till en ny sida" } },
      { id: "about", label: "Om oss", icon: Users, action: { type: "prompt", text: "Lägg till en Om oss-sida" } },
      { id: "contact", label: "Kontakt", icon: Mail, action: { type: "prompt", text: "Lägg till en kontaktsida med formulär" } },
      { id: "blog", label: "Blogg", icon: BookOpen, action: { type: "prompt", text: "Lägg till en bloggsida" } },
      { id: "pricing", label: "Priser", icon: DollarSign, action: { type: "prompt", text: "Lägg till en prissida" } },
    ],
  },
  {
    id: "media",
    label: "Media",
    items: [
      { id: "upload-images", label: "Ladda upp", icon: Image, action: { type: "prompt", text: "Jag vill ladda upp bilder" } },
      { id: "swap-stock", label: "Byt bilder", icon: RefreshCw, action: { type: "prompt", text: "Byt ut stockbilderna mot mer relevanta" } },
      { id: "add-video", label: "Video", icon: Video, action: { type: "prompt", text: "Lägg till en video på sidan" } },
      { id: "logo", label: "Logo", icon: Figma, action: { type: "prompt", text: "Jag vill lägga till min logotyp" } },
    ],
  },
  {
    id: "settings",
    label: "Inställningar",
    items: [
      { id: "api-keys", label: "API-nycklar", icon: Key, action: { type: "panel", id: "env-vars" } },
      { id: "custom-instructions", label: "Instruktioner", icon: StickyNote, action: { type: "panel", id: "custom-instructions" } },
      { id: "advanced", label: "Avancerat", icon: Settings, action: { type: "callback", id: "switch-pro" } },
    ],
  },
  {
    id: "publish",
    label: "Publicera",
    items: [
      { id: "deploy", label: "Publicera", icon: Rocket, action: { type: "callback", id: "deploy" } },
      { id: "domain", label: "Domän", icon: Globe, action: { type: "callback", id: "domain" } },
      { id: "export", label: "Ladda ner", icon: Download, action: { type: "callback", id: "export" } },
    ],
  },
];
