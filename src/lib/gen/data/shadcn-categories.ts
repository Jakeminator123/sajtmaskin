/**
 * shadcn/ui component categories — mirrors the official llms.txt grouping.
 *
 * Used by enhancement packs and buildDynamicContext to present components
 * to the LLM grouped by function rather than as a flat alphabetical list.
 *
 * Source: https://ui.shadcn.com/llms.txt
 */

export interface ShadcnCategory {
  id: string;
  label: string;
  /** Root component names (keys in SHADCN_COMPONENTS). */
  components: string[];
}

export const SHADCN_CATEGORIES: readonly ShadcnCategory[] = [
  {
    id: "form-input",
    label: "Form & Input",
    components: [
      "Field",
      "Button",
      "ButtonGroup",
      "Input",
      "InputGroup",
      "InputOTP",
      "Textarea",
      "Checkbox",
      "RadioGroup",
      "Select",
      "NativeSelect",
      "Switch",
      "Slider",
      "Calendar",
      "Label",
      "Form",
    ],
  },
  {
    id: "layout-nav",
    label: "Layout & Navigation",
    components: [
      "Accordion",
      "Breadcrumb",
      "NavigationMenu",
      "Sidebar",
      "Tabs",
      "Separator",
      "ScrollArea",
      "ResizablePanel",
      "Collapsible",
      "Pagination",
    ],
  },
  {
    id: "overlays",
    label: "Overlays & Dialogs",
    components: [
      "Dialog",
      "AlertDialog",
      "Sheet",
      "Drawer",
      "Popover",
      "Tooltip",
      "HoverCard",
      "ContextMenu",
      "DropdownMenu",
      "Menubar",
      "Command",
    ],
  },
  {
    id: "feedback",
    label: "Feedback & Status",
    components: [
      "Alert",
      "Sonner",
      "Progress",
      "Spinner",
      "Skeleton",
      "Badge",
      "Empty",
    ],
  },
  {
    id: "display",
    label: "Display & Media",
    components: [
      "Avatar",
      "Card",
      "Table",
      "Chart",
      "Carousel",
      "AspectRatio",
      "Item",
      "Kbd",
      "Toggle",
      "ToggleGroup",
    ],
  },
];
