import type { BuildIntent } from "@/lib/builder/build-intent";
import {
  TEMPLATES,
  type Template,
  getTemplateCategoryId,
  getTemplateCategoryTitle,
} from "@/lib/templates/template-data";

export type TemplateCatalogSource = "v0";

export type TemplateCatalogItem = {
  id: string;
  title: string;
  category: string;
  previewImageUrl: string;
  previewStillUrl?: string | null;
  previewLoopUrl?: string | null;
  previewLoopKind?: string | null;
  previewLoopFrameDurationMs?: number | null;
  previewFrameUrls?: string[];
  source: TemplateCatalogSource;
  buildIntent: BuildIntent;
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
  const categoryId = getTemplateCategoryId(template);

  return {
    id: template.id,
    title: template.title,
    category: getTemplateCategoryTitle(template),
    previewImageUrl: template.previewImageUrl,
    previewStillUrl: template.previewStillUrl ?? template.previewImageUrl,
    previewLoopUrl: template.previewLoopUrl ?? null,
    previewLoopKind: template.previewLoopKind ?? null,
    previewLoopFrameDurationMs: template.previewLoopFrameDurationMs ?? null,
    previewFrameUrls: template.previewFrameUrls ?? [],
    source: "v0",
    buildIntent: inferBuildIntent(categoryId),
  };
}

export function getTemplateCatalog(params: {
  intent?: BuildIntent;
  source?: TemplateCatalogSource;
} = {}): TemplateCatalogItem[] {
  const { intent } = params;
  const v0Items = TEMPLATES.map(mapV0Template);
  return v0Items.filter((item) => (intent ? item.buildIntent === intent : true));
}

export function getTemplateCatalogItemById(id: string): TemplateCatalogItem | undefined {
  return getTemplateCatalog().find((item) => item.id === id);
}
