"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Box,
  Code2,
  Coins,
  Command as CommandIcon,
  Eye,
  FolderOpen,
  LogOut,
  Maximize2,
  Monitor,
  MousePointerClick,
  PanelLeft,
  Rocket,
  Settings,
  Smartphone,
  Tablet,
  User,
  Video,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Studio } from "../_lib/use-studio";
import { LabLogo } from "./lab-logo";
import { IconButton, Kbd, Segmented } from "./ui-bits";

export type LayoutMode = "panel" | "cube" | "focus";

/**
 * Toppraden har tre zoner och inget mer: projekt och status till vänster,
 * hur du tittar på sajten i mitten, och det du gör med den till höger.
 * Allt annat (export, import, inställningar) bor i ⌘K eller kontomenyn.
 */
export function TopBar({
  studio,
  isDesktop,
  layoutMode,
  onLayoutModeChange,
  callOpen,
  onToggleCall,
  onOpenPalette,
  onPublish,
  onExit,
}: {
  studio: Studio;
  isDesktop: boolean;
  layoutMode: LayoutMode;
  onLayoutModeChange: (mode: LayoutMode) => void;
  callOpen: boolean;
  onToggleCall: () => void;
  onOpenPalette: () => void;
  onPublish: () => void;
  onExit: () => void;
}) {
  const { state, set, activeVersion, progress, engine } = studio;
  const [editingName, setEditingName] = useState(false);
  const canPublish = Boolean(activeVersion) && !state.pending;

  return (
    <motion.header
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="relative z-20 flex h-14 shrink-0 items-center gap-2 px-3 sm:px-4"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <button
          type="button"
          onClick={onExit}
          title="Till start (labbet nollställs)"
          className="shrink-0 rounded-lg focus-visible:outline-2 focus-visible:outline-[var(--lab-blue)]"
        >
          <LabLogo
            building={Boolean(state.pending)}
            launches={state.versions.length}
            wordmarkFrom="2xl"
          />
        </button>
        {isDesktop ? (
          <Segmented
            id="layout"
            ariaLabel="Arbetsyta"
            iconOnly
            size="sm"
            value={layoutMode}
            onChange={onLayoutModeChange}
            options={[
              { value: "panel", label: "Panel", icon: PanelLeft, hint: "Chatten som panel" },
              { value: "cube", label: "Kub", icon: Box, hint: "Byggkuben över förhandsvisningen" },
              { value: "focus", label: "Fokus", icon: Maximize2, hint: "Bara sajten" },
            ]}
          />
        ) : null}
        <span className="mx-1 hidden h-5 w-px bg-white/10 sm:block" />
        {editingName ? (
          <input
            autoFocus
            aria-label="Projektnamn"
            defaultValue={state.projectName}
            onBlur={(event) => {
              set({ projectName: event.target.value.trim() || state.projectName });
              setEditingName(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === "Escape") event.currentTarget.blur();
            }}
            className="h-8 w-40 rounded-lg border border-white/15 bg-white/[0.05] px-2 text-sm font-medium outline-none sm:w-56"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingName(true)}
            title="Byt namn"
            className="min-w-0 truncate rounded-lg px-2 py-1 text-sm font-medium transition-colors hover:bg-white/[0.06]"
          >
            {state.projectName}
          </button>
        )}
        {/* Statusen läser bara motorkontraktet (`engine.ts`), så den fungerar
            oförändrad när den riktiga buildern kopplas in. */}
        <StatusPill
          building={Boolean(engine.build)}
          progress={progress}
          queued={engine.queued}
          versionNumber={engine.build?.versionNumber ?? activeVersion?.number ?? null}
          onCancel={engine.cancel}
        />
      </div>

      {isDesktop ? (
        <div className="flex items-center gap-2">
          <Segmented
            id="device"
            ariaLabel="Enhet"
            iconOnly
            value={state.device}
            onChange={(device) => set({ device })}
            options={[
              { value: "desktop", label: "Dator", icon: Monitor, hint: "Dator (1)" },
              { value: "tablet", label: "Surfplatta", icon: Tablet, hint: "Surfplatta (2)" },
              { value: "mobile", label: "Mobil", icon: Smartphone, hint: "Mobil (3)" },
            ]}
          />
          <Segmented
            id="view"
            ariaLabel="Vy"
            value={state.view}
            onChange={(view) => set({ view, inspect: false, compare: false })}
            options={[
              { value: "preview", label: "Sajten", icon: Eye },
              { value: "code", label: "Kod", icon: Code2, hint: "Kod (C)" },
            ]}
          />
          <button
            type="button"
            disabled={!activeVersion || Boolean(state.pending) || state.view !== "preview"}
            onClick={() => set({ inspect: !state.inspect, selectedSection: null, compare: false })}
            aria-pressed={state.inspect}
            title="Peka & ändra (E)"
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-full border px-3 text-[12.5px] font-medium transition-all disabled:opacity-40",
              state.inspect
                ? "border-[var(--lab-teal)]/60 bg-[var(--lab-teal)]/15 text-white shadow-[0_0_24px_-6px_rgba(47,198,160,0.7)]"
                : "border-white/[0.08] bg-white/[0.03] text-[var(--lab-muted)] hover:text-white",
            )}
          >
            <MousePointerClick className="size-3.5" />
            Peka & ändra
            <Kbd className="h-4 min-w-4 px-1">E</Kbd>
          </button>
        </div>
      ) : null}

      <div className="flex flex-1 items-center justify-end gap-1.5">
        {isDesktop ? (
          <button
            type="button"
            onClick={onOpenPalette}
            className="mr-1 hidden items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] py-1 pr-1 pl-3 text-xs text-[var(--lab-muted)] transition-colors hover:text-white xl:flex"
          >
            Sök eller kör…
            <Kbd>⌘K</Kbd>
          </button>
        ) : null}
        {isDesktop ? null : (
          <IconButton icon={CommandIcon} label="Kommandon" onClick={onOpenPalette} />
        )}
        <button
          type="button"
          onClick={onToggleCall}
          aria-pressed={callOpen}
          title={callOpen ? "Avsluta samtalet med Sajtagenten" : "Prata med Sajtagenten"}
          className={cn(
            "relative inline-flex h-9 items-center gap-2 rounded-full px-2.5 text-[12.5px] font-medium transition-all sm:px-3",
            callOpen
              ? "bg-[var(--lab-teal)]/15 text-[#9eeed6] shadow-[inset_0_0_0_1px_rgba(47,198,160,0.5)]"
              : "text-[var(--lab-muted)] hover:bg-white/[0.07] hover:text-white",
          )}
        >
          <Video className="size-4" />
          <span className="hidden lg:inline">{callOpen ? "I samtal" : "Prata"}</span>
          {callOpen ? (
            <span className="absolute top-1.5 right-1.5 size-1.5 animate-pulse rounded-full bg-[#ff5f57]" />
          ) : null}
        </button>
        <button
          type="button"
          onClick={onPublish}
          disabled={!canPublish}
          title={canPublish ? "Publicera (P)" : "Bygg en första version innan du publicerar"}
          className="relative inline-flex h-9 items-center gap-2 overflow-hidden rounded-full bg-white px-3.5 text-[13px] font-semibold text-[#0b0f18] shadow-[0_6px_30px_-8px_rgba(255,255,255,0.6)] transition-all hover:shadow-[0_6px_36px_-6px_rgba(255,255,255,0.8)] disabled:bg-white/10 disabled:text-white/40 disabled:shadow-none"
        >
          <Rocket className="size-3.5" />
          <span className="hidden sm:inline">Publicera</span>
        </button>
        <AccountMenu />
      </div>
    </motion.header>
  );
}

