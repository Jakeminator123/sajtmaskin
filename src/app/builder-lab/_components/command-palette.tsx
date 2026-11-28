"use client";

import {
  Box,
  CircleStop,
  Code2,
  Columns2,
  Link2,
  Maximize2,
  PanelLeft,
  Video,
  Download,
  Eye,
  Github,
  Monitor,
  MousePointerClick,
  Palette,
  PlusCircle,
  Rocket,
  Smartphone,
  Tablet,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { SITE_THEMES, THEME_PROMPTS, type ThemeKey } from "../_lib/mock-data";
import type { Studio } from "../_lib/use-studio";
import type { LayoutMode } from "./top-bar";
import { ThemeDots } from "./ui-bits";

const ITEM =
  "rounded-xl data-[selected=true]:bg-white/[0.08] data-[selected=true]:text-white [&_svg]:text-[var(--lab-muted)]";

export function CommandPalette({
  studio,
  open,
  onOpenChange,
  onPublish,
  onExit,
  layoutMode,
  onLayoutModeChange,
  callOpen,
  onToggleCall,
  isDesktop,
}: {
  studio: Studio;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPublish: () => void;
  onExit: () => void;
  layoutMode: LayoutMode;
  onLayoutModeChange: (mode: LayoutMode) => void;
  callOpen: boolean;
  onToggleCall: () => void;
  isDesktop: boolean;
}) {
  const { state, set, activeVersion, previousVersion, submit, cancel } = studio;
  const hasSite = Boolean(activeVersion) && !state.pending;

  const run = (action: () => void) => {
    onOpenChange(false);
    action();
  };
  const notWired = (label: string) => () => toast(`${label}: inte kopplat i labbet.`);

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Kommandon"
      description="Sök efter en åtgärd"
      className="border-white/10 bg-[#0e121b]/95 text-white backdrop-blur-xl sm:max-w-xl"
    >
      <CommandInput placeholder="Vad vill du göra?" />
      <CommandList className="lab-scrollbar max-h-[60vh]">
        <CommandEmpty>Inget hittades.</CommandEmpty>
        <CommandGroup heading="Bygg">
          <CommandItem
            className={ITEM}
            disabled={!hasSite}
            onSelect={() => run(() => set({ inspect: true, view: "preview", compare: false }))}
          >
            <MousePointerClick /> Peka & ändra
            <CommandShortcut>E</CommandShortcut>
          </CommandItem>
          <CommandItem
            className={ITEM}
            disabled={!hasSite || !previousVersion}
            onSelect={() => run(() => set({ compare: true, inspect: false, view: "preview" }))}
          >
            <Columns2 /> Jämför med förra versionen
          </CommandItem>
          {state.pending ? (
            <CommandItem className={ITEM} onSelect={() => run(cancel)}>
              <CircleStop /> Avbryt bygget
            </CommandItem>
          ) : null}
          <CommandItem className={ITEM} onSelect={() => run(onToggleCall)}>
            <Video /> {callOpen ? "Avsluta samtalet" : "Prata med Sajtagenten"}
            <CommandShortcut>V</CommandShortcut>
          </CommandItem>
          <CommandItem className={ITEM} onSelect={() => run(onExit)}>
            <PlusCircle /> Nytt projekt
          </CommandItem>
        </CommandGroup>
        {isDesktop ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Arbetsyta">
              <CommandItem
                className={ITEM}
                disabled={layoutMode === "panel"}
                onSelect={() => run(() => onLayoutModeChange("panel"))}
              >
                <PanelLeft /> Chatten som panel
              </CommandItem>
              <CommandItem
                className={ITEM}
                disabled={layoutMode === "cube"}
                onSelect={() => run(() => onLayoutModeChange("cube"))}
              >
                <Box /> Byggkub
                <CommandShortcut>B</CommandShortcut>
              </CommandItem>
              <CommandItem
                className={ITEM}
                disabled={layoutMode === "focus"}
                onSelect={() => run(() => onLayoutModeChange("focus"))}
              >
                <Maximize2 /> Fokusläge
                <CommandShortcut>F</CommandShortcut>
              </CommandItem>
            </CommandGroup>
          </>
        ) : null}
        <CommandSeparator />
        <CommandGroup heading="Visa">
          <CommandItem className={ITEM} onSelect={() => run(() => set({ device: "desktop" }))}>
            <Monitor /> Dator
            <CommandShortcut>1</CommandShortcut>
          </CommandItem>
          <CommandItem className={ITEM} onSelect={() => run(() => set({ device: "tablet" }))}>
            <Tablet /> Surfplatta
            <CommandShortcut>2</CommandShortcut>
          </CommandItem>
          <CommandItem className={ITEM} onSelect={() => run(() => set({ device: "mobile" }))}>
            <Smartphone /> Mobil
            <CommandShortcut>3</CommandShortcut>
          </CommandItem>
          <CommandItem
            className={ITEM}
            disabled={!activeVersion}
            onSelect={() =>
              run(() => set({ view: state.view === "code" ? "preview" : "code", inspect: false }))
            }
          >
            {state.view === "code" ? <Eye /> : <Code2 />}
            {state.view === "code" ? "Visa sajten" : "Visa koden"}
            <CommandShortcut>C</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Design">
          {(Object.keys(SITE_THEMES) as ThemeKey[]).map((key) => (
            <CommandItem
              className={ITEM}
              key={key}
              disabled={!hasSite || activeVersion?.theme === key}
              value={`palett ${SITE_THEMES[key].label}`}
              onSelect={() => run(() => submit(THEME_PROMPTS[key]))}
            >
              <Palette />
              <span className="flex-1">Palett: {SITE_THEMES[key].label}</span>
              <ThemeDots theme={key} />
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Projekt">
          <CommandItem className={ITEM} disabled={!hasSite} onSelect={() => run(onPublish)}>
            <Rocket /> Publicera
            <CommandShortcut>P</CommandShortcut>
          </CommandItem>
          <CommandItem
            className={ITEM}
            disabled={!activeVersion}
            onSelect={() => run(() => toast.success("Förhandsvisningslänk kopierad (labb)"))}
          >
            <Link2 /> Dela förhandsvisningslänk
          </CommandItem>
          <CommandItem
            className={ITEM}
            disabled={!hasSite}
            onSelect={() => run(notWired("Ladda ner ZIP"))}
          >
            <Download /> Ladda ner som ZIP
          </CommandItem>
          <CommandItem
            className={ITEM}
            disabled={!hasSite}
            onSelect={() => run(notWired("GitHub-export"))}
          >
            <Github /> Exportera till GitHub
          </CommandItem>
          <CommandItem className={ITEM} onSelect={() => run(notWired("Import"))}>
            <Upload /> Importera från GitHub eller ZIP
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
