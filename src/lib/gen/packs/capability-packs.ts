/**
 * Capability packs — structured mapping from inferred capability flags
 * to concrete deps, shadcn components, and prompt hints.
 *
 * Single source of truth for what each capability means in terms of
 * libraries, UI components, and LLM guidance.
 *
 * Deps already covered by the baseline in project-scaffold.ts (recharts,
 * framer-motion, three, react-hook-form, etc.) are intentionally omitted
 * from requiredDeps — only deps that need *proactive* injection appear.
 */

import type { InferredCapabilities } from "../capability-inference";

export interface CapabilityPack {
  capability: keyof InferredCapabilities;
  requiredDeps: Record<string, string>;
  shadcnComponents: string[];
  promptHint: string | null;
}

export const CAPABILITY_PACKS: readonly CapabilityPack[] = [
  {
    capability: "needs3D",
    requiredDeps: {},
    shadcnComponents: [],
    promptHint:
      '- **3D/WebGL requested**: Use @react-three/fiber + @react-three/drei. Wrap Canvas in a "use client" component. Add three, @react-three/fiber, @react-three/drei to deps. Use **lucide-react** only for 2D UI icons (e.g. TreePine) — not for WebGL meshes. For **physics / gravity**, add @react-three/rapier (Physics, RigidBody). For **GLB/GLTF**, use useGLTF from drei and put assets under public/.',
  },
  {
    capability: "needsMotion",
    requiredDeps: {},
    shadcnComponents: [],
    promptHint:
      "- **Motion/animation requested**: Use framer-motion for entrance animations, scroll reveals, and microinteractions. Add framer-motion to deps.",
  },
  {
    capability: "needsCharts",
    requiredDeps: {},
    shadcnComponents: [
      "ChartContainer",
      "ChartTooltip",
      "ChartTooltipContent",
      "ChartLegend",
      "ChartLegendContent",
    ],
    promptHint:
      "- **Charts/data visualization requested**: Use Recharts with shadcn ChartContainer. Provide realistic mock data (10-12 points).",
  },
  {
    capability: "needsCarousel",
    requiredDeps: {
      "embla-carousel-autoplay": "^8",
    },
    shadcnComponents: [
      "Carousel",
      "CarouselContent",
      "CarouselItem",
      "CarouselNext",
      "CarouselPrevious",
    ],
    promptHint:
      "- **Carousel/slider requested**: Use shadcn Carousel (wraps embla-carousel-react). Add embla-carousel-autoplay for auto-rotation.",
  },
  {
    capability: "needsForms",
    requiredDeps: {},
    shadcnComponents: [
      "Form",
      "FormField",
      "FormItem",
      "FormLabel",
      "FormControl",
      "FormMessage",
      "Input",
      "Select",
      "Calendar",
    ],
    promptHint:
      "- **Forms requested**: Use react-hook-form + zod + shadcn Form components. Always define a zod schema.",
  },
  {
    capability: "needsDataUI",
    requiredDeps: {
      "@tanstack/react-table": "^8",
    },
    shadcnComponents: [
      "Table",
      "TableBody",
      "TableCell",
      "TableHead",
      "TableHeader",
      "TableRow",
    ],
    promptHint:
      "- **Data table requested**: Use @tanstack/react-table with shadcn Table components. Include sorting, filtering, and pagination. Define column defs with proper typing.",
  },
  {
    capability: "needsAuth",
    requiredDeps: {},
    shadcnComponents: ["Form", "Input", "Label", "Button", "Card"],
    promptHint:
      "- **Auth pages requested**: Include login, register, and password reset flows. Use shadcn form components + zod validation.",
  },
  {
    capability: "needsAppShell",
    requiredDeps: {},
    shadcnComponents: [
      "Sidebar",
      "SidebarContent",
      "SidebarHeader",
      "SidebarMenu",
      "SidebarMenuItem",
      "SidebarMenuButton",
      "SidebarProvider",
      "SidebarTrigger",
    ],
    promptHint:
      "- **App shell / dashboard requested**: Use shadcn Sidebar components (SidebarProvider, Sidebar, SidebarContent, SidebarMenu) for navigation. Include a header with SidebarTrigger for mobile toggle.",
  },
  {
    capability: "needsEcommerce",
    requiredDeps: {},
    shadcnComponents: ["Sheet", "SheetContent", "Badge", "Card", "Separator"],
    promptHint:
      "- **E-commerce requested**: Include product cards with images, prices, and add-to-cart. Use shadcn Sheet for cart drawer. Structure pages for product listing, detail, and checkout flow.",
  },
  {
    capability: "needsPremiumVisuals",
    requiredDeps: {},
    shadcnComponents: [],
    promptHint:
      "- **Premium visual effects requested**: Use glassmorphism, gradient text, backdrop-blur, layered shadows. Go beyond standard card layouts.",
  },
  {
    capability: "needsDatabase",
    requiredDeps: {},
    shadcnComponents: [],
    promptHint:
      "- **Database or persistence requested**: Do not assume Prisma, SQLite, Supabase, or Postgres unless the user explicitly chose one. If the provider, auth coupling, or required env vars are unclear, ask a clarifying question before generating backend code. Keep preview-safe mock data in the UI until the backend choice is confirmed.",
  },
];

export function resolveCapabilityPacks(
  caps: InferredCapabilities,
): CapabilityPack[] {
  return CAPABILITY_PACKS.filter((pack) => caps[pack.capability]);
}

export function collectPackDeps(
  packs: CapabilityPack[],
): Record<string, string> {
  const deps: Record<string, string> = {};
  for (const pack of packs) {
    for (const [pkg, ver] of Object.entries(pack.requiredDeps)) {
      if (!deps[pkg]) deps[pkg] = ver;
    }
  }
  return deps;
}

/**
 * Build prompt hints from resolved packs.
 * Motion hint is suppressed when 3D is active (the 3D hint covers it).
 */
export function buildCapabilityHintsFromPacks(
  packs: CapabilityPack[],
): string | null {
  const active = new Set(packs.map((p) => p.capability));
  const lines: string[] = [];

  for (const pack of packs) {
    if (!pack.promptHint) continue;
    if (pack.capability === "needsMotion" && active.has("needs3D")) continue;
    lines.push(pack.promptHint);
  }

  if (lines.length === 0) return null;
  return `## Detected Capabilities\n\n${lines.join("\n")}`;
}

/**
 * Convenience wrapper matching the old buildCapabilityHints(caps) signature.
 * Resolves packs internally — use the decomposed functions when you need
 * both hints and deps from the same resolve pass.
 */
export function buildCapabilityHints(
  caps: InferredCapabilities,
): string | null {
  return buildCapabilityHintsFromPacks(resolveCapabilityPacks(caps));
}