function AccountMenu() {
  const labOnly = (label: string) => () => toast(`${label}: inte kopplat i labbet.`);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Konto"
          className="ml-0.5 flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-[#2a3550] to-[#141a28] text-white/80 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)] transition-transform hover:scale-105"
        >
          <User className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="lab-root w-60 rounded-2xl border-white/10 bg-[#0e121b]/95 p-1.5 text-white backdrop-blur-xl"
      >
        <div className="px-2.5 pt-2 pb-2.5">
          <p className="flex items-center justify-between text-[12px] text-[var(--lab-muted)]">
            <span className="flex items-center gap-1.5">
              <Coins className="size-3.5" /> Krediter
            </span>
            <span className="font-mono text-white">12 / 20</span>
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
            <div className="h-full w-3/5 rounded-full bg-gradient-to-r from-[var(--lab-blue)] to-[var(--lab-teal)]" />
          </div>
        </div>
        <DropdownMenuSeparator className="bg-white/[0.08]" />
        <DropdownMenuItem
          className="rounded-xl focus:bg-white/[0.08] focus:text-white"
          onSelect={labOnly("Mina projekt")}
        >
          <FolderOpen /> Mina projekt
        </DropdownMenuItem>
        <DropdownMenuItem
          className="rounded-xl focus:bg-white/[0.08] focus:text-white"
          onSelect={labOnly("Köp krediter")}
        >
          <Coins /> Köp krediter
        </DropdownMenuItem>
        <DropdownMenuItem
          className="rounded-xl focus:bg-white/[0.08] focus:text-white"
          onSelect={labOnly("Inställningar")}
        >
          <Settings /> Inställningar
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-white/[0.08]" />
        <DropdownMenuItem
          className="rounded-xl focus:bg-white/[0.08] focus:text-white"
          onSelect={labOnly("Logga ut")}
        >
          <LogOut /> Logga ut
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StatusPill({
  building,
  progress,
  queued,
  versionNumber,
  onCancel,
}: {
  building: boolean;
  progress: number;
  queued: number;
  versionNumber: number | null;
  onCancel: () => void;
}) {
  const state = building ? "building" : versionNumber ? "ready" : "draft";
  return (
    <motion.span
      layout
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      className={cn(
        "relative hidden shrink-0 items-center overflow-hidden rounded-full border text-[11.5px] font-medium sm:inline-flex",
        state === "building" &&
          "border-[var(--lab-blue)]/40 bg-[var(--lab-blue)]/10 text-[#c7d6ff]",
        state === "ready" && "border-[var(--lab-teal)]/30 bg-[var(--lab-teal)]/10 text-[#b7f0de]",
        state === "draft" && "border-white/10 bg-white/[0.04] text-[var(--lab-muted)]",
      )}
    >
      {building ? (
        <motion.span
          className="absolute inset-y-0 left-0 bg-[var(--lab-blue)]/20"
          initial={false}
          animate={{ width: `${Math.max(6, progress)}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      ) : null}
      <span className="relative flex items-center gap-2 py-1 pr-2.5 pl-2.5">
        <span className="relative flex size-1.5">
          {building ? (
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--lab-blue)] opacity-75" />
          ) : null}
          <span
            className={cn(
              "relative inline-flex size-1.5 rounded-full",
              building
                ? "bg-[var(--lab-blue)]"
                : versionNumber
                  ? "bg-[var(--lab-teal)]"
                  : "bg-white/40",
            )}
          />
        </span>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={state}
            initial={{ opacity: 0, y: 8, filter: "blur(3px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -8, filter: "blur(3px)" }}
            transition={{ duration: 0.25 }}
            className="tabular-nums"
          >
            {building
              ? `Bygger v${versionNumber} · ${progress}%${queued ? ` · ${queued} i kö` : ""}`
              : versionNumber
                ? `v${versionNumber} · klar`
                : "Utkast"}
          </motion.span>
        </AnimatePresence>
      </span>
      {building ? (
        <button
          type="button"
          onClick={onCancel}
          title="Avbryt bygget"
          aria-label="Avbryt bygget"
          className="relative mr-1 flex size-5 items-center justify-center rounded-full text-[#c7d6ff] transition-colors hover:bg-white/15 hover:text-white"
        >
          <X className="size-3" />
        </button>
      ) : null}
    </motion.span>
  );
}
