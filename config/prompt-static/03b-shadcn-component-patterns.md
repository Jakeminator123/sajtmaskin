## shadcn Component Patterns

These are the correct usage patterns for interactive shadcn components. Use these — do not invent parallel implementations or build manual versions of what these components already provide.

- **Calendar**: `<Calendar mode="single" selected={date} onSelect={setDate} />` wraps react-day-picker. Supports `mode="range"` for date spans. NEVER build a manual date grid — Calendar handles navigation, selection, and accessibility.
- **DatePicker** (composition): Calendar + Popover + `format(date, "PPP")` from date-fns. Trigger with a Button inside PopoverTrigger.
- **Command**: `<Command><CommandInput /><CommandList><CommandGroup><CommandItem>` wraps cmdk for searchable menus with fuzzy matching. Combine with Dialog for a cmd+k overlay.
- **Combobox**: local `@/components/ui/combobox` primitives exist. Preferred pattern: `<Combobox><ComboboxInput ... /><ComboboxContent><ComboboxList><ComboboxItem ... /></ComboboxList></ComboboxContent></Combobox>`. Use the local combobox wrapper directly unless you intentionally need a lower-level custom composition.
- **Drawer**: `<Drawer><DrawerTrigger><DrawerContent>` wraps vaul. Mobile-optimized bottom sheet. Use instead of Dialog on mobile touch surfaces.
- **Carousel**: `<Carousel><CarouselContent><CarouselItem>` wraps embla-carousel-react. Add `embla-carousel-autoplay` to deps for auto-rotation.
- **Chart**: `<ChartContainer config={chartConfig}><BarChart data={data}>` wraps Recharts. Always use `<ChartTooltip content={<ChartTooltipContent />} />` — not raw Recharts Tooltip.
- **Form**: Always pair with `useForm()` from react-hook-form + zod schema + `@hookform/resolvers/zod`. Structure: `<Form><FormField control={form.control} name="x" render={({field}) => <FormItem><FormLabel /><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />`.
- **InputOTP**: `<InputOTP maxLength={6}><InputOTPGroup><InputOTPSlot index={0} />...` for verification codes. Wraps input-otp.
- **Sheet**: `<Sheet><SheetTrigger><SheetContent side="left">`. Use for mobile navigation drawers and slide-over panels.
- **DataTable** (composition): @tanstack/react-table for column definitions, sorting, filtering, pagination logic. shadcn Table (`<Table><TableHeader><TableBody><TableRow><TableCell>`) for rendering.
- **Sidebar**: `<SidebarProvider><Sidebar><SidebarHeader><SidebarContent><SidebarMenu>`. Use `<SidebarTrigger />` for collapse toggle.
- **Sonner**: `toast("Message")` or `toast.success("Done")`. Import `{ toast }` from `"sonner"` — NOT from `"@/components/ui/sonner"` (that file only exports the Toaster provider).
- **Empty**: `<Empty><EmptyHeader><EmptyMedia variant="icon"><Icon /></EmptyMedia><EmptyTitle>No items</EmptyTitle><EmptyDescription>...</EmptyDescription></EmptyHeader><EmptyContent>...</EmptyContent></Empty>` for zero-state views.
- **Spinner**: `<Spinner />` for loading indicators. Accepts size variants via className.
- **InputGroup**: `<InputGroup><InputGroupInput placeholder="Search..." /><InputGroupAddon><SearchIcon /></InputGroupAddon></InputGroup>` for inputs with icons, prefixes, or action buttons.
- **next-themes**: Use `<ThemeProvider>` in layout.tsx wrapping children. Toggle with `const { setTheme } = useTheme()` in a `"use client"` component.
- **HoverCard**: `<HoverCard openDelay={200}><HoverCardTrigger asChild><Link>...</Link></HoverCardTrigger><HoverCardContent>` for rich preview on hover. Use for author cards, link previews, product details.
- **Accordion**: `<Accordion type="single" collapsible><AccordionItem value="item-1"><AccordionTrigger>...<AccordionContent>`. Use `type="multiple"` to allow several open at once.
- **Tabs**: `<Tabs defaultValue="tab1"><TabsList><TabsTrigger value="tab1">...<TabsTrigger value="tab2">...</TabsList><TabsContent value="tab1">...<TabsContent value="tab2">`. Value must match between trigger and content.
- **NavigationMenu**: `<NavigationMenu><NavigationMenuList><NavigationMenuItem><NavigationMenuTrigger>...<NavigationMenuContent>`. Use NavigationMenuLink for leaf items. Complex hierarchy — prefer for multi-section nav, not simple link bars.
- **Resizable**: `<ResizablePanelGroup direction="horizontal"><ResizablePanel>...<ResizableHandle /><ResizablePanel>`. Use for split-view editors, adjustable layouts.
