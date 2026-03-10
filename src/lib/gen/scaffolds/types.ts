export type ScaffoldFamily = "base-nextjs" | "content-site" | "app-shell";
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
