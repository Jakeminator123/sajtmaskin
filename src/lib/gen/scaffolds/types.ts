export type ScaffoldFamily =
  | "base-nextjs"
  | "content-site"
  | "app-shell"
  | "landing-page"
  | "saas-landing"
  | "portfolio"
  | "blog"
  | "dashboard"
  | "auth-pages";
export type ScaffoldMode = "off" | "auto" | "manual";

export interface ScaffoldFile {
  path: string;
  content: string;
}

export interface ScaffoldManifest {
  id: string;
  family: ScaffoldFamily;
  label: string;
  description: string;
  buildIntents: Array<"website" | "app" | "template">;
  tags: string[];
  promptHints: string[];
  files: ScaffoldFile[];
}
