import type { BuildIntent } from "@/lib/builder/build-intent";
import {
  TEMPLATES,
  VERCEL_TEMPLATES,
  type Template,
  type VercelTemplate,
} from "@/lib/templates/template-data";

export type TemplateCatalogSource = "v0" | "vercel";

export type TemplateCatalogItem = {
  id: string;
  title: string;
  category: string;
  previewImageUrl: string;
  source: TemplateCatalogSource;
  buildIntent: BuildIntent;
  viewUrl?: string;
  editUrl?: string;
  repoUrl?: string;
  demoUrl?: string | null;
};

const APP_CATEGORIES = new Set(["apps-and-games", "login-and-sign-up"]);

function inferBuildIntent(category?: string | null): BuildIntent {
  if (!category) return "template";
  if (APP_CATEGORIES.has(category)) return "app";
  return "template";
}

function mapV0Template(template: Template): TemplateCatalogItem {
  return {
    id: template.id,
    title: template.title,
    category: template.category,
    previewImageUrl: template.previewImageUrl,
    source: "v0",
    buildIntent: inferBuildIntent(template.category),
    viewUrl: template.viewUrl,
    editUrl: template.editUrl,
  };
}

function mapVercelTemplate(template: VercelTemplate): TemplateCatalogItem {
  return {
    id: template.id,
    title: template.title,
    category: template.category,
    previewImageUrl: template.previewImageUrl,
    source: "vercel",
    buildIntent: "app",
    repoUrl: template.repoUrl,
    demoUrl: template.demoUrl,
  };
}

export function getTemplateCatalog(params: {
  intent?: BuildIntent;
  source?: TemplateCatalogSource;
} = {}): TemplateCatalogItem[] {
  const { intent, source } = params;
  const v0Items = TEMPLATES.map(mapV0Template);
  const vercelItems = VERCEL_TEMPLATES.map(mapVercelTemplate);
  const merged = source === "v0" ? v0Items : source === "vercel" ? vercelItems : [...v0Items, ...vercelItems];
  return merged.filter((item) => (intent ? item.buildIntent === intent : true));
}
