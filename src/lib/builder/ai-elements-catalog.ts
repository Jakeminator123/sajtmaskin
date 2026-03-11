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
  {
    id: "voice-input",
    label: "Voice Input",
    description: "Voice-first prompt composer with recording state, waveform feedback and transcript preview.",
    category: "chat",
    tags: ["voice", "microphone", "transcript", "multimodal"],
    dependencies: ["ai"],
    promptHints: [
      "Add a microphone trigger with idle, recording and processing states.",
      "Show waveform or volume feedback while recording and a transcript preview before send.",
    ],
  },
  {
    id: "assistant-dock",
    label: "Assistant Dock",
    description: "Sticky assistant launcher or side dock that keeps AI actions visible across the whole app.",
    category: "chat",
    tags: ["assistant", "dock", "launcher", "floating"],
    promptHints: [
      "Create a sticky dock or floating launcher that remains visible while the user scrolls.",
      "Include primary AI actions such as ask, summarize, refine and generate.",
    ],
  },
  {
    id: "multimodal-dropzone",
    label: "Multimodal Dropzone",
    description: "Attachment-first composer for images, PDFs, audio and text snippets before prompting.",
    category: "chat",
    tags: ["attachments", "upload", "dropzone", "files"],
    dependencies: ["ai"],
    promptHints: [
      "Support drag-and-drop plus click-to-upload with clear accepted file types.",
      "Render uploaded items as removable chips or preview cards above the prompt input.",
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
  {
    id: "diff-viewer",
    label: "Diff Viewer",
    description: "Before/after code or content comparison with inline highlights and quick actions.",
    category: "code",
    tags: ["diff", "compare", "before-after", "review"],
    promptHints: [
      "Render additions and removals with clear inline highlights and a compact legend.",
      "Include actions like copy, accept, reject or restore next to the diff header.",
    ],
  },
  {
    id: "file-tree",
    label: "File Tree",
    description: "Explorer-style sidebar showing generated files, folders and selection state.",
    category: "code",
    tags: ["files", "tree", "explorer", "sidebar"],
    promptHints: [
      "Show nested folders and files in an explorer layout with expand/collapse affordances.",
      "Highlight the selected file and keep long paths readable with truncation.",
    ],
  },
  {
    id: "version-compare",
    label: "Version Compare",
    description: "Version switcher and comparison surface for demo URLs, revisions and generated outputs.",
    category: "code",
    tags: ["versions", "compare", "history", "demo-url"],
    promptHints: [
      "Render version cards with status, timestamp and optional demo URL badge.",
      "Allow side-by-side compare or quick switching between selected versions.",
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
  {
    id: "agent-timeline",
    label: "Agent Timeline",
    description: "Step-by-step agent execution timeline with statuses, outputs and expandable details.",
    category: "workflow",
    tags: ["timeline", "steps", "agents", "status"],
    promptHints: [
      "Render execution as a vertical timeline with timestamps, icons and status colors.",
      "Allow each step to expand for logs, outputs and follow-up actions.",
    ],
  },
  {
    id: "agent-graph",
    label: "Agent Graph",
    description: "Graph view for multi-agent orchestration, handoffs and dependencies between tasks.",
    category: "workflow",
    tags: ["graph", "agents", "handoff", "dependencies"],
    dependencies: ["@xyflow/react"],
    promptHints: [
      "Use a node-and-edge layout showing which agent produced which artifact or handoff.",
      "Visually distinguish queued, running, completed and failed nodes.",
    ],
  },
  {
    id: "three-scene",
    label: "Three.js Scene",
    description: "Immersive 3D hero or feature section powered by react-three-fiber and drei.",
    category: "workflow",
    tags: ["3d", "three", "hero", "canvas"],
    dependencies: ["three", "@react-three/fiber", "@react-three/drei"],
    promptHints: [
      "Use a lightweight 3D scene as a hero or feature background without blocking page performance.",
      "Keep the scene interactive but accessible, with sensible fallbacks for low-power devices.",
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
    id: "approval-drawer",
    label: "Approval Drawer",
    description: "Side drawer for reviewing risky AI actions before approval, execution or rollback.",
    category: "tools",
    tags: ["approval", "drawer", "review", "safety"],
    dependencies: ["ai"],
    promptHints: [
      "Show pending actions in a drawer with clear approve, reject and edit controls.",
      "Include a compact risk summary, parameter preview and secondary details below.",
    ],
  },
  {
    id: "deploy-console",
    label: "Deploy Console",
    description: "Live deployment and verification panel with logs, environment badges and outcomes.",
    category: "tools",
    tags: ["deploy", "logs", "console", "environment"],
    promptHints: [
      "Render live log lines in a terminal-inspired panel with statuses and timestamps.",
      "Surface environment badges for dev, preview and production near the header.",
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
  {
    id: "badge-cluster",
    label: "Badge Cluster",
    description: "Dense cluster of badges, pills and chips for status, model, source or capability labels.",
    category: "utility",
    tags: ["badges", "chips", "status", "labels"],
    promptHints: [
      "Combine badges of different visual weights to show capability, status and metadata at a glance.",
      "Use compact spacing so the cluster works in headers, cards and sidebars.",
    ],
  },
  {
    id: "modal-stack",
    label: "Modal Stack",
    description: "Layered modal or dialog system for nested flows, confirmations and quick-edit moments.",
    category: "utility",
    tags: ["modal", "dialog", "stack", "overlay"],
    promptHints: [
      "Design a modal system that supports nested flows without feeling chaotic.",
      "Use clear hierarchy between primary dialog content and secondary confirmations or sheets.",
    ],
  },
  {
    id: "spotlight-hero",
    label: "Spotlight Hero",
    description: "Animated hero section with strong heading, CTA, social proof and light effects.",
    category: "utility",
    tags: ["hero", "animation", "cta", "landing-page"],
    dependencies: ["framer-motion"],
    promptHints: [
      "Create a hero with animated entrance, strong headline hierarchy and primary CTA.",
      "Add tasteful light, gradient or spotlight effects that enhance the design without overpowering content.",
    ],
  },
  {
    id: "header-command-bar",
    label: "Header Command Bar",
    description: "AI-forward header with global search, quick actions, badges and assistant entry point.",
    category: "utility",
    tags: ["header", "navigation", "command-bar", "quick-actions"],
    promptHints: [
      "Design a top header combining global search, primary actions and assistant shortcuts.",
      "Include badges or compact indicators for model, environment or run status.",
    ],
  },
  {
    id: "footer-link-cloud",
    label: "Footer Link Cloud",
    description: "Rich footer with grouped links, badges, trust notes and a subtle final CTA band.",
    category: "utility",
    tags: ["footer", "links", "cta", "metadata"],
    promptHints: [
      "Build a footer with grouped navigation, metadata, trust notes and a final CTA strip.",
      "Use separators, badges and subtle tonal contrast to make the footer feel intentional.",
    ],
  },
  {
    id: "metric-strip",
    label: "Metric Strip",
    description: "Animated KPI strip with counters, delta badges and compact supporting labels.",
    category: "utility",
    tags: ["metrics", "stats", "badges", "dashboard"],
    dependencies: ["framer-motion"],
    promptHints: [
      "Display 3-6 headline metrics with delta badges and short supporting descriptions.",
      "Use subtle motion or count-up effects to make the strip feel alive without distracting the user.",
    ],
  },
  {
    id: "animation-showcase",
    label: "Animation Showcase",
    description: "Section dedicated to motion patterns like reveal-on-scroll, marquee, shimmer and hover depth.",
    category: "utility",
    tags: ["animation", "motion", "microinteraction", "showcase"],
    dependencies: ["framer-motion", "lottie-react"],
    promptHints: [
      "Combine scroll-reveal, hover depth and subtle looping motion in one cohesive section.",
      "Prefer polished microinteractions over excessive animation density.",
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
