export interface DocSnippet {
  id: string;
  category: "shadcn" | "nextjs" | "tailwind" | "patterns" | "lucide" | "library" | "example";
  keywords: string[];
  title: string;
  content: string;
}

export const DOCS_SNIPPETS: DocSnippet[] = [
  // ── shadcn (20) ──────────────────────────────────────────────────────────

  {
    id: "shadcn-form",
    category: "shadcn",
    keywords: ["form", "input", "validation", "zod", "react-hook-form", "submit"],
    title: "Form with Validation",
    content: `Use shadcn Form with react-hook-form + zod:
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
Wrap inputs in <FormField control={form.control} name="fieldName" render={({field}) => <FormItem>...</FormItem>} />
Always define a zod schema and pass zodResolver(schema) to useForm.`,
  },
  {
    id: "shadcn-data-table",
    category: "shadcn",
    keywords: ["table", "data-table", "sorting", "filtering", "pagination", "tanstack"],
    title: "Data Table",
    content: `Build data tables with @tanstack/react-table + shadcn Table:
import { useReactTable, getCoreRowModel, getPaginationRowModel, getSortedRowModel } from "@tanstack/react-table"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
Define columns with columnHelper or ColumnDef<T>[]. Use flexRender for cell rendering.
Add DataTablePagination and DataTableColumnHeader for sorting/pagination controls.`,
  },
  {
    id: "shadcn-sheet",
    category: "shadcn",
    keywords: ["sheet", "sidebar", "slide", "panel", "drawer", "mobile-menu"],
    title: "Sheet (Slide-over Panel)",
    content: `Sheet is a panel that slides from an edge. Great for mobile nav or detail views:
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
<Sheet><SheetTrigger asChild><Button>Open</Button></SheetTrigger>
<SheetContent side="right"><SheetHeader><SheetTitle>Title</SheetTitle></SheetHeader>...</SheetContent></Sheet>
Sides: "top" | "right" | "bottom" | "left". Always include SheetTitle for accessibility.`,
  },
  {
    id: "shadcn-dialog",
    category: "shadcn",
    keywords: ["dialog", "modal", "popup", "overlay", "confirm", "alert"],
    title: "Dialog (Modal)",
    content: `Centered modal overlay for confirmations, forms, or detail views:
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog"
<Dialog><DialogTrigger asChild><Button>Open</Button></DialogTrigger>
<DialogContent><DialogHeader><DialogTitle>Title</DialogTitle><DialogDescription>Description</DialogDescription></DialogHeader>
...content...<DialogFooter><Button>Save</Button></DialogFooter></DialogContent></Dialog>
Always include DialogTitle + DialogDescription for accessibility.`,
  },
  {
    id: "shadcn-drawer",
    category: "shadcn",
    keywords: ["drawer", "bottom-sheet", "mobile", "swipe", "panel"],
    title: "Drawer (Bottom Sheet)",
    content: `Mobile-friendly bottom drawer that can be swiped:
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter, DrawerTrigger } from "@/components/ui/drawer"
<Drawer><DrawerTrigger asChild><Button>Open</Button></DrawerTrigger>
<DrawerContent><DrawerHeader><DrawerTitle>Title</DrawerTitle></DrawerHeader>
...content...<DrawerFooter><Button>Submit</Button></DrawerFooter></DrawerContent></Drawer>
Combine with Dialog using useMediaQuery: Drawer on mobile, Dialog on desktop.`,
  },
  {
    id: "shadcn-tabs",
    category: "shadcn",
    keywords: ["tabs", "tab", "panel", "switch", "sections", "navigation"],
    title: "Tabs",
    content: `Organize content into switchable panels:
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
<Tabs defaultValue="tab1"><TabsList><TabsTrigger value="tab1">Tab 1</TabsTrigger>
<TabsTrigger value="tab2">Tab 2</TabsTrigger></TabsList>
<TabsContent value="tab1">Content 1</TabsContent>
<TabsContent value="tab2">Content 2</TabsContent></Tabs>
Use controlled mode with value + onValueChange for programmatic tab switching.`,
  },
  {
    id: "shadcn-command",
    category: "shadcn",
    keywords: ["command", "search", "palette", "cmdk", "filter", "spotlight"],
    title: "Command Palette",
    content: `Searchable command menu (cmdk-powered):
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
<CommandDialog open={open} onOpenChange={setOpen}><CommandInput placeholder="Search..." />
<CommandList><CommandEmpty>No results.</CommandEmpty>
<CommandGroup heading="Actions"><CommandItem onSelect={handler}>Action</CommandItem></CommandGroup></CommandList></CommandDialog>
Trigger with Ctrl+K / Cmd+K keyboard shortcut.`,
  },
  {
    id: "shadcn-select",
    category: "shadcn",
    keywords: ["select", "dropdown", "option", "pick", "choice"],
    title: "Select",
    content: `Styled native-like dropdown select:
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
<Select value={value} onValueChange={setValue}>
<SelectTrigger><SelectValue placeholder="Choose..." /></SelectTrigger>
<SelectContent>{items.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>
Use SelectGroup + SelectLabel for grouped options.`,
  },
  {
    id: "shadcn-combobox",
    category: "shadcn",
    keywords: ["combobox", "autocomplete", "search-select", "typeahead", "combo"],
    title: "Combobox (Autocomplete Select)",
    content: `Searchable select built from Popover + Command:
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
<Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button variant="outline" role="combobox">
{selected || "Select..."}</Button></PopoverTrigger><PopoverContent>
<Command><CommandInput /><CommandList><CommandEmpty>No results.</CommandEmpty>
<CommandGroup>{items.map(i => <CommandItem onSelect={() => { setValue(i); setOpen(false) }}>{i}</CommandItem>)}</CommandGroup></CommandList></Command></PopoverContent></Popover>`,
  },
  {
    id: "shadcn-toast",
    category: "shadcn",
    keywords: ["toast", "notification", "snackbar", "alert", "sonner", "message"],
    title: "Toast Notifications",
    content: `Use Sonner for toast notifications:
import { toast } from "sonner"
toast("Event created") // basic
toast.success("Saved successfully")
toast.error("Something went wrong")
toast.promise(saveData(), { loading: "Saving...", success: "Done!", error: "Failed" })
Add <Sonner /> from "@/components/ui/sonner" in your root layout.`,
  },
  {
    id: "shadcn-navigation-menu",
    category: "shadcn",
    keywords: ["navigation", "navbar", "nav", "menu", "header", "links", "mega-menu"],
    title: "Navigation Menu",
    content: `Desktop navigation with dropdown sub-menus:
import { NavigationMenu, NavigationMenuContent, NavigationMenuItem, NavigationMenuLink, NavigationMenuList, NavigationMenuTrigger } from "@/components/ui/navigation-menu"
<NavigationMenu><NavigationMenuList><NavigationMenuItem><NavigationMenuTrigger>Features</NavigationMenuTrigger>
<NavigationMenuContent><ul className="grid gap-3 p-4 md:w-[400px] md:grid-cols-2">
<li><NavigationMenuLink href="/feature">Feature name</NavigationMenuLink></li></ul></NavigationMenuContent></NavigationMenuItem></NavigationMenuList></NavigationMenu>
Pair with Sheet for mobile hamburger menu.`,
  },
  {
    id: "shadcn-dropdown-menu",
    category: "shadcn",
    keywords: ["dropdown", "menu", "context", "actions", "more", "ellipsis"],
    title: "Dropdown Menu",
    content: `Action menu triggered by a button click:
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
<DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal /></Button></DropdownMenuTrigger>
<DropdownMenuContent align="end"><DropdownMenuLabel>Actions</DropdownMenuLabel><DropdownMenuSeparator />
<DropdownMenuItem onClick={handleEdit}>Edit</DropdownMenuItem>
<DropdownMenuItem className="text-destructive" onClick={handleDelete}>Delete</DropdownMenuItem></DropdownMenuContent></DropdownMenu>`,
  },
  {
    id: "shadcn-popover",
    category: "shadcn",
    keywords: ["popover", "tooltip", "floating", "hover", "info", "popup"],
    title: "Popover",
    content: `Floating content panel anchored to a trigger:
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
<Popover><PopoverTrigger asChild><Button variant="outline">Open</Button></PopoverTrigger>
<PopoverContent className="w-80"><div className="grid gap-4">
<h4 className="font-medium leading-none">Settings</h4>
<div className="grid gap-2">...form fields...</div></div></PopoverContent></Popover>
For hover-only info, use Tooltip instead. Popover is for interactive content.`,
  },
  {
    id: "shadcn-carousel",
    category: "shadcn",
    keywords: ["carousel", "slider", "slideshow", "gallery", "swipe", "embla"],
    title: "Carousel",
    content: `Swipeable content carousel (embla-carousel):
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel"
<Carousel opts={{ align: "start", loop: true }}><CarouselContent>
{items.map((item, i) => <CarouselItem key={i} className="md:basis-1/2 lg:basis-1/3">
<Card>...</Card></CarouselItem>)}</CarouselContent>
<CarouselPrevious /><CarouselNext /></Carousel>
Use basis-* classes to control how many items are visible per viewport.`,
  },
  {
    id: "shadcn-calendar",
    category: "shadcn",
    keywords: ["calendar", "date", "picker", "schedule", "day", "month"],
    title: "Calendar",
    content: `Date selection calendar component:
import { Calendar } from "@/components/ui/calendar"
const [date, setDate] = useState<Date | undefined>(new Date())
<Calendar mode="single" selected={date} onSelect={setDate} className="rounded-md border" />
Modes: "single" (one date), "multiple" (array), "range" (from/to).
Wrap in Popover for a dropdown date picker UX.`,
  },
  {
    id: "shadcn-date-picker",
    category: "shadcn",
    keywords: ["date-picker", "datepicker", "date-input", "calendar-popup", "booking"],
    title: "Date Picker (Calendar in Popover)",
    content: `Dropdown date picker combining Popover + Calendar:
<Popover><PopoverTrigger asChild><Button variant="outline" className={cn("w-[240px] justify-start text-left font-normal", !date && "text-muted-foreground")}>
<CalendarIcon className="mr-2 h-4 w-4" />{date ? format(date, "PPP") : "Pick a date"}</Button></PopoverTrigger>
<PopoverContent className="w-auto p-0"><Calendar mode="single" selected={date} onSelect={setDate} initialFocus /></PopoverContent></Popover>
Use date-fns format() for display. Add "range" mode for date range pickers.`,
  },
  {
    id: "shadcn-chart",
    category: "shadcn",
    keywords: ["chart", "graph", "recharts", "bar", "line", "pie", "area", "analytics"],
    title: "Charts with Recharts",
    content: `Use Recharts wrapped in shadcn ChartContainer:
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts"
const config = { revenue: { label: "Revenue", color: "hsl(var(--chart-1))" } }
<ChartContainer config={config}><BarChart data={data}><CartesianGrid strokeDasharray="3 3" />
<XAxis dataKey="month" /><YAxis /><ChartTooltip content={<ChartTooltipContent />} />
<Bar dataKey="revenue" fill="var(--color-revenue)" /></BarChart></ChartContainer>`,
  },
  {
    id: "shadcn-avatar",
    category: "shadcn",
    keywords: ["avatar", "profile", "user", "photo", "initials", "picture"],
    title: "Avatar",
    content: `User avatar with image fallback to initials:
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
<Avatar><AvatarImage src={user.avatarUrl} alt={user.name} />
<AvatarFallback>{user.name.split(" ").map(n => n[0]).join("")}</AvatarFallback></Avatar>
Stack avatars with negative margin for group display:
<div className="flex -space-x-2">{users.map(u => <Avatar key={u.id} className="border-2 border-background">...</Avatar>)}</div>`,
  },
  {
    id: "shadcn-badge",
    category: "shadcn",
    keywords: ["badge", "tag", "label", "status", "chip", "pill"],
    title: "Badge",
    content: `Small status labels and tags:
import { Badge } from "@/components/ui/badge"
<Badge>Default</Badge>
<Badge variant="secondary">Secondary</Badge>
<Badge variant="destructive">Error</Badge>
<Badge variant="outline">Outline</Badge>
Combine with icons: <Badge><CheckCircle className="mr-1 h-3 w-3" />Active</Badge>
Use for status indicators, categories, counts, or filter tags.`,
  },
  {
    id: "shadcn-separator",
    category: "shadcn",
    keywords: ["separator", "divider", "line", "hr", "split"],
    title: "Separator",
    content: `Visual divider between content sections:
import { Separator } from "@/components/ui/separator"
<Separator /> // horizontal by default
<Separator orientation="vertical" className="h-6" /> // vertical
<div className="space-y-1"><h4 className="text-sm font-medium">Section</h4>
<Separator /><p className="text-sm text-muted-foreground">Content below</p></div>
Use between nav items, form sections, or sidebar groups.`,
  },

  // ── nextjs (10) ──────────────────────────────────────────────────────────

  {
    id: "nextjs-app-router-files",
    category: "nextjs",
    keywords: ["app-router", "layout", "page", "loading", "error", "not-found", "route"],
    title: "App Router File Conventions",
    content: `Special files in app/ directory:
page.tsx — route UI (required for the route to be accessible)
layout.tsx — shared wrapper, preserved across navigations
loading.tsx — instant loading UI (React Suspense boundary)
error.tsx — error boundary ("use client" required)
not-found.tsx — 404 UI, triggered by notFound()
route.ts — API route handler (GET, POST, etc.)
template.tsx — like layout but re-mounts on navigation`,
  },
  {
    id: "nextjs-dynamic-routes",
    category: "nextjs",
    keywords: ["dynamic", "params", "slug", "catch-all", "route-params", "url"],
    title: "Dynamic Routes",
    content: `Dynamic segments use bracket syntax in folder names:
app/blog/[slug]/page.tsx — single param: { params: { slug: string } }
app/shop/[...slug]/page.tsx — catch-all: { params: { slug: string[] } }
app/docs/[[...slug]]/page.tsx — optional catch-all
Access params: export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; ... }
Generate static paths with generateStaticParams().`,
  },
  {
    id: "nextjs-server-client-components",
    category: "nextjs",
    keywords: ["server", "client", "use-client", "component", "ssr", "csr", "hydration"],
    title: "Server vs Client Components",
    content: `Server Components (default): run on server, can use async/await, access DB/fs directly.
Client Components: add "use client" at top of file. Required for:
- useState, useEffect, useRef, useContext and other hooks
- Event handlers (onClick, onChange, onSubmit)
- Browser APIs (window, document, localStorage)
- Third-party libs that use React context
Keep server components as parents, pass data down to client children.
Never import server-only code into client components.`,
  },
  {
    id: "nextjs-metadata",
    category: "nextjs",
    keywords: ["metadata", "seo", "title", "description", "og", "opengraph", "head"],
    title: "Metadata & SEO",
    content: `Export metadata from page.tsx or layout.tsx:
export const metadata: Metadata = { title: "Page Title", description: "Page description",
  openGraph: { title: "OG Title", description: "OG Desc", images: ["/og-image.png"] } }
Dynamic metadata: export async function generateMetadata({ params }): Promise<Metadata> {
  const data = await fetch(...); return { title: data.title } }
Use metadata.title with template in root layout: { template: "%s | SiteName", default: "SiteName" }`,
  },
  {
    id: "nextjs-image-optimization",
    category: "nextjs",
    keywords: ["image", "next/image", "optimize", "lazy", "responsive", "blur", "placeholder"],
    title: "Image Optimization",
    content: `Use next/image for automatic optimization:
import Image from "next/image"
<Image src="/hero.jpg" alt="Hero" width={1200} height={600} priority />
Fill mode for flexible sizing: <div className="relative h-64">
<Image src="/bg.jpg" alt="" fill className="object-cover" /></div>
Use priority for above-the-fold images. Use sizes prop for responsive:
sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"`,
  },
  {
    id: "nextjs-link",
    category: "nextjs",
    keywords: ["link", "navigation", "href", "router", "prefetch", "anchor"],
    title: "Link & Navigation",
    content: `Client-side navigation with next/link:
import Link from "next/link"
<Link href="/about">About</Link>
<Link href="/blog/my-post" prefetch={false}>Post</Link>
Programmatic navigation: "use client"; import { useRouter } from "next/navigation"
const router = useRouter(); router.push("/dashboard"); router.replace("/login"); router.back()
Use Link for all internal navigation — it prefetches and enables instant transitions.`,
  },
  {
    id: "nextjs-server-actions",
    category: "nextjs",
    keywords: ["server-action", "action", "form", "mutation", "use-server", "revalidate"],
    title: "Server Actions",
    content: `Mutate data with "use server" functions:
"use server"
export async function createItem(formData: FormData) {
  const name = formData.get("name") as string;
  await db.insert(items).values({ name });
  revalidatePath("/items"); }
Use in forms: <form action={createItem}><input name="name" /><button type="submit">Create</button></form>
Or call from client: const [state, action] = useActionState(createItem, initialState)`,
  },
  {
    id: "nextjs-route-handlers",
    category: "nextjs",
    keywords: ["api", "route-handler", "get", "post", "endpoint", "rest", "json"],
    title: "Route Handlers (API Routes)",
    content: `API endpoints in app/api/**/route.ts:
export async function GET(request: Request) {
  const data = await fetchData(); return Response.json(data); }
export async function POST(request: Request) {
  const body = await request.json();
  return Response.json({ success: true }, { status: 201 }); }
Dynamic params: app/api/users/[id]/route.ts
Access: export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) { ... }`,
  },
  {
    id: "nextjs-loading-error-states",
    category: "nextjs",
    keywords: ["loading", "error", "suspense", "skeleton", "fallback", "boundary"],
    title: "Loading & Error States",
    content: `loading.tsx creates an automatic Suspense boundary:
export default function Loading() { return <div className="space-y-4">
<Skeleton className="h-8 w-48" /><Skeleton className="h-4 w-full" /></div> }
error.tsx creates an error boundary ("use client" required):
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return <div><h2>Something went wrong</h2><Button onClick={reset}>Try again</Button></div> }
Use not-found.tsx + notFound() for custom 404 pages.`,
  },
  {
    id: "nextjs-middleware",
    category: "nextjs",
    keywords: ["middleware", "redirect", "rewrite", "auth", "protect", "guard"],
    title: "Middleware",
    content: `middleware.ts in project root runs before every matched request:
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
export function middleware(request: NextRequest) {
  const token = request.cookies.get("session");
  if (!token) return NextResponse.redirect(new URL("/login", request.url));
  return NextResponse.next(); }
export const config = { matcher: ["/dashboard/:path*", "/api/protected/:path*"] }`,
  },

  // ── tailwind (10) ────────────────────────────────────────────────────────

  {
    id: "tailwind-responsive-design",
    category: "tailwind",
    keywords: ["responsive", "breakpoint", "mobile", "desktop", "sm", "md", "lg", "xl"],
    title: "Responsive Design",
    content: `Mobile-first breakpoints — base is mobile, layer up:
sm: 640px, md: 768px, lg: 1024px, xl: 1280px, 2xl: 1536px
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
<div className="text-sm md:text-base lg:text-lg">
<div className="px-4 sm:px-6 lg:px-8">
<div className="hidden md:block"> (show on desktop only)
<div className="md:hidden"> (show on mobile only)`,
  },
  {
    id: "tailwind-dark-mode",
    category: "tailwind",
    keywords: ["dark", "mode", "theme", "light", "toggle", "dark-mode"],
    title: "Dark Mode",
    content: `Use dark: variant for dark mode styles:
<div className="bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-50">
<div className="border-gray-200 dark:border-gray-800">
With shadcn semantic tokens, dark mode is automatic:
bg-background, text-foreground, bg-card, bg-muted, text-muted-foreground
These tokens switch values based on the theme class on <html>.
Toggle with: document.documentElement.classList.toggle("dark")`,
  },
  {
    id: "tailwind-animations",
    category: "tailwind",
    keywords: ["animation", "animate", "transition", "motion", "fade", "slide", "spin"],
    title: "Animations & Transitions",
    content: `Built-in animations: animate-spin, animate-pulse, animate-bounce, animate-ping
Transitions: <button className="transition-colors duration-200 hover:bg-primary">
<div className="transition-all duration-300 ease-in-out">
Respect user preferences: motion-safe:animate-fadeIn motion-reduce:animate-none
Custom keyframes in tailwind.config: extend: { keyframes: { fadeIn: {
"0%": { opacity: "0" }, "100%": { opacity: "1" } } }, animation: { fadeIn: "fadeIn 0.5s ease-out" } }`,
  },
  {
    id: "tailwind-gradients",
    category: "tailwind",
    keywords: ["gradient", "bg-gradient", "color-stop", "from", "to", "via"],
    title: "Gradients",
    content: `Linear gradients with direction + color stops (Tailwind v4 syntax):
<div className="bg-linear-to-r from-purple-500 to-pink-500">
<div className="bg-linear-to-br from-blue-600 via-purple-600 to-pink-500">
Directions: to-t, to-tr, to-r, to-br, to-b, to-bl, to-l, to-tl
Text gradient: <h1 className="bg-linear-to-r from-primary to-accent bg-clip-text text-transparent">
Use semantic colors: from-primary/80 to-secondary/60`,
  },
  {
    id: "tailwind-grid-layouts",
    category: "tailwind",
    keywords: ["grid", "columns", "rows", "layout", "grid-cols", "gap", "span"],
    title: "Grid Layouts",
    content: `CSS Grid with Tailwind:
<div className="grid grid-cols-3 gap-4"> (equal 3 columns)
<div className="grid grid-cols-12 gap-6"> (12-col system)
<div className="col-span-8"> (spans 8 of 12 columns)
Auto-fit responsive: grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6
Subgrid: grid grid-rows-subgrid row-span-3 (align children across cards)
Template areas: grid-cols-[240px_1fr] grid-rows-[auto_1fr_auto]`,
  },
  {
    id: "tailwind-flexbox",
    category: "tailwind",
    keywords: ["flex", "flexbox", "align", "justify", "center", "between", "wrap"],
    title: "Flexbox",
    content: `Common flex patterns:
Center: <div className="flex items-center justify-center h-screen">
Space between: <div className="flex items-center justify-between">
Stack vertical: <div className="flex flex-col gap-4">
Wrap: <div className="flex flex-wrap gap-2">
Grow/shrink: <div className="flex-1"> (takes remaining space)
<div className="flex-none"> (fixed size, no shrink)
Responsive: flex-col md:flex-row (stack on mobile, row on desktop)`,
  },
  {
    id: "tailwind-typography",
    category: "tailwind",
    keywords: ["typography", "font", "text", "heading", "prose", "size", "weight"],
    title: "Typography",
    content: `Text scale: text-xs(12) text-sm(14) text-base(16) text-lg(18) text-xl(20) text-2xl(24) text-3xl(30) text-4xl(36)
Weights: font-normal(400) font-medium(500) font-semibold(600) font-bold(700)
Line height: leading-tight(1.25) leading-normal(1.5) leading-relaxed(1.625)
Tracking: tracking-tight(-0.025em) tracking-wide(0.025em)
Prose (for rich text): <div className="prose dark:prose-invert max-w-none">
Truncate: truncate (single line) line-clamp-2 (multi-line)`,
  },
  {
    id: "tailwind-container-queries",
    category: "tailwind",
    keywords: ["container", "container-query", "cq", "responsive-component", "@container"],
    title: "Container Queries",
    content: `Size components based on parent, not viewport:
<div className="@container"> (mark as container)
<div className="@md:flex-row @lg:grid-cols-3"> (query container width)
Breakpoints: @sm(320px) @md(448px) @lg(512px) @xl(576px)
Named containers: <div className="@container/sidebar">
<div className="@md/sidebar:block">
Useful for cards, sidebars, and widgets that appear in varying parent sizes.`,
  },
  {
    id: "tailwind-spacing",
    category: "tailwind",
    keywords: ["spacing", "padding", "margin", "gap", "space", "p", "m"],
    title: "Spacing System",
    content: `Spacing scale (1 unit = 0.25rem = 4px):
p-1(4px) p-2(8px) p-3(12px) p-4(16px) p-6(24px) p-8(32px) p-12(48px) p-16(64px)
Consistent section spacing: <section className="py-16 md:py-24 lg:py-32">
Card padding: p-4 sm:p-6
Use gap-* for flex/grid instead of margins: <div className="flex gap-4">
Space between children: <div className="space-y-4"> (vertical) <div className="space-x-2"> (horizontal)`,
  },
  {
    id: "tailwind-hover-focus-states",
    category: "tailwind",
    keywords: ["hover", "focus", "active", "disabled", "state", "interactive", "group"],
    title: "Hover, Focus & Interactive States",
    content: `State variants:
hover:bg-accent hover:text-accent-foreground
focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none
active:scale-95 (press feedback)
disabled:opacity-50 disabled:pointer-events-none
Group hover: <div className="group"> <span className="group-hover:text-primary">
Peer state: <input className="peer" /><p className="peer-invalid:text-destructive">
First/last: first:mt-0 last:mb-0`,
  },

  // ── patterns (8) ─────────────────────────────────────────────────────────

  {
    id: "pattern-landing-page",
    category: "patterns",
    keywords: ["landing", "homepage", "hero", "cta", "features", "testimonials", "saas"],
    title: "Landing Page Pattern",
    content: `Standard landing page structure:
1. Hero: headline + subheading + CTA button + hero image/illustration
2. Social proof: logo bar or "Trusted by X companies"
3. Features: 3-4 cards or icon+text grid
4. How it works: numbered steps or timeline
5. Testimonials: carousel or grid of quote cards
6. Pricing: 2-3 tier cards with feature comparison
7. FAQ: Accordion component
8. CTA: final call-to-action banner
9. Footer: links, social, legal`,
  },
  {
    id: "pattern-dashboard",
    category: "patterns",
    keywords: ["dashboard", "admin", "analytics", "overview", "sidebar", "stats", "kpi"],
    title: "Dashboard Pattern",
    content: `Admin dashboard layout:
- Sidebar (collapsible): nav links grouped by category, user profile at bottom
- Header: breadcrumb, search, notifications, user menu
- Main content: stat cards row (KPIs), then charts/tables
Stat card: <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Revenue</CardTitle></CardHeader>
<CardContent><div className="text-2xl font-bold">$45,231</div><p className="text-xs text-muted-foreground">+20.1% from last month</p></CardContent></Card>
Use shadcn Sidebar component for the sidebar layout.`,
  },
  {
    id: "pattern-auth-pages",
    category: "patterns",
    keywords: ["auth", "login", "register", "signup", "signin", "password", "authentication"],
    title: "Auth Pages Pattern",
    content: `Login/Register page layout:
Centered card (max-w-sm) with logo at top:
- Login: email + password fields, "Forgot password?" link, submit button, OAuth divider, social buttons, "Don't have account?" link
- Register: name + email + password + confirm fields, terms checkbox, submit
- Forgot password: email field + submit
Use Form + zod validation. Show FormMessage for field errors.
Add loading state on submit: <Button disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : "Sign in"}</Button>`,
  },
  {
    id: "pattern-ecommerce",
    category: "patterns",
    keywords: ["ecommerce", "shop", "store", "product", "cart", "checkout", "catalog"],
    title: "E-commerce Pattern",
    content: `Product catalog + detail + cart:
Product grid: responsive grid of cards with image, title, price, rating, add-to-cart button
Product detail: image gallery (carousel), title, price, description, variant selectors (size/color), quantity, add-to-cart
Cart: table/list of items with quantity controls, subtotal, remove button, order summary sidebar
Filtering: sidebar with checkboxes (category, price range, rating) or top bar with Select/Popover filters
Use Badge for "Sale", "New", "Sold out" indicators.`,
  },
  {
    id: "pattern-blog",
    category: "patterns",
    keywords: ["blog", "article", "post", "writing", "content", "markdown", "news"],
    title: "Blog Pattern",
    content: `Blog listing + article pages:
Listing: grid or list of post cards (featured image, title, excerpt, date, author avatar, category badge, read time)
Article: max-w-prose centered layout with:
- Category badge + date + read time
- H1 title
- Author info (avatar + name + bio)
- Featured image
- Prose content (use prose dark:prose-invert for rich text)
- Share buttons
- Related posts carousel at bottom`,
  },
  {
    id: "pattern-portfolio",
    category: "patterns",
    keywords: ["portfolio", "showcase", "gallery", "projects", "work", "creative", "personal"],
    title: "Portfolio Pattern",
    content: `Creative portfolio structure:
- Hero: name, title/role, brief intro, social links
- Projects grid: filterable cards with hover overlay (Dialog for detail view)
- About: split layout — photo on one side, bio + skills on other
- Skills: progress bars or badge grid grouped by category
- Experience: timeline with company, role, dates, description
- Contact: form (name, email, message) + social links + email
Use Tabs for project category filtering. Animate card reveals on scroll.`,
  },
  {
    id: "pattern-pricing",
    category: "patterns",
    keywords: ["pricing", "plan", "tier", "subscription", "billing", "free", "pro", "enterprise"],
    title: "Pricing Page Pattern",
    content: `Pricing comparison layout:
Toggle: monthly/yearly with Switch or Tabs (show discount for yearly)
Cards (2-3 tiers): each with plan name, price, billing period, feature list with Check/X icons
Highlight recommended tier: <Card className="border-primary shadow-lg relative">
<Badge className="absolute -top-3 left-1/2 -translate-x-1/2">Most Popular</Badge>
CTA button per tier: variant="default" for recommended, variant="outline" for others
Optional comparison table below for detailed feature breakdown.`,
  },
  {
    id: "pattern-contact",
    category: "patterns",
    keywords: ["contact", "form", "email", "support", "message", "feedback", "inquiry"],
    title: "Contact Page Pattern",
    content: `Contact form + info layout:
Split layout: form on left, contact info on right (or stacked on mobile)
Form fields: name, email, subject (Select), message (Textarea), submit button
Info section: address, phone, email, business hours, embedded map placeholder
Add toast on submit: toast.success("Message sent! We'll reply within 24 hours.")
Validate with zod: email must be valid, message min 10 chars.
Optional FAQ Accordion below the form for common questions.`,
  },

  // ── lucide (2) ───────────────────────────────────────────────────────────

  {
    id: "lucide-navigation-icons",
    category: "lucide",
    keywords: ["icon", "nav", "menu", "arrow", "chevron", "home", "search", "navigation"],
    title: "Navigation Icons",
    content: `Common navigation icons from lucide-react:
Menu (hamburger), X (close), ChevronDown, ChevronRight, ChevronLeft, ArrowRight, ArrowLeft
Home, Search, Bell (notifications), Settings, User, LogOut, LogIn
ExternalLink, Globe, Mail, Phone, MapPin
Sizing convention: h-4 w-4 (inline/buttons), h-5 w-5 (nav items), h-6 w-6 (feature icons)
import { Menu, X, ChevronDown, Home, Search, Bell, Settings, User } from "lucide-react"`,
  },
  {
    id: "lucide-action-icons",
    category: "lucide",
    keywords: ["icon", "action", "edit", "delete", "save", "add", "check", "copy", "download"],
    title: "Action Icons",
    content: `Common action icons from lucide-react:
Plus, Minus, Trash2, Pencil, Save, Copy, Download, Upload, Share2
Check, CheckCircle, XCircle, AlertTriangle, Info, HelpCircle
Eye, EyeOff, Lock, Unlock, Star, Heart, Bookmark
MoreHorizontal (three dots), MoreVertical, Filter, SlidersHorizontal
Loader2 (spinner — use with animate-spin)
import { Plus, Trash2, Pencil, Check, Loader2, MoreHorizontal } from "lucide-react"`,
  },

  // ── shadcn on-demand groups (7) ──────────────────────────────────────────

  {
    id: "shadcn-forms-group",
    category: "shadcn",
    keywords: ["form", "input", "textarea", "select", "checkbox", "radio", "switch", "label", "formular", "fält", "formulär"],
    title: "shadcn Form Components",
    content: `Form input components — import from @/components/ui/*:
- { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form" (requires react-hook-form + zod)
- { Input } from "@/components/ui/input"
- { Label } from "@/components/ui/label"
- { Textarea } from "@/components/ui/textarea"
- { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
- { Checkbox } from "@/components/ui/checkbox"
- { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
- { Switch } from "@/components/ui/switch"
- { Slider } from "@/components/ui/slider"
- { Calendar } from "@/components/ui/calendar"
- { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@/components/ui/input-otp"`,
  },
  {
    id: "shadcn-layout-group",
    category: "shadcn",
    keywords: ["card", "layout", "container", "separator", "scroll", "panel", "resize", "aspect", "kort", "scroll"],
    title: "shadcn Layout Components",
    content: `Layout and container components — import from @/components/ui/*:
- { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
- { Separator } from "@/components/ui/separator"
- { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
- { AspectRatio } from "@/components/ui/aspect-ratio"
- { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
- { Skeleton } from "@/components/ui/skeleton"`,
  },
  {
    id: "shadcn-navigation-group",
    category: "shadcn",
    keywords: ["nav", "menu", "breadcrumb", "sidebar", "tabs", "navigation", "menubar", "meny", "flik", "flikar", "navigering"],
    title: "shadcn Navigation Components",
    content: `Navigation components — import from @/components/ui/*:
- { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
- { NavigationMenu, NavigationMenuContent, NavigationMenuItem, NavigationMenuLink, NavigationMenuList, NavigationMenuTrigger } from "@/components/ui/navigation-menu"
- { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
- { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
- { Menubar, MenubarContent, MenubarItem, MenubarMenu, MenubarSeparator, MenubarTrigger } from "@/components/ui/menubar"
- { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"`,
  },
  {
    id: "shadcn-overlay-group",
    category: "shadcn",
    keywords: ["dialog", "modal", "sheet", "drawer", "popover", "dropdown", "tooltip", "hover", "alert-dialog", "context-menu"],
    title: "shadcn Overlay Components",
    content: `Overlay and popup components — import from @/components/ui/*:
- { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
- { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
- { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer"
- { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
- { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
- { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
- { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
- { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
- { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu"
Dialogs require DialogTitle + DialogDescription (use sr-only if hidden).`,
  },
  {
    id: "shadcn-data-group",
    category: "shadcn",
    keywords: ["table", "chart", "data", "stats", "graph", "diagram", "analytics", "tabell", "graf", "statistik"],
    title: "shadcn Data Display Components",
    content: `Data display components — import from @/components/ui/*:
- { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
- { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from "@/components/ui/chart"
Charts use Recharts under the hood. Wrap in <ChartContainer config={chartConfig}>. Use <LineChart>, <BarChart>, <PieChart> etc. from "recharts" inside.`,
  },
  {
    id: "shadcn-feedback-group",
    category: "shadcn",
    keywords: ["badge", "alert", "progress", "skeleton", "loading", "toast", "notification", "meddelande", "laddning"],
    title: "shadcn Feedback Components",
    content: `Feedback and status components — import from @/components/ui/*:
- { Badge } from "@/components/ui/badge"
- { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
- { Progress } from "@/components/ui/progress"
- { Skeleton } from "@/components/ui/skeleton"
- { Sonner } from "@/components/ui/sonner" (toast notifications via sonner library)`,
  },
  {
    id: "shadcn-interactive-group",
    category: "shadcn",
    keywords: ["toggle", "slider", "pagination", "carousel", "accordion", "collapsible", "karusell", "reglage"],
    title: "shadcn Interactive Components",
    content: `Interactive components — import from @/components/ui/*:
- { Toggle } from "@/components/ui/toggle"
- { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
- { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination"
- { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel"
- { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
- { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"`,
  },

  // ── library snippets (10) ──────────────────────────────────────────────

  {
    id: "lib-framer-motion",
    category: "library",
    keywords: ["animation", "motion", "framer", "animate", "transition", "spring", "stagger", "animering", "rörelse"],
    title: "Framer Motion",
    content: `framer-motion for React animations:
import { motion, AnimatePresence } from "framer-motion"
<motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
Variants: const variants = { hidden: { opacity: 0 }, visible: { opacity: 1 } }
AnimatePresence wraps conditional elements for exit animations.
useInView from "framer-motion" for scroll-triggered animations.
whileHover, whileTap for gesture animations.
Add "framer-motion" to dependencies if not present.`,
  },
  {
    id: "lib-recharts",
    category: "library",
    keywords: ["chart", "graph", "line-chart", "bar-chart", "pie", "analytics", "recharts", "diagram", "graf"],
    title: "Recharts",
    content: `Recharts for data visualization (used by shadcn/ui chart):
import { LineChart, Line, BarChart, Bar, PieChart, Pie, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts"
Wrap in <ResponsiveContainer width="100%" height={300}>.
Or use shadcn wrapper: <ChartContainer config={chartConfig}> for consistent styling.
Data format: const data = [{ name: "Jan", value: 400 }, ...].
Add "recharts" to dependencies.`,
  },
  {
    id: "lib-tanstack-table",
    category: "library",
    keywords: ["data-table", "sorting", "filtering", "pagination", "tanstack", "react-table", "tabell", "sortering"],
    title: "TanStack React Table",
    content: `@tanstack/react-table for advanced data tables:
import { useReactTable, getCoreRowModel, getPaginationRowModel, getSortedRowModel, getFilteredRowModel, flexRender } from "@tanstack/react-table"
const columns: ColumnDef<T>[] = [{ accessorKey: "name", header: "Name" }]
const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() })
Combine with shadcn Table components for styling.
Add "@tanstack/react-table" to dependencies.`,
  },
  {
    id: "lib-react-three",
    category: "library",
    keywords: ["3d", "three", "canvas", "webgl", "scene", "mesh", "orb", "sphere", "particle"],
    title: "React Three Fiber",
    content: `@react-three/fiber for 3D in React:
import { Canvas, useFrame } from "@react-three/fiber"
import { OrbitControls, Environment } from "@react-three/drei"
<Canvas><mesh><boxGeometry /><meshStandardMaterial color="hotpink" /></mesh></Canvas>
useFrame((state) => { ref.current.rotation.y += 0.01 }) for animation loop.
Must be wrapped in a "use client" component.
Add "@react-three/fiber", "@react-three/drei", "three" to dependencies.`,
  },
  {
    id: "lib-embla-carousel",
    category: "library",
    keywords: ["carousel", "slider", "slideshow", "gallery", "swipe", "karusell", "bildspel"],
    title: "Embla Carousel",
    content: `embla-carousel-react for carousels (used by shadcn Carousel):
shadcn provides Carousel components that wrap embla:
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel"
<Carousel><CarouselContent><CarouselItem>slide</CarouselItem></CarouselContent><CarouselPrevious /><CarouselNext /></Carousel>
For custom: import useEmblaCarousel from "embla-carousel-react"; autoplay via "embla-carousel-autoplay".`,
  },
  {
    id: "lib-date-fns",
    category: "library",
    keywords: ["date", "time", "format", "calendar", "relative", "parse", "datum", "tid"],
    title: "date-fns",
    content: `date-fns for date formatting:
import { format, formatDistance, formatRelative, parseISO, isAfter, isBefore, addDays, subDays } from "date-fns"
import { sv } from "date-fns/locale" // Swedish locale
format(new Date(), "d MMMM yyyy", { locale: sv }) // "10 mars 2026"
formatDistance(date, new Date(), { addSuffix: true }) // "3 days ago"
Add "date-fns" to dependencies.`,
  },
  {
    id: "lib-react-hook-form",
    category: "library",
    keywords: ["form", "validation", "zod", "schema", "submit", "field", "validering", "formulär"],
    title: "React Hook Form + Zod",
    content: `react-hook-form + zod for type-safe forms:
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
const schema = z.object({ email: z.string().email(), name: z.string().min(2) })
const form = useForm({ resolver: zodResolver(schema) })
Combine with shadcn Form components for full UI integration.
Add "react-hook-form", "@hookform/resolvers", "zod" to dependencies.`,
  },
  {
    id: "lib-zustand",
    category: "library",
    keywords: ["state", "store", "global", "zustand", "persist", "state-management", "tillstånd"],
    title: "Zustand State Management",
    content: `zustand for lightweight global state:
import { create } from "zustand"
const useStore = create((set) => ({ count: 0, increment: () => set((s) => ({ count: s.count + 1 })) }))
With persist: import { persist } from "zustand/middleware"
create(persist((set) => ({ ... }), { name: "store-key" }))
Add "zustand" to dependencies.`,
  },
  {
    id: "lib-next-themes",
    category: "library",
    keywords: ["theme", "dark", "light", "mode", "toggle", "switch", "mörkt", "ljust", "tema"],
    title: "next-themes",
    content: `next-themes for dark/light mode:
import { ThemeProvider } from "next-themes"
Wrap app in <ThemeProvider attribute="class" defaultTheme="system">
import { useTheme } from "next-themes"
const { theme, setTheme } = useTheme() // "light" | "dark" | "system"
Add "next-themes" to dependencies. Use suppressHydrationWarning on <html>.`,
  },
  {
    id: "lib-lucide-advanced",
    category: "library",
    keywords: ["icon", "lucide", "dynamic", "custom", "animated", "ikon"],
    title: "Lucide React Advanced",
    content: `Advanced lucide-react patterns:
Dynamic icon: import { icons } from "lucide-react"; const Icon = icons["ArrowRight"];
All icons: import * as LucideIcons from "lucide-react"
Animated: <Loader2 className="animate-spin h-4 w-4" />
Custom size: <Icon size={24} strokeWidth={1.5} />
Always import individually for tree-shaking: import { ArrowRight, Check } from "lucide-react"`,
  },

  // ── Code Examples (pattern packs) ────────────────────────────────────

  {
    id: "example-animated-hero",
    category: "example",
    keywords: ["hero", "animation", "motion", "landing", "fade", "slide", "entrance", "premium", "wow"],
    title: "Animated Hero Section Pattern",
    content: `"use client"
import { motion } from "framer-motion"
<motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: "easeOut" }}>
  <h1 className="text-5xl font-bold tracking-tight">...</h1>
</motion.div>
<motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3, duration: 0.6 }}>...</motion.p>
<motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.5 }}>
  <Button size="lg">Get Started</Button>
</motion.div>
Stagger children: use variants + staggerChildren in parent transition.`,
  },
  {
    id: "example-3d-floating-orb",
    category: "example",
    keywords: ["3d", "three", "orb", "sphere", "floating", "webgl", "canvas", "interactive", "premium"],
    title: "3D Floating Orb Pattern",
    content: `"use client"
import { Canvas, useFrame } from "@react-three/fiber"
import { MeshDistortMaterial, Float } from "@react-three/drei"
import { useRef } from "react"
function FloatingOrb() {
  const ref = useRef<THREE.Mesh>(null!)
  useFrame((state) => { ref.current.rotation.y = state.clock.elapsedTime * 0.3 })
  return <Float speed={2} floatIntensity={1.5}><mesh ref={ref}><sphereGeometry args={[1.5, 64, 64]} /><MeshDistortMaterial color="#8b5cf6" distort={0.4} speed={2} /></mesh></Float>
}
export default function Hero3D() {
  return <div className="h-[500px] w-full"><Canvas camera={{ position: [0, 0, 5] }}><ambientLight intensity={0.5} /><pointLight position={[10, 10, 10]} /><FloatingOrb /><Environment preset="city" /></Canvas></div>
}
Must be "use client". Add @react-three/fiber, @react-three/drei, three to deps.`,
  },
  {
    id: "example-scroll-reveal",
    category: "example",
    keywords: ["scroll", "reveal", "intersection", "observer", "animate", "entrance", "section"],
    title: "Scroll-Triggered Section Reveal",
    content: `"use client"
import { motion, useInView } from "framer-motion"
import { useRef } from "react"
function RevealSection({ children }: { children: React.ReactNode }) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: "-100px" })
  return <motion.div ref={ref} initial={{ opacity: 0, y: 40 }} animate={isInView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.7, ease: "easeOut" }}>{children}</motion.div>
}
Use once: true for one-time animation. Wrap each section for staggered reveals.`,
  },
  {
    id: "example-particle-bg",
    category: "example",
    keywords: ["particle", "background", "ambient", "dots", "floating", "atmosphere", "effect"],
    title: "CSS Particle Background",
    content: `Pure CSS floating particles (no JS needed):
In globals.css:
@keyframes float { 0%,100% { transform: translateY(0) rotate(0deg); opacity: 0; } 50% { opacity: 0.6; } 100% { transform: translateY(-100vh) rotate(720deg); opacity: 0; } }
.particle { position: absolute; width: 6px; height: 6px; background: hsl(var(--primary) / 0.3); border-radius: 50%; animation: float linear infinite; }
Generate 15-20 particles with randomized left%, animation-duration (8-25s), and animation-delay (0-10s).
Wrap in a fixed/absolute container with overflow-hidden and pointer-events-none.`,
  },
  {
    id: "example-gradient-text",
    category: "example",
    keywords: ["gradient", "text", "heading", "colorful", "premium", "glow", "hero"],
    title: "Gradient Text Heading",
    content: `<h1 className="bg-linear-to-r from-primary via-purple-500 to-pink-500 bg-clip-text text-transparent text-5xl font-bold tracking-tight">
  Premium Heading
</h1>
For animated gradient: add bg-[length:200%_auto] animate-gradient-x
@keyframes gradient-x { 0% { background-position: 0% 50% } 50% { background-position: 100% 50% } 100% { background-position: 0% 50% } }
animation: { "gradient-x": "gradient-x 3s ease infinite" }`,
  },
  {
    id: "example-glass-card",
    category: "example",
    keywords: ["glass", "glassmorphism", "blur", "card", "frosted", "premium", "transparent"],
    title: "Glassmorphism Card Pattern",
    content: `<div className="rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl shadow-2xl">
  <h3 className="text-xl font-semibold text-white">Feature</h3>
  <p className="text-white/70">Description</p>
</div>
Works best on dark backgrounds. Layer with subtle gradient backgrounds.
Add hover: hover:bg-white/10 hover:border-white/20 transition-all duration-300`,
  },
];
