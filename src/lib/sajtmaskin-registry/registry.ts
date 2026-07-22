import fs from "node:fs";
import path from "node:path";
import type {
  ShadcnRegistryFile,
  ShadcnRegistryItem,
} from "@/lib/shadcn/registry-types";

/**
 * @sajtmaskin — internal shadcn-compatible registry (Fas 6 proof).
 *
 * Serves curated, proven blocks from the scaffold library as shadcn
 * registry items so the shadcn CLI/MCP and the insert lane can consume them
 * via `@sajtmaskin/<name>` (see `components.json` `registries`).
 *
 * Source of truth is this module (item metadata) plus the real, typechecked
 * TSX files under `src/lib/sajtmaskin-registry/blocks/` (read at request
 * time, same fs pattern as `loadScaffoldFiles`). Served by
 * `src/app/r/[name]/route.ts` as `/r/registry.json` + `/r/{name}.json`.
 *
 * Every item must be self-contained: all imports are covered by
 * `dependencies`/`registryDependencies` or included in the item's files.
 */

const SAJTMASKIN_REGISTRY_NAME = "sajtmaskin";
const SAJTMASKIN_REGISTRY_HOMEPAGE = "https://sajtmaskin.vercel.app";

const REGISTRY_SCHEMA_URL = "https://ui.shadcn.com/schema/registry.json";
const REGISTRY_ITEM_SCHEMA_URL = "https://ui.shadcn.com/schema/registry-item.json";

const REGISTRY_ROOT = path.join(process.cwd(), "src", "lib", "sajtmaskin-registry");

interface RegistryItemDefinition {
  name: string;
  type: "registry:block";
  title: string;
  description: string;
  dependencies?: string[];
  registryDependencies: string[];
  /** `path` is registry-root-relative and doubles as the repo path under REGISTRY_ROOT. */
  files: Array<{ path: string; type: "registry:component"; target: string }>;
}

/**
 * Curated items. Keep each entry's `registryDependencies` in sync with the
 * `@/components/ui/*` imports of its files — the schema test asserts the
 * files exist and the route test asserts the served payload, but the import
 * coverage is reviewed manually per item (small, curated set by design).
 */
const ITEM_DEFINITIONS: RegistryItemDefinition[] = [
  {
    name: "saas-hero",
    type: "registry:block",
    title: "SaaS Hero",
    description:
      "Hero section with headline, dual CTA, stat strip and a dashboard-shaped product preview card. Curated from the proven saas-landing scaffold.",
    dependencies: ["lucide-react"],
    registryDependencies: ["badge", "button", "card"],
    files: [
      {
        path: "blocks/saas-hero.tsx",
        type: "registry:component",
        target: "components/blocks/saas-hero.tsx",
      },
    ],
  },
  {
    name: "pricing-section",
    type: "registry:block",
    title: "Pricing Section",
    description:
      "Three-tier pricing section with a featured middle plan and per-plan feature lists. Curated from the proven saas-landing scaffold.",
    dependencies: ["lucide-react"],
    registryDependencies: ["badge", "button", "card"],
    files: [
      {
        path: "blocks/pricing-section.tsx",
        type: "registry:component",
        target: "components/blocks/pricing-section.tsx",
      },
    ],
  },
  {
    name: "faq-accordion",
    type: "registry:block",
    title: "FAQ Accordion",
    description:
      "Two-column FAQ section with an accordion inside a soft card. Curated from the proven saas-landing scaffold.",
    registryDependencies: ["accordion", "badge", "card"],
    files: [
      {
        path: "blocks/faq-accordion.tsx",
        type: "registry:component",
        target: "components/blocks/faq-accordion.tsx",
      },
    ],
  },
];

export function listRegistryItemNames(): string[] {
  return ITEM_DEFINITIONS.map((item) => item.name);
}

function toItem(definition: RegistryItemDefinition, options: { withContent: boolean }): ShadcnRegistryItem {
  const files: ShadcnRegistryFile[] = definition.files.map((file) => ({
    path: file.path,
    type: file.type,
    target: file.target,
    ...(options.withContent
      ? { content: fs.readFileSync(path.join(REGISTRY_ROOT, file.path), "utf-8") }
      : {}),
  }));
  return {
    name: definition.name,
    type: definition.type,
    title: definition.title,
    description: definition.description,
    ...(definition.dependencies ? { dependencies: definition.dependencies } : {}),
    registryDependencies: definition.registryDependencies,
    files,
  };
}

/** `/r/registry.json` payload — the index required by the shadcn CLI/MCP. */
export function buildRegistryIndex(): Record<string, unknown> {
  return {
    $schema: REGISTRY_SCHEMA_URL,
    name: SAJTMASKIN_REGISTRY_NAME,
    homepage: SAJTMASKIN_REGISTRY_HOMEPAGE,
    items: ITEM_DEFINITIONS.map((definition) => toItem(definition, { withContent: false })),
  };
}

/** `/r/{name}.json` payload with inlined file content, or null when unknown. */
export function buildRegistryItem(name: string): Record<string, unknown> | null {
  const definition = ITEM_DEFINITIONS.find((item) => item.name === name);
  if (!definition) return null;
  return {
    $schema: REGISTRY_ITEM_SCHEMA_URL,
    ...toItem(definition, { withContent: true }),
  };
}
