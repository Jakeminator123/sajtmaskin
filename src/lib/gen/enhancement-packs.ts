/**
 * Enhancement packs — modular prompt-guidance layers activated by capabilities.
 *
 * Builds on P14 CapabilityPacks (deps + component names) by adding concrete
 * prompt guidance with composition patterns and code examples so the LLM
 * generates better code for each functional area.
 */

import type { InferredCapabilities } from "./capability-inference";

export interface EnhancementPack {
  id: string;
  label: string;
  trigger: keyof InferredCapabilities;
  shadcnComponents: string[];
  npmDeps: Record<string, string>;
  promptGuidance: string;
  exampleUsage?: string;
  conflictsWith?: string[];
}

const ENHANCEMENT_PACKS: readonly EnhancementPack[] = [
  {
    id: "form-pack",
    label: "Form Components",
    trigger: "needsForms",
    shadcnComponents: [
      "Form", "FormField", "FormItem", "FormLabel", "FormControl", "FormMessage",
      "Field", "FieldControl", "FieldDescription", "FieldError", "FieldGroup", "FieldLabel",
      "Input", "InputGroup", "InputGroupAddon", "InputGroupInput",
      "Textarea", "Select", "NativeSelect", "Checkbox", "RadioGroup", "Switch",
      "Calendar", "Label",
    ],
    npmDeps: {},
    promptGuidance: `### Form Components (shadcn/ui)

**Available components:**
- \`Form\`, \`FormField\`, \`FormItem\`, \`FormLabel\`, \`FormControl\`, \`FormMessage\` from "@/components/ui/form" — React Hook Form integration
- \`Field\`, \`FieldControl\`, \`FieldDescription\`, \`FieldError\`, \`FieldGroup\`, \`FieldLabel\` from "@/components/ui/field" — standalone field wrapper with labels and validation
- \`InputGroup\`, \`InputGroupAddon\`, \`InputGroupInput\` from "@/components/ui/input-group" — input with prefix/suffix addons (icons, text, buttons)
- \`NativeSelect\` from "@/components/ui/native-select" — styled native select for simple dropdowns

**Composition patterns:**
- Form > FormField > FormItem > (FormLabel + FormControl + FormMessage)
- Field > FieldControl > (Input | Select | NativeSelect) + FieldError
- FieldGroup wraps multiple Fields into a logical form section
- InputGroup > InputGroupInput + InputGroupAddon (for search icons, currency symbols, etc.)

**Best practices:**
- Always define a zod schema and derive the form type with z.infer
- Use FieldGroup for multi-step wizard sections
- Use InputGroup with addons for search bars, URL inputs, price fields
- Prefer NativeSelect over Select for simple option lists (less JS overhead)`,
    exampleUsage: `<Form {...form}>
  <FormField control={form.control} name="email" render={({ field }) => (
    <FormItem>
      <FormLabel>Email</FormLabel>
      <FormControl>
        <InputGroup>
          <InputGroupAddon>@</InputGroupAddon>
          <InputGroupInput placeholder="you@example.com" {...field} />
        </InputGroup>
      </FormControl>
      <FormMessage />
    </FormItem>
  )} />
</Form>`,
  },
  {
    id: "chart-pack",
    label: "Charts & Data Visualization",
    trigger: "needsCharts",
    shadcnComponents: [
      "ChartContainer", "ChartTooltip", "ChartTooltipContent",
      "ChartLegend", "ChartLegendContent",
    ],
    npmDeps: {},
    promptGuidance: `### Chart Components (shadcn/ui + Recharts)

**Available components:**
- \`ChartContainer\`, \`ChartTooltip\`, \`ChartTooltipContent\`, \`ChartLegend\`, \`ChartLegendContent\` from "@/components/ui/chart"
- All Recharts components (AreaChart, BarChart, LineChart, PieChart, RadialBarChart) from "recharts"

**Composition pattern:**
- ChartContainer wraps any Recharts chart and provides theming via ChartConfig
- Always define a ChartConfig with label + color per data series
- Use ChartTooltip with ChartTooltipContent (not raw Recharts Tooltip)

**Best practices:**
- Provide realistic mock data with 10-12 data points
- Use area/bar/line for trends, pie for proportions, radial for single metrics
- Set responsive container via ChartContainer (do not hardcode width/height)
- Use semantic color tokens (--chart-1 through --chart-5) from the theme`,
    exampleUsage: `const chartConfig = {
  revenue: { label: "Revenue", color: "var(--chart-1)" },
  expenses: { label: "Expenses", color: "var(--chart-2)" },
} satisfies ChartConfig;

<ChartContainer config={chartConfig}>
  <AreaChart data={data}>
    <CartesianGrid strokeDasharray="3 3" />
    <XAxis dataKey="month" />
    <ChartTooltip content={<ChartTooltipContent />} />
    <Area dataKey="revenue" fill="var(--chart-1)" />
    <Area dataKey="expenses" fill="var(--chart-2)" />
  </AreaChart>
</ChartContainer>`,
  },
  {
    id: "data-table-pack",
    label: "Data Tables",
    trigger: "needsDataUI",
    shadcnComponents: [
      "Table", "TableBody", "TableCell", "TableHead", "TableHeader", "TableRow",
      "Badge", "DropdownMenu", "DropdownMenuContent", "DropdownMenuItem", "DropdownMenuTrigger",
    ],
    npmDeps: { "@tanstack/react-table": "^8" },
    promptGuidance: `### Data Table Components (shadcn/ui + TanStack Table)

**Available components:**
- \`Table\`, \`TableBody\`, \`TableCell\`, \`TableHead\`, \`TableHeader\`, \`TableRow\` from "@/components/ui/table"
- \`DropdownMenu\` family for row action menus
- \`Badge\` for status indicators in cells

**Composition pattern:**
- Define columns with createColumnHelper or ColumnDef[]
- useReactTable({ data, columns, getCoreRowModel, getSortedRowModel, getFilteredRowModel, getPaginationRowModel })
- Render: Table > TableHeader > TableRow > TableHead (for headers), TableBody > TableRow > TableCell (for rows)

**Best practices:**
- Type column defs with the row data type
- Add sorting via getSortedRowModel + header click handlers
- Add filtering via getFilteredRowModel + an Input for the filter value
- Add pagination via getPaginationRowModel + Button controls
- Use DropdownMenu in the last column for row actions (edit, delete, view)`,
    exampleUsage: `const columns: ColumnDef<Payment>[] = [
  { accessorKey: "status", header: "Status", cell: ({ row }) => <Badge>{row.getValue("status")}</Badge> },
  { accessorKey: "email", header: ({ column }) => <Button variant="ghost" onClick={() => column.toggleSorting()}>Email</Button> },
  { accessorKey: "amount", header: "Amount", cell: ({ row }) => new Intl.NumberFormat("en", { style: "currency", currency: "USD" }).format(row.getValue("amount")) },
];`,
  },
  {
    id: "feedback-pack",
    label: "Feedback & Loading States",
    trigger: "needsAppShell",
    shadcnComponents: [
      "Empty", "EmptyContent", "EmptyDescription", "EmptyHeader", "EmptyMedia", "EmptyTitle",
      "Spinner",
      "Skeleton",
      "Sonner",
      "Progress",
    ],
    npmDeps: {},
    promptGuidance: `### Feedback & Loading State Components (shadcn/ui)

**Available components:**
- \`Empty\`, \`EmptyContent\`, \`EmptyDescription\`, \`EmptyHeader\`, \`EmptyMedia\`, \`EmptyTitle\` from "@/components/ui/empty" — structured empty/no-data states
- \`Spinner\` from "@/components/ui/spinner" — loading indicator
- \`Skeleton\` from "@/components/ui/skeleton" — placeholder loading shapes
- \`Sonner\` from "@/components/ui/sonner" (toast notifications via sonner)
- \`Progress\` from "@/components/ui/progress" — progress bars

**Composition pattern:**
- Empty > EmptyHeader > (EmptyMedia + EmptyTitle + EmptyDescription) + EmptyContent
- Use EmptyMedia with variant="icon" for icon-based empty states
- Spinner works inside Button (disabled state), Badge, or standalone

**Best practices:**
- Every data-fetching section should have loading (Skeleton), empty (Empty), and error states
- Use Sonner for async action feedback (save, delete, submit)
- Use Spinner inside buttons during form submission
- Use Progress for multi-step wizards or file uploads`,
    exampleUsage: `<Empty className="border border-dashed">
  <EmptyHeader>
    <EmptyMedia variant="icon"><FolderIcon /></EmptyMedia>
    <EmptyTitle>No projects yet</EmptyTitle>
    <EmptyDescription>Create your first project to get started.</EmptyDescription>
  </EmptyHeader>
  <EmptyContent>
    <Button><PlusIcon /> Create Project</Button>
  </EmptyContent>
</Empty>`,
  },
  {
    id: "carousel-pack",
    label: "Carousel & Galleries",
    trigger: "needsCarousel",
    shadcnComponents: [
      "Carousel", "CarouselContent", "CarouselItem", "CarouselNext", "CarouselPrevious",
    ],
    npmDeps: { "embla-carousel-autoplay": "^8" },
    promptGuidance: `### Carousel Components (shadcn/ui + Embla)

**Available components:**
- \`Carousel\`, \`CarouselContent\`, \`CarouselItem\`, \`CarouselNext\`, \`CarouselPrevious\` from "@/components/ui/carousel"

**Composition pattern:**
- Carousel > CarouselContent > CarouselItem[] + CarouselPrevious + CarouselNext
- For auto-rotation: import Autoplay from "embla-carousel-autoplay", pass as plugin

**Best practices:**
- Set basis-* on CarouselItem for responsive sizing (e.g. basis-1/3 for 3-up)
- Use opts={{ loop: true }} for infinite scroll
- Add Autoplay({ delay: 4000, stopOnInteraction: true }) for hero sliders
- Use AspectRatio inside CarouselItem for consistent image dimensions`,
    exampleUsage: `<Carousel opts={{ loop: true }} plugins={[Autoplay({ delay: 4000 })]}>
  <CarouselContent>
    {items.map((item) => (
      <CarouselItem key={item.id} className="basis-1/3">
        <Card><CardContent><img src={item.image} alt={item.title} /></CardContent></Card>
      </CarouselItem>
    ))}
  </CarouselContent>
  <CarouselPrevious />
  <CarouselNext />
</Carousel>`,
  },
  {
    id: "motion-pack",
    label: "Motion & Animation",
    trigger: "needsMotion",
    shadcnComponents: [],
    npmDeps: {},
    promptGuidance: `### Motion & Animation (framer-motion)

**Patterns:**
- Entrance animations: \`motion.div\` with initial/animate/transition
- Scroll reveals: \`whileInView\` with \`viewport={{ once: true }}\`
- Staggered children: parent with \`staggerChildren\` in variants, children with individual variant
- Hover/tap microinteractions: \`whileHover\`, \`whileTap\`
- Page transitions: wrap content in \`AnimatePresence\` with \`motion.div\` keyed by route

**Best practices:**
- Use "use client" on any component using framer-motion hooks
- Prefer spring transitions (type: "spring") for natural feel
- Use \`viewport={{ once: true, margin: "-100px" }}\` for scroll reveals to trigger slightly before visible
- Keep animations subtle (0.3-0.6s) — avoid long delays that feel sluggish`,
    exampleUsage: `<motion.div
  initial={{ opacity: 0, y: 20 }}
  whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true }}
  transition={{ duration: 0.5 }}
>
  <Card>...</Card>
</motion.div>`,
  },
  {
    id: "3d-pack",
    label: "3D & WebGL",
    trigger: "needs3D",
    shadcnComponents: [],
    npmDeps: {},
    promptGuidance: `### 3D / WebGL (@react-three/fiber + drei)

**Setup:**
- Wrap \`<Canvas>\` in a "use client" component
- Canvas must have explicit height (e.g. className="h-[600px]")
- Import from "@react-three/fiber" (Canvas, useFrame, useThree) and "@react-three/drei" (OrbitControls, Environment, Float, Text3D, useGLTF, etc.)

**Common patterns:**
- Floating objects: \`<Float speed={2} rotationIntensity={0.5}>\`
- Environment lighting: \`<Environment preset="city" />\`
- Camera controls: \`<OrbitControls enableZoom={false} />\`
- Physics: add @react-three/rapier, wrap in \`<Physics>\`, use \`<RigidBody>\`
- GLTF models: \`const { scene } = useGLTF("/model.glb")\`; put assets under \`public/\`

**Pitfalls to avoid:**
- Do NOT use lucide-react icons as 3D meshes — they are 2D SVG only
- Do NOT import three.js directly for basic scenes — use drei helpers
- Always add a fallback \`<Suspense fallback={<Spinner />}>\` around Canvas`,
  },
  {
    id: "command-pack",
    label: "Command Palette",
    trigger: "needsAppShell",
    shadcnComponents: [
      "Command", "CommandDialog", "CommandEmpty", "CommandGroup",
      "CommandInput", "CommandItem", "CommandList",
    ],
    npmDeps: {},
    promptGuidance: `### Command Palette (shadcn/ui + cmdk)

**Available components:**
- \`Command\`, \`CommandDialog\`, \`CommandEmpty\`, \`CommandGroup\`, \`CommandInput\`, \`CommandItem\`, \`CommandList\` from "@/components/ui/command"

**Composition pattern:**
- CommandDialog > Command > CommandInput + CommandList > CommandEmpty + CommandGroup > CommandItem[]
- Open with Cmd+K / Ctrl+K via useEffect keydown listener
- Group items by category (Navigation, Actions, Settings)

**Best practices:**
- Use CommandEmpty for "No results found" state
- Add keyboard shortcut hints with Kbd component in CommandItem
- Close dialog on item selection via onSelect + setOpen(false)`,
    exampleUsage: `<CommandDialog open={open} onOpenChange={setOpen}>
  <CommandInput placeholder="Search..." />
  <CommandList>
    <CommandEmpty>No results found.</CommandEmpty>
    <CommandGroup heading="Pages">
      <CommandItem onSelect={() => router.push("/dashboard")}>
        <LayoutDashboardIcon /> Dashboard
      </CommandItem>
      <CommandItem onSelect={() => router.push("/settings")}>
        <SettingsIcon /> Settings
      </CommandItem>
    </CommandGroup>
  </CommandList>
</CommandDialog>`,
  },
];

export function resolveEnhancementPacks(
  caps: InferredCapabilities,
): EnhancementPack[] {
  return ENHANCEMENT_PACKS.filter((pack) => caps[pack.trigger]);
}

export function collectEnhancementDeps(
  packs: EnhancementPack[],
): Record<string, string> {
  const deps: Record<string, string> = {};
  for (const pack of packs) {
    for (const [pkg, ver] of Object.entries(pack.npmDeps)) {
      if (!deps[pkg]) deps[pkg] = ver;
    }
  }
  return deps;
}

export function buildEnhancementGuidance(
  packs: EnhancementPack[],
): string | null {
  if (packs.length === 0) return null;

  const sections: string[] = [];
  for (const pack of packs) {
    let section = pack.promptGuidance;
    if (pack.exampleUsage) {
      section += `\n\n**Example:**\n\`\`\`tsx\n${pack.exampleUsage}\n\`\`\``;
    }
    sections.push(section);
  }
  return `## Enhancement Packs\n\n${sections.join("\n\n---\n\n")}`;
}

export { ENHANCEMENT_PACKS };
