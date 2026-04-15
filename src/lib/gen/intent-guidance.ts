import type { BuildIntent } from "@/lib/builder/build-intent";

export type BuildIntentGuidance = {
  label: string;
  summary: string;
  rules: string[];
  instructionLines: string[];
};

export const BUILD_INTENT_GUIDANCE: Record<BuildIntent, BuildIntentGuidance> = {
  template: {
    label: "Template",
    summary: "Template build: compact, reusable layout with minimal app logic.",
    rules: [
      "Scope is compact: 1-2 pages maximum with reusable sections.",
      "Avoid heavy app logic, databases, or authentication unless explicitly requested.",
      "Focus on layout quality, clean component composition, and content placeholders.",
      "Optimize for reusability - someone will customize this template for their own brand.",
    ],
    instructionLines: [
      "Scope is compact: 1-2 pages max, reusable sections.",
      "Avoid heavy app logic, databases, or auth unless explicitly requested.",
      "Focus on layout, components, and clean content placeholders.",
    ],
  },
  website: {
    label: "Website",
    summary: "Website build: purpose-fit web experience with clear structure.",
    rules: [
      "Ship code that passes a real App Router build: valid `next/image`, metadata exports, and Server Components by default - not patterns that only work inside a browser-transpiled preview.",
      "Build a complete, visually polished website with navigation, content sections, and a footer. Follow the Scaffold Variant block for layout cues, visual motif, and tone - do not fall back to a generic hero-cards-footer formula.",
      "Include realistic mock content specific to the business type - never generic placeholder copy.",
      "Match scope: short prompt -> polished one-pager; detailed prompt -> multi-page. Add testimonials/trust only when the prompt, brief, or business type calls for it.",
    ],
    instructionLines: [
      "Focus on content structure, clear sections, and flows that fit the requested use case.",
      "Prefer static content with light interactivity; keep logic minimal.",
      "Match scope to the request: a short, simple prompt should yield a polished one-pager; a detailed prompt may produce multiple pages.",
      "Use shadcn/ui components (buttons, cards, forms, dialogs) for all interactive and structured UI elements.",
    ],
  },
  app: {
    label: "Application",
    summary: "App build: stateful UI with flows, data models, and auth where needed.",
    rules: [
      "Build a functional application with professional UI that feels like a real product.",
      "MUST include: sidebar or top navigation, main content area, and contextual actions.",
      "Use shadcn/ui Sidebar for dashboard-style apps. Include a collapsible sidebar with icon + label navigation items.",
      "Include stateful UI: data tables with sorting/filtering, forms with validation feedback, modals for create/edit flows.",
      "Define realistic mock data with TypeScript interfaces. Use 5-10 realistic data rows, not placeholder text.",
      "Add empty states with illustrations (Lucide icons), loading skeletons, and error boundaries.",
      "Structure state with React hooks (useState, useReducer). Only add Context if state is shared across many components.",
      "Include toast notifications (via Sonner) for actions like save, delete, and error feedback.",
      "Full Next.js runtime is available: Server Actions, API routes, middleware, and any npm package. Use them when the app needs real data flow.",
    ],
    instructionLines: [
      "Include app flows, stateful UI, and data-backed views where relevant.",
      "Define key entities, empty states, and realistic data placeholders.",
      "Add auth, settings, and CRUD patterns when it fits the prompt.",
    ],
  },
};
