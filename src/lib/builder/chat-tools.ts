import {
  Activity,
  Archive,
  Braces,
  Bug,
  Building2,
  CheckCheck,
  CheckCircle2,
  CircleCheck,
  Code2,
  Coins,
  Command,
  Download,
  ExternalLink,
  FileText,
  FolderTree,
  Gauge,
  GitBranch,
  GitCompare,
  Github,
  Globe,
  HelpCircle,
  History,
  Image as ImageIcon,
  Inbox,
  KeyRound,
  LayoutGrid,
  Lightbulb,
  Link2,
  ListOrdered,
  MessageSquare,
  Monitor,
  Moon,
  MousePointer,
  Palette,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  Rocket,
  RotateCcw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Square,
  Stethoscope,
  ThumbsUp,
  Type,
  Upload,
  Wand2,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export type ToolGroupId =
  | "generate"
  | "preview"
  | "content"
  | "versions"
  | "publish"
  | "quality"
  | "data"
  | "help";

export type ToolActionId =
  | "generate.new"
  | "generate.regenerate"
  | "generate.stop"
  | "generate.switchScaffold"
  | "generate.switchModel"
  | "generate.deepBrief"
  | "generate.polishPrompt"
  | "generate.plan"
  | "generate.elements"
  | "generate.theme"
  | "preview.refresh"
  | "preview.restart"
  | "preview.destroy"
  | "preview.hibernate"
  | "preview.status"
  | "preview.device"
  | "preview.inspect"
  | "preview.openExternal"
  | "preview.codeView"
  | "preview.registry"
  | "content.uploadMedia"
  | "content.stockImages"
  | "content.rescrape"
  | "content.companyIntel"
  | "content.normalizeText"
  | "content.validateImages"
  | "content.validateCss"
  | "content.uploadText"
  | "content.voice"
  | "versions.history"
  | "versions.fork"
  | "versions.approve"
  | "versions.comments"
  | "versions.compare"
  | "versions.exportZip"
  | "versions.download"
  | "publish.deploy"
  | "publish.history"
  | "publish.status"
  | "publish.openDeployment"
  | "publish.domain"
  | "publish.env"
  | "publish.github"
  | "quality.autofix"
  | "quality.repair"
  | "quality.acceptRepair"
  | "quality.qualityGate"
  | "quality.reportError"
  | "data.modelTrace"
  | "data.saveProject"
  | "data.chatHistory"
  | "data.credits"
  | "data.readiness"
  | "data.feedback"
  | "help.openclaw"
  | "help.dailyTip"
  | "help.shortcuts"
  | "help.advanced";

export type ToolGroup = {
  id: ToolGroupId;
  label: string;
};

export type ToolAction = {
  id: ToolActionId;
  group: ToolGroupId;
  label: string;
  icon: LucideIcon;
  shortcut?: string;
  requiresChat?: boolean;
  requiresVersion?: boolean;
  requiresPreview?: boolean;
  requiresDeployment?: boolean;
};

export const CHAT_TOOL_GROUPS: ToolGroup[] = [
  { id: "generate", label: "Generera" },
  { id: "preview", label: "Preview" },
  { id: "content", label: "Innehåll" },
  { id: "versions", label: "Versioner" },
  { id: "publish", label: "Publicera" },
  { id: "quality", label: "Kvalitet" },
  { id: "data", label: "Spår & data" },
  { id: "help", label: "Hjälp" },
];

export const CHAT_TOOL_ACTIONS: ToolAction[] = [
  { id: "generate.new", group: "generate", label: "Ny generation", icon: Plus },
  {
    id: "generate.regenerate",
    group: "generate",
    label: "Generera om",
    icon: RotateCcw,
    requiresChat: true,
  },
  {
    id: "generate.stop",
    group: "generate",
    label: "Stoppa generering",
    icon: Square,
    requiresChat: true,
  },
  { id: "generate.plan", group: "generate", label: "Gör plan", icon: FileText },
  { id: "generate.elements", group: "generate", label: "Element & block", icon: LayoutGrid },
  { id: "generate.theme", group: "generate", label: "Designtema", icon: Palette },
  {
    id: "generate.switchScaffold",
    group: "generate",
    label: "Byt mall",
    icon: LayoutGrid,
  },
  { id: "generate.switchModel", group: "generate", label: "Byt modell", icon: Sparkles },
  { id: "generate.deepBrief", group: "generate", label: "Djup brief", icon: FileText },
  { id: "generate.polishPrompt", group: "generate", label: "Polera prompt", icon: Wand2 },

  {
    id: "preview.refresh",
    group: "preview",
    label: "Uppdatera preview",
    icon: RefreshCw,
    requiresPreview: true,
  },
  {
    id: "preview.restart",
    group: "preview",
    label: "Starta om VM",
    icon: Power,
    requiresPreview: true,
  },
  {
    id: "preview.destroy",
    group: "preview",
    label: "Stäng VM",
    icon: PowerOff,
    requiresPreview: true,
  },
  {
    id: "preview.hibernate",
    group: "preview",
    label: "Viloläge VM",
    icon: Moon,
    requiresPreview: true,
  },
  {
    id: "preview.status",
    group: "preview",
    label: "Förhandsstatus",
    icon: Activity,
    requiresChat: true,
  },
  {
    id: "preview.device",
    group: "preview",
    label: "Byt enhet",
    icon: Monitor,
    requiresPreview: true,
  },
  {
    id: "preview.inspect",
    group: "preview",
    label: "Inspektera",
    icon: MousePointer,
    requiresPreview: true,
  },
  {
    id: "preview.openExternal",
    group: "preview",
    label: "Öppna i ny flik",
    icon: ExternalLink,
    requiresPreview: true,
  },
  {
    id: "preview.codeView",
    group: "preview",
    label: "Kodvy",
    icon: Code2,
    requiresChat: true,
  },
  {
    id: "preview.registry",
    group: "preview",
    label: "Elementregister",
    icon: FolderTree,
    requiresChat: true,
  },

  { id: "content.uploadMedia", group: "content", label: "Ladda upp media", icon: Upload },
  { id: "content.stockImages", group: "content", label: "Stock-bilder", icon: ImageIcon },
  { id: "content.rescrape", group: "content", label: "Hämta om sajt", icon: Globe },
  { id: "content.companyIntel", group: "content", label: "Företagsintel", icon: Building2 },
  {
    id: "content.normalizeText",
    group: "content",
    label: "Normalisera text",
    icon: Type,
    requiresChat: true,
  },
  {
    id: "content.validateImages",
    group: "content",
    label: "Validera bilder",
    icon: ImageIcon,
    requiresChat: true,
  },
  {
    id: "content.validateCss",
    group: "content",
    label: "Validera CSS",
    icon: Braces,
    requiresChat: true,
  },
  { id: "content.uploadText", group: "content", label: "Text eller PDF", icon: FileText },
  { id: "content.voice", group: "content", label: "Röstinmatning", icon: MousePointer },

  {
    id: "versions.history",
    group: "versions",
    label: "Historik",
    icon: History,
    requiresChat: true,
  },
  {
    id: "versions.fork",
    group: "versions",
    label: "Förgrena version",
    icon: GitBranch,
    requiresVersion: true,
  },
  {
    id: "versions.approve",
    group: "versions",
    label: "Godkänn plan",
    icon: CheckCircle2,
    requiresVersion: true,
  },
  {
    id: "versions.comments",
    group: "versions",
    label: "Kommentarer",
    icon: MessageSquare,
    requiresChat: true,
  },
  {
    id: "versions.compare",
    group: "versions",
    label: "Jämför versioner",
    icon: GitCompare,
    requiresVersion: true,
  },
  {
    id: "versions.exportZip",
    group: "versions",
    label: "Exportera ZIP",
    icon: Archive,
    requiresVersion: true,
  },
  {
    id: "versions.download",
    group: "versions",
    label: "Ladda ner",
    icon: Download,
    requiresVersion: true,
  },

  {
    id: "publish.deploy",
    group: "publish",
    label: "Publicera",
    icon: Rocket,
    requiresVersion: true,
  },
  {
    id: "publish.history",
    group: "publish",
    label: "Tidigare builds",
    icon: ListOrdered,
    requiresChat: true,
  },
  {
    id: "publish.status",
    group: "publish",
    label: "Byggstatus",
    icon: Gauge,
    requiresDeployment: true,
  },
  {
    id: "publish.openDeployment",
    group: "publish",
    label: "Öppna bygge",
    icon: ExternalLink,
    requiresDeployment: true,
  },
  { id: "publish.domain", group: "publish", label: "Domän", icon: Link2, requiresChat: true },
  {
    id: "publish.env",
    group: "publish",
    label: "Miljövariabler",
    icon: KeyRound,
    requiresChat: true,
  },
  {
    id: "publish.github",
    group: "publish",
    label: "GitHub export",
    icon: Github,
    requiresChat: true,
  },

  {
    id: "quality.autofix",
    group: "quality",
    label: "Kör autofix",
    icon: Wrench,
    requiresChat: true,
  },
  {
    id: "quality.repair",
    group: "quality",
    label: "LLM-reparation",
    icon: Stethoscope,
    requiresChat: true,
  },
  {
    id: "quality.acceptRepair",
    group: "quality",
    label: "Godkänn fix",
    icon: CheckCheck,
    requiresChat: true,
  },
  {
    id: "quality.qualityGate",
    group: "quality",
    label: "Kvalitetsgate",
    icon: ShieldCheck,
    requiresChat: true,
  },
  {
    id: "quality.reportError",
    group: "quality",
    label: "Rapportera fel",
    icon: Bug,
    requiresChat: true,
  },

  { id: "data.modelTrace", group: "data", label: "Modellspår", icon: Activity },
  { id: "data.saveProject", group: "data", label: "Spara projekt", icon: Save, requiresChat: true },
  {
    id: "data.chatHistory",
    group: "data",
    label: "Hämta historik",
    icon: Inbox,
    requiresChat: true,
  },
  { id: "data.credits", group: "data", label: "Saldo & credits", icon: Coins },
  {
    id: "data.readiness",
    group: "data",
    label: "Lanseringsstatus",
    icon: CircleCheck,
    requiresChat: true,
  },
  {
    id: "data.feedback",
    group: "data",
    label: "Feedback version",
    icon: ThumbsUp,
    requiresVersion: true,
  },

  { id: "help.openclaw", group: "help", label: "Fråga OpenClaw", icon: HelpCircle },
  { id: "help.dailyTip", group: "help", label: "Dagligt tips", icon: Lightbulb },
  { id: "help.shortcuts", group: "help", label: "Kortkommandon", icon: Command },
  { id: "help.advanced", group: "help", label: "Avancerat", icon: SlidersHorizontal },
];

export type ToolActionAvailability = {
  hasChat: boolean;
  hasVersion: boolean;
  hasPreview: boolean;
  hasDeployment: boolean;
};

export function isToolActionDisabled(
  action: ToolAction,
  availability: ToolActionAvailability,
): boolean {
  if (action.requiresChat && !availability.hasChat) return true;
  if (action.requiresVersion && !availability.hasVersion) return true;
  if (action.requiresPreview && !availability.hasPreview) return true;
  if (action.requiresDeployment && !availability.hasDeployment) return true;
  return false;
}

export const CHAT_TOOL_EVENT = "sajtmaskin:chat-tool";

export type ChatToolEventDetail = {
  id: ToolActionId;
};

export function dispatchChatToolAction(id: ToolActionId) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ChatToolEventDetail>(CHAT_TOOL_EVENT, { detail: { id } }),
  );
}
