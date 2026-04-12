import type { TemplateLibraryRuntimeGuidance } from "./template-library/types";

export interface TemplateReferenceContext {
  templateId: string;
  title: string;
  categorySlug: string;
  qualityScore: number;
  searchScore: number;
  guidance: TemplateLibraryRuntimeGuidance;
  codeExcerpts: { path: string; reason: string; excerpt: string }[];
}
