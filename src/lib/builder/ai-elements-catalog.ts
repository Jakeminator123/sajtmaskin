import type { PlacementOption } from "@/components/builder/ShadcnBlockPicker";
import type { DetectedSection } from "@/lib/builder/sectionAnalyzer";
import { getPlacementInstruction } from "@/lib/shadcn-registry-utils";

export type AiElementCatalogItem = {
  id: string;
  label: string;
  description: string;
  tags?: string[];
  dependencies?: string[];
  promptHints?: string[];
};

export const AI_ELEMENT_ITEMS: AiElementCatalogItem[] = [
  {
    id: "conversation",
    label: "Conversation",
    description: "Full chat conversation with messages, reasoning and sources.",
    tags: ["chat", "streaming", "conversation"],
    dependencies: ["ai", "@ai-sdk/react", "zod"],
    promptHints: [
      "Use a Conversation container with scroll-to-latest behavior.",
      "Render user and assistant messages with distinct styling.",
      "Include optional reasoning and sources sections.",
    ],
  },
  {
    id: "prompt-input",
    label: "Prompt Input",
    description: "Rich prompt input with attachments and actions.",
    tags: ["input", "attachments", "actions"],
    dependencies: ["ai", "@ai-sdk/react"],
    promptHints: [
      "Provide a textarea, attach button, and submit button.",
      "Handle attachments in the UI with chips or inline cards.",
    ],
  },
  {
    id: "tool-panel",
    label: "Tool Panel",
    description: "Tool invocation UI with input/output blocks.",
    tags: ["tools", "actions", "status"],
    promptHints: [
      "Show tool name, parameters, and output in a compact panel.",
      "Use status labels for running/success/error states.",
    ],
  },
  {
    id: "task-plan",
    label: "Task/Plan List",
    description: "Plan and task list UI for multi-step actions.",
    tags: ["tasks", "plan", "progress"],
    promptHints: [
      "Render grouped tasks with status indicators.",
      "Use collapsible sections for active vs completed tasks.",
    ],
  },
  {
    id: "code-block",
    label: "Code Block",
    description: "Code block with copy button and syntax styling.",
    tags: ["code", "copy", "snippet"],
    promptHints: [
      "Add a copy-to-clipboard control.",
      "Use a monospaced font and subtle background.",
    ],
  },
  {
    id: "web-preview",
    label: "Web Preview",
    description: "Embedded preview frame with navigation bar.",
    tags: ["preview", "iframe", "navigation"],
    promptHints: [
      "Include a compact URL bar and refresh action.",
      "Use a responsive container with rounded corners.",
    ],
  },
];

export function buildAiElementPrompt(
  item: AiElementCatalogItem,
  options: {
    placement?: PlacementOption;
    detectedSections?: DetectedSection[];
  } = {},
): string {
  const lines: string[] = [];
  lines.push(`Add the AI element "${item.label}" to the existing site.`);
  if (item.description) {
    lines.push(`Description: ${item.description}`);
  }
  if (options.placement) {
    lines.push(getPlacementInstruction(options.placement, options.detectedSections));
  } else {
    lines.push("Add it as a new section on the homepage (`app/page.tsx`) below existing content.");
  }
  lines.push("Create any missing AI element components under `src/components/ai-elements/`.");
  lines.push("Use Tailwind CSS for styling and match the existing design tokens.");
  lines.push("Keep all existing content intact; only append the new section and required components.");
  if (item.promptHints?.length) {
    lines.push("Implementation hints:");
    item.promptHints.forEach((hint) => lines.push(`- ${hint}`));
  }
  if (item.dependencies?.length) {
    lines.push(
      `Dependencies to add in package.json (if missing): ${item.dependencies.join(", ")}.`,
    );
  }
  return lines.join("\n\n");
}
