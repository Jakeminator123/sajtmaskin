import { describe, expect, it } from "vitest";
import type { CodeFile } from "./parser";
import { buildPreviewHtml } from "./preview";

function file(path: string, content: string, language = "tsx"): CodeFile {
  return { path, content, language };
}

describe("buildPreviewHtml", () => {
  it("selects the requested route page even when app route groups are present", () => {
    const html =
      buildPreviewHtml(
        [
          file("src/app/page.tsx", 'export default function HomePage() { return <div>Home page</div>; }'),
          file(
            "src/app/(marketing)/pricing/page.tsx",
            'export default function PricingPage() { return <section>Pricing page</section>; }',
          ),
        ],
        "/pricing?ref=test",
      ) ?? "";

    expect(html).toContain("Pricing page");
    expect(html).not.toContain("Home page");
    expect(html).toContain("preview-ready");
  });

  it("keeps common runtime-provided ui imports and hooks renderable in preview output", () => {
    const html =
      buildPreviewHtml([
        file(
          "src/app/page.tsx",
          [
            'import ButtonRoot from "@/components/ui/button";',
            'import * as utils from "@/lib/utils";',
            'import { useIsMobile as useMobile } from "@/hooks/use-mobile";',
            "",
            "export default function Page() {",
            "  const mobile = useMobile();",
            '  return <ButtonRoot className={utils.cn("cta", mobile && "mobile")}>Launch</ButtonRoot>;',
            "}",
          ].join("\n"),
        ),
      ]) ?? "";

    expect(html).toContain('var ButtonRoot = __previewGetUiComponent("Button");');
    expect(html).toContain("var utils = new Proxy");
    expect(html).toContain("var useMobile = useIsMobile;");
    expect(html).toContain("Launch");
    expect(html).toContain("preview-ready");
  });

  it("adds a visible stub and warning when a local preview import cannot be resolved", () => {
    const html =
      buildPreviewHtml([
        file(
          "src/app/page.tsx",
          [
            'import MissingCard from "./missing-card";',
            "",
            "export default function Page() {",
            "  return <MissingCard />;",
            "}",
          ].join("\n"),
        ),
      ]) ?? "";

    expect(html).toContain("Missing local import target: ./missing-card");
    expect(html).toContain('"data-stub": "./missing-card"');
    expect(html).toContain("[MissingCard]");
  });

  it("surfaces preview compilation failures as explicit preview errors", () => {
    const html =
      buildPreviewHtml([
        file(
          "src/app/page.tsx",
          "export default function Page() { return <div>Broken</span>; }",
        ),
      ]) ?? "";

    expect(html).toContain("Preview compilation failed for generated code.");
    expect(html).toContain("src/app/page.tsx");
    expect(html).toContain("kind: 'compile'");
    expect(html).toContain("code: 'preview_compile_error'");
    expect(html).toContain("stage: 'preview-script'");
  });

  it("renders common overlay content primitives as visible preview surfaces instead of null shims", () => {
    const html =
      buildPreviewHtml([
        file(
          "src/app/page.tsx",
          [
            'import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";',
            'import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";',
            'import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";',
            "",
            "export default function Page() {",
            "  return (",
            "    <div>",
            "      <Dialog><DialogTrigger>Open</DialogTrigger><DialogContent>Dialog body</DialogContent></Dialog>",
            "      <Popover><PopoverTrigger>More</PopoverTrigger><PopoverContent>Popover body</PopoverContent></Popover>",
            "      <Sheet><SheetTrigger>Menu</SheetTrigger><SheetContent>Sheet body</SheetContent></Sheet>",
            "    </div>",
            "  );",
            "}",
          ].join("\n"),
        ),
      ]) ?? "";

    expect(html).toContain("function __previewSurface(");
    expect(html).toContain("DialogContent: __previewSurface(");
    expect(html).toContain("PopoverContent: __previewSurface(");
    expect(html).toContain("SheetContent: __previewSurface(");
    expect(html).not.toContain("DialogContent: () => null");
    expect(html).not.toContain("PopoverContent: () => null");
    expect(html).not.toContain("SheetContent: () => null");
  });

  it("maps common navigation and menu primitives to dedicated preview components", () => {
    const html =
      buildPreviewHtml([
        file(
          "src/app/page.tsx",
          [
            'import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";',
            'import { Menubar, MenubarContent, MenubarItem, MenubarMenu, MenubarTrigger } from "@/components/ui/menubar";',
            'import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";',
            'import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";',
            'import { Command, CommandDialog, CommandInput, CommandItem, CommandList } from "@/components/ui/command";',
            "",
            "export default function Page() {",
            "  return (",
            "    <div>",
            "      <Breadcrumb><BreadcrumbList><BreadcrumbItem><BreadcrumbLink href=\"/\">Home</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator>/</BreadcrumbSeparator><BreadcrumbItem><BreadcrumbPage>Docs</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb>",
            "      <Menubar><MenubarMenu><MenubarTrigger>File</MenubarTrigger><MenubarContent><MenubarItem>Open</MenubarItem></MenubarContent></MenubarMenu></Menubar>",
            "      <ContextMenu><ContextMenuTrigger>Right click</ContextMenuTrigger><ContextMenuContent><ContextMenuItem>Rename</ContextMenuItem></ContextMenuContent></ContextMenu>",
            "      <Carousel><CarouselContent><CarouselItem>Slide A</CarouselItem><CarouselItem>Slide B</CarouselItem></CarouselContent><CarouselPrevious /><CarouselNext /></Carousel>",
            "      <Command><CommandInput /><CommandList><CommandItem>Search item</CommandItem></CommandList></Command>",
            "      <CommandDialog><CommandInput /><CommandList><CommandItem>Palette item</CommandItem></CommandList></CommandDialog>",
            "    </div>",
            "  );",
            "}",
          ].join("\n"),
        ),
      ]) ?? "";

    expect(html).toContain("BreadcrumbLink: __previewStyled('a'");
    expect(html).toContain("MenubarContent: __previewSurface(");
    expect(html).toContain("ContextMenuContent: __previewSurface(");
    expect(html).toContain("CarouselContent: __previewStyled('div'");
    expect(html).toContain("CommandDialog: __previewSurface(");
    expect(html).toContain("preview-ready");
  });

  it("maps common form primitives to dedicated preview components", () => {
    const html =
      buildPreviewHtml([
        file(
          "src/app/page.tsx",
          [
            'import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";',
            'import { Calendar } from "@/components/ui/calendar";',
            'import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@/components/ui/input-otp";',
            'import { Slider } from "@/components/ui/slider";',
            'import { Input } from "@/components/ui/input";',
            "",
            "export default function Page() {",
            "  return (",
            "    <Form>",
            "      <FormField name=\"email\" render={({ field }) => (",
            "        <FormItem>",
            "          <FormLabel>Email</FormLabel>",
            "          <FormControl><Input {...field} /></FormControl>",
            "          <FormDescription>Work email</FormDescription>",
            "          <FormMessage />",
            "        </FormItem>",
            "      )} />",
            "      <Calendar />",
            "      <Slider value={[40]} />",
            "      <InputOTP><InputOTPGroup><InputOTPSlot index={0} /><InputOTPSeparator>-</InputOTPSeparator><InputOTPSlot index={1} /></InputOTPGroup></InputOTP>",
            "    </Form>",
            "  );",
            "}",
          ].join("\n"),
        ),
      ]) ?? "";

    expect(html).toContain("FormField: function(props)");
    expect(html).toContain("Calendar: function(props)");
    expect(html).toContain("Slider: function(props)");
    expect(html).toContain("InputOTPSlot: __previewStyled('span'");
    expect(html).toContain("preview-ready");
  });

  it("maps common data-display wrappers to dedicated preview components", () => {
    const html =
      buildPreviewHtml([
        file(
          "src/app/page.tsx",
          [
            'import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from "@/components/ui/chart";',
            'import { AspectRatio } from "@/components/ui/aspect-ratio";',
            'import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";',
            'import { BarChart, Bar, XAxis, YAxis } from "recharts";',
            "",
            "const data = [{ month: 'Jan', revenue: 10 }];",
            "",
            "export default function Page() {",
            "  return (",
            "    <div>",
            "      <AspectRatio ratio={16 / 9}><div>Media</div></AspectRatio>",
            "      <ResizablePanelGroup direction=\"horizontal\"><ResizablePanel>Left</ResizablePanel><ResizableHandle /><ResizablePanel>Right</ResizablePanel></ResizablePanelGroup>",
            "      <ChartContainer config={{ revenue: { label: 'Revenue' } }}><BarChart data={data}><XAxis dataKey=\"month\" /><YAxis /><ChartTooltip content={<ChartTooltipContent />} /><Bar dataKey=\"revenue\" /></BarChart><ChartLegend><ChartLegendContent /></ChartLegend></ChartContainer>",
            "    </div>",
            "  );",
            "}",
          ].join("\n"),
        ),
      ]) ?? "";

    expect(html).toContain("AspectRatio: function(props)");
    expect(html).toContain("ChartContainer: __previewSurface(");
    expect(html).toContain("ChartTooltipContent: __previewSurface(");
    expect(html).toContain("ResizablePanelGroup: function(props)");
    expect(html).toContain("ResizablePanel: __previewSurface(");
    expect(html).toContain("preview-ready");
  });

  it("maps sidebar and app-shell primitives to a context-aware preview baseline", () => {
    const html =
      buildPreviewHtml([
        file(
          "src/app/page.tsx",
          [
            'import { SidebarProvider, Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupAction, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem, SidebarRail, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";',
            "",
            "function SidebarStateReadout() {",
            "  const sidebar = useSidebar();",
            "  return <div>{sidebar.state}</div>;",
            "}",
            "",
            "export default function Page() {",
            "  return (",
            "    <SidebarProvider defaultOpen={false}>",
            "      <Sidebar collapsible=\"icon\" variant=\"floating\">",
            "        <SidebarHeader>Brand</SidebarHeader>",
            "        <SidebarContent>",
            "          <SidebarGroup>",
            "            <SidebarGroupLabel>Navigation</SidebarGroupLabel>",
            "            <SidebarGroupAction>+</SidebarGroupAction>",
            "            <SidebarGroupContent>",
            "              <SidebarMenu>",
            "                <SidebarMenuItem><SidebarMenuButton tooltip=\"Dashboard\">Dashboard</SidebarMenuButton><SidebarMenuBadge>3</SidebarMenuBadge></SidebarMenuItem>",
            "                <SidebarMenuSub><SidebarMenuSubItem><SidebarMenuSubButton href=\"/settings\">Settings</SidebarMenuSubButton></SidebarMenuSubItem></SidebarMenuSub>",
            "              </SidebarMenu>",
            "            </SidebarGroupContent>",
            "          </SidebarGroup>",
            "        </SidebarContent>",
            "        <SidebarFooter>Profile</SidebarFooter>",
            "        <SidebarRail />",
            "      </Sidebar>",
            "      <SidebarInset>",
            "        <SidebarTrigger />",
            "        <SidebarStateReadout />",
            "      </SidebarInset>",
            "    </SidebarProvider>",
            "  );",
            "}",
          ].join("\n"),
        ),
      ]) ?? "";

    expect(html).toContain("function SidebarProvider(props)");
    expect(html).toContain("function useSidebar()");
    expect(html).toContain("function __previewSidebarShouldHideCollapsed(sidebar)");
    expect(html).toContain("SidebarProvider: SidebarProvider,");
    expect(html).toContain("SidebarMenuButton: SidebarMenuButton,");
    expect(html).toContain("SidebarGroupLabel: SidebarGroupLabel,");
    expect(html).toContain("SidebarMenuBadge: SidebarMenuBadge,");
    expect(html).toContain("SidebarMenuSub: SidebarMenuSub,");
    expect(html).toContain("SidebarInset: __previewStyled('main'");
    expect(html).toContain("SidebarRail: SidebarRail,");
    expect(html).toContain("resolvedCollapsible === 'offcanvas'");
    expect(html).toContain("preview-ready");
  });
});
