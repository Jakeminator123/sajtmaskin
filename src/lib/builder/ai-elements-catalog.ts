import type { PlacementOption } from "@/components/builder/UiElementPicker";
import type { DetectedSection } from "@/lib/builder/sectionAnalyzer";
import { getPlacementInstruction } from "@/lib/shadcn-registry-utils";

export type AiElementCategory = "chat" | "code" | "workflow" | "tools" | "utility";

export type AiElementCatalogItem = {
  id: string;
  label: string;
  description: string;
  category: AiElementCategory;
  tags?: string[];
  dependencies?: string[];
  promptHints?: string[];
};

export const AI_ELEMENT_CATEGORIES: {
  id: AiElementCategory;
  label: string;
  icon: string;
}[] = [
  { id: "chat", label: "Chatt", icon: "💬" },
  { id: "code", label: "Kod & Preview", icon: "🧑‍💻" },
  { id: "workflow", label: "Arbetsflöde", icon: "🔀" },
  { id: "tools", label: "Verktyg & Status", icon: "🔧" },
  { id: "utility", label: "Övrigt", icon: "📦" },
];

export const AI_ELEMENT_ITEMS: AiElementCatalogItem[] = [
  // ── Chat ──
  {
    id: "conversation",
    label: "Conversation",
    description: "Full chat conversation container with auto-scroll and message grouping.",
    category: "chat",
    tags: ["chat", "streaming", "messages", "scroll"],
    dependencies: ["ai", "@ai-sdk/react"],
    promptHints: [
      "Use a Conversation container with scroll-to-latest behavior.",
      "Render user and assistant messages with distinct styling.",
    ],
  },
  {
    id: "message",
    label: "Message",
    description: "Individual chat message with avatar, content, actions and timestamps.",
    category: "chat",
    tags: ["chat", "message", "avatar"],
    dependencies: ["ai", "@ai-sdk/react"],
    promptHints: [
      "Use Message components with role-based styling (user vs assistant).",
      "Include MessageContent for text and MessageActions for copy/edit buttons.",
    ],
  },
  {
    id: "prompt-input",
    label: "Prompt Input",
    description: "Rich prompt input with file attachments, model selector and submit button.",
    category: "chat",
    tags: ["input", "attachments", "actions", "submit"],
    dependencies: ["ai", "@ai-sdk/react"],
    promptHints: [
      "Provide a textarea, attachment button, and submit button.",
      "Handle attachments in the UI with chips or inline cards.",
    ],
  },
  {
    id: "reasoning",
    label: "Reasoning",
    description: "Collapsible reasoning/thinking display that auto-opens during streaming.",
    category: "chat",
    tags: ["reasoning", "thinking", "streaming", "collapsible"],
    dependencies: ["ai", "@ai-sdk/react"],
    promptHints: [
      "Use a collapsible panel that auto-opens while streaming reasoning tokens.",
      "Show a thinking indicator with animated dots during generation.",
    ],
  },
  {
    id: "chain-of-thought",
    label: "Chain of Thought",
    description: "Multi-step reasoning with search results, images and intermediate steps.",
    category: "chat",
    tags: ["reasoning", "steps", "search", "deep-research"],
    dependencies: ["ai", "@ai-sdk/react"],
    promptHints: [
      "Render each step as a collapsible section with header and content.",
      "Include search result cards when the model uses web search.",
    ],
  },
  {
    id: "sources",
    label: "Sources",
    description: "Collapsible source citations panel for grounded AI responses.",
    category: "chat",
    tags: ["sources", "citations", "references"],
    promptHints: [
      "Add a collapsible Sources section below assistant messages.",
      "Render each source as a clickable link with title and domain.",
    ],
  },
  {
    id: "inline-citation",
    label: "Inline Citation",
    description: "Inline citation badges with hover cards showing source details.",
    category: "chat",
    tags: ["citation", "inline", "hover-card", "reference"],
    promptHints: [
      "Render citation numbers as small badges inline with text.",
      "Show a hover card with source title, URL and snippet on hover.",
    ],
  },
  {
    id: "suggestion",
    label: "Suggestion",
    description: "Suggested follow-up prompts the user can click to continue the conversation.",
    category: "chat",
    tags: ["suggestion", "follow-up", "prompt"],
    promptHints: [
      "Show 2-4 suggestion chips below the latest assistant message.",
      "Clicking a suggestion sends it as the next user message.",
    ],
  },
  {
    id: "model-selector",
    label: "Model Selector",
    description: "Command-palette style model picker with search, logos and keyboard shortcuts.",
    category: "chat",
    tags: ["model", "selector", "command-palette"],
    promptHints: [
      "Use a dialog-based command palette for model selection.",
      "Show model logos, names and optional keyboard shortcuts.",
    ],
  },
  {
    id: "confirmation",
    label: "Confirmation",
    description: "Tool approval UI for confirming or rejecting tool invocations before execution.",
    category: "chat",
    tags: ["confirmation", "approval", "tool", "safety"],
    dependencies: ["ai"],
    promptHints: [
      "Show an alert with tool name, parameters and Approve/Reject buttons.",
      "Block tool execution until the user makes a choice.",
    ],
  },
  {
    id: "context",
    label: "Context / Token Usage",
    description: "Token usage display with progress bars for input, output, reasoning and cache.",
    category: "chat",
    tags: ["context", "tokens", "usage", "cost"],
    dependencies: ["ai", "tokenlens"],
    promptHints: [
      "Display token usage in a hover card triggered from a small info icon.",
      "Show progress bars for prompt, completion, reasoning and cache tokens.",
    ],
  },
  {
    id: "plan",
    label: "Plan",
    description: "Multi-step plan/task list with collapsible items and status indicators.",
    category: "chat",
    tags: ["plan", "tasks", "steps", "progress"],
    promptHints: [
      "Render a collapsible plan with numbered items and status icons.",
      "Mark completed/pending/in-progress states with distinct colors.",
    ],
  },
  {
    id: "queue",
    label: "Queue",
    description: "Message queue with sections, attachments and action buttons for batch operations.",
    category: "chat",
    tags: ["queue", "batch", "messages", "actions"],
    promptHints: [
      "Show queued messages in sections (pending, completed).",
      "Include attachment previews and action buttons per item.",
    ],
  },
  {
    id: "checkpoint",
    label: "Checkpoint",
    description: "Conversation checkpoint marker for branching or restoring previous states.",
    category: "chat",
    tags: ["checkpoint", "branch", "restore", "history"],
    promptHints: [
      "Render a horizontal separator with a checkpoint icon and trigger button.",
      "Allow users to restore conversation state to a previous checkpoint.",
    ],
  },
  // ── Code & Preview ──
  {
    id: "code-block",
    label: "Code Block",
    description: "Syntax-highlighted code block with copy button and language label.",
    category: "code",
    tags: ["code", "copy", "snippet", "syntax"],
    promptHints: [
      "Add a copy-to-clipboard control in the header.",
      "Use a monospaced font and subtle background with language label.",
    ],
  },
  {
    id: "web-preview",
    label: "Web Preview",
    description: "Embedded iframe preview with URL bar, refresh and responsive container.",
    category: "code",
    tags: ["preview", "iframe", "navigation", "sandbox"],
    promptHints: [
      "Include a compact URL bar and refresh action.",
      "Use a responsive container with rounded corners and loading state.",
    ],
  },
  {
    id: "artifact",
    label: "Artifact",
    description: "Side-panel artifact viewer for generated code, documents or designs.",
    category: "code",
    tags: ["artifact", "panel", "code", "document"],
    promptHints: [
      "Render an artifact panel with header, title and close button.",
      "Display generated content (code, markdown, HTML) in the body.",
    ],
  },
  // ── Workflow ──
  {
    id: "canvas",
    label: "Canvas (Flow Editor)",
    description: "Visual flow/graph editor with nodes, edges, connections and controls.",
    category: "workflow",
    tags: ["canvas", "flow", "graph", "nodes", "drag"],
    dependencies: ["@xyflow/react"],
    promptHints: [
      "Use ReactFlow as the canvas base with custom Node and Edge components.",
      "Include a minimap, zoom controls and a toolbar.",
      "Create Node components with header, content and footer slots.",
    ],
  },
  // ── Tools & Status ──
  {
    id: "tool",
    label: "Tool Panel",
    description: "Tool invocation UI showing name, parameters, output and execution status.",
    category: "tools",
    tags: ["tools", "actions", "status", "invocation"],
    dependencies: ["ai"],
    promptHints: [
      "Show tool name, parameters, and output in a compact collapsible panel.",
      "Use status labels for running/success/error states.",
    ],
  },
  {
    id: "task",
    label: "Task",
    description: "Collapsible task item with file attachments and completion status.",
    category: "tools",
    tags: ["task", "file", "status", "collapsible"],
    promptHints: [
      "Render each task with a trigger showing name and status icon.",
      "Show file attachments and details in the collapsible content area.",
    ],
  },
  {
    id: "shimmer",
    label: "Shimmer / Skeleton",
    description: "Animated shimmer/skeleton loading placeholder for streaming content.",
    category: "utility",
    tags: ["loading", "skeleton", "shimmer", "placeholder"],
    promptHints: [
      "Use Shimmer as a placeholder while content is loading or streaming.",
      "Apply the shimmer effect to text blocks and card placeholders.",
    ],
  },
  {
    id: "loader",
    label: "Loader",
    description: "Animated loading indicator with configurable size and label.",
    category: "utility",
    tags: ["loading", "spinner", "indicator"],
    promptHints: [
      "Use Loader for inline or full-section loading states.",
      "Configure size (sm/md/lg) to match the context.",
    ],
  },
  {
    id: "image",
    label: "AI Image",
    description: "Display AI-generated images with optimized loading and fallback.",
    category: "utility",
    tags: ["image", "generation", "ai", "display"],
    dependencies: ["ai"],
    promptHints: [
      "Render generated images using Next.js Image for optimization.",
      "Include a loading state and error fallback.",
    ],
  },
  {
    id: "open-in-chat",
    label: "Open In Chat",
    description: "Dropdown to open content in external AI tools (ChatGPT, Claude, v0, Cursor).",
    category: "utility",
    tags: ["share", "export", "chatgpt", "claude", "cursor"],
    promptHints: [
      "Add a dropdown button with options for multiple AI platforms.",
      "Generate deep links to open the current content in each platform.",
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
