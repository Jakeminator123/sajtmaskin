"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ExternalLink, Lock, Loader2, RotateCw, Wand2, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  SECTION_LABELS,
  SECTION_SUGGESTIONS,
  SITE_THEMES,
  type SectionId,
  type SiteVersion,
} from "../_lib/mock-data";
import type { Studio } from "../_lib/use-studio";
import { CodeView } from "./code-view";
import { SiteMock } from "./site-mock";
import { VersionTimeline } from "./version-timeline";

type Box = { top: number; height: number };

const DEVICE_WIDTH = { desktop: "100%", tablet: 820, mobile: 390 } as const;

export function siteSlug(brand: string) {
  return brand
    .toLowerCase()
    .replace(/å|ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "");
}

export function Canvas({
  studio,
  isDesktop,
  focusRequest,
}: {
  studio: Studio;
  isDesktop: boolean;
  focusRequest: { id: SectionId; n: number } | null;
}) {
  const { state, activeVersion, previousVersion, set } = studio;
  const pending = state.pending;
  const displayVersion: SiteVersion | null = pending?.first ? pending.version : activeVersion;
  const device = isDesktop ? state.device : "desktop";
  const isPhoneFrame = isDesktop && device === "mobile";

  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ id: SectionId; box: Box } | null>(null);
  const [selectedBox, setSelectedBox] = useState<Box | null>(null);

  const measure = useCallback((id: SectionId): Box | null => {
    const root = contentRef.current;
    const el = root?.querySelector<HTMLElement>(`[data-sid="${id}"]`);
    if (!root || !el) return null;
    const rootRect = root.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    return { top: rect.top - rootRect.top, height: rect.height };
  }, []);

  // Den valda sektionens ram följer layouten (enhetsbyte, ny version, resize).
  useLayoutEffect(() => {
    const root = contentRef.current;
    if (!root || !state.selectedSection) return;
    const id = state.selectedSection;
    const update = () => setSelectedBox(measure(id));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    return () => observer.disconnect();
  }, [state.selectedSection, measure, activeVersion?.id, device]);

  // Ny version: rulla till första ändrade sektionen.
  const lastVersionId = useRef<string | null>(null);
  useEffect(() => {
    if (!activeVersion || activeVersion.id === lastVersionId.current) return;
    const firstBuild = lastVersionId.current === null;
    lastVersionId.current = activeVersion.id;
    if (firstBuild) return;
    const first = activeVersion.changed[0];
    const el = contentRef.current?.querySelector<HTMLElement>(`[data-sid="${first}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [activeVersion]);

  // Begäran från chatten: visa en sektion och blinka den.
  useEffect(() => {
    if (!focusRequest) return;
    const el = contentRef.current?.querySelector<HTMLElement>(`[data-sid="${focusRequest.id}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.animate(
      [
        { boxShadow: "inset 0 0 0 2px rgba(61,123,255,0)" },
        { boxShadow: "inset 0 0 0 2px rgba(61,123,255,1), 0 0 40px rgba(61,123,255,0.4)" },
        { boxShadow: "inset 0 0 0 2px rgba(61,123,255,0)" },
      ],
      { duration: 1600, easing: "ease-out" },
    );
  }, [focusRequest]);

  const onPointerMove = (event: React.PointerEvent) => {
    if (!state.inspect) return;
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-sid]");
    const id = (target?.dataset.sid ?? null) as SectionId | null;
    if (!id) return setHover(null);
    if (hover?.id === id) return;
    const box = measure(id);
    if (box) setHover({ id, box });
  };

  const brand = displayVersion?.content.brand ?? state.projectName;
  const url = `${siteSlug(brand) || "min-sajt"}.sajtmaskin.se`;

  return (
    <motion.section
      aria-label="Förhandsvisning"
      initial={{ opacity: 0, y: 18, scale: 0.985, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      transition={{ duration: 0.7, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
      className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[1.4rem] border border-white/[0.07] bg-[#0a0d14]/70"
    >
      {/* Webbläsarram */}
      <div className="flex h-11 shrink-0 items-center gap-3 border-b border-white/[0.06] px-3">
        <span className="hidden gap-1.5 sm:flex" aria-hidden>
          <span className="size-2.5 rounded-full bg-[#ff5f57]/80" />
          <span className="size-2.5 rounded-full bg-[#febc2e]/80" />
          <span className="size-2.5 rounded-full bg-[#28c840]/80" />
        </span>
        <div className="mx-auto flex h-7 w-full max-w-md items-center gap-2 rounded-full bg-white/[0.05] px-3 text-[12px] text-[var(--lab-muted)]">
          <Lock className="size-3 shrink-0 text-[var(--lab-teal)]" />
          <span className="truncate">{url}</span>
          {pending ? <Loader2 className="ml-auto size-3 shrink-0 animate-spin" /> : null}
        </div>
        <div className="flex items-center gap-0.5 text-[var(--lab-muted)]">
          <button
            type="button"
            aria-label="Ladda om"
            title="Ladda om"
            onClick={() => toast("Förhandsvisningen är redan aktuell.")}
            className="flex size-7 items-center justify-center rounded-full hover:bg-white/[0.07] hover:text-white"
          >
            <RotateCw className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="Öppna i ny flik"
            title="Öppna i ny flik"
            onClick={() => toast("Labbet: förhandsvisningen finns bara här.")}
            className="flex size-7 items-center justify-center rounded-full hover:bg-white/[0.07] hover:text-white"
          >
            <ExternalLink className="size-3.5" />
          </button>
        </div>
      </div>

      <div
        className={cn(
          "relative flex min-h-0 flex-1 justify-center",
          isPhoneFrame || device === "tablet" ? "p-5" : "",
        )}
      >
        <motion.div
          initial={false}
          animate={{ width: DEVICE_WIDTH[device] }}
          transition={{ type: "spring", stiffness: 210, damping: 30 }}
          className={cn(
            "relative flex min-h-0 max-w-full flex-col overflow-hidden",
            isPhoneFrame &&
              "rounded-[2.6rem] border-[10px] border-[#1a1f2b] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9),0_0_0_1px_rgba(255,255,255,0.08)]",
            device === "tablet" &&
              "rounded-[1.6rem] border-[8px] border-[#1a1f2b] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9),0_0_0_1px_rgba(255,255,255,0.08)]",
          )}
        >
          {isPhoneFrame ? (
            <span
              className="absolute top-2 left-1/2 z-20 h-6 w-24 -translate-x-1/2 rounded-full bg-black"
              aria-hidden
            />
          ) : null}
          {state.view === "code" && activeVersion ? (
            <CodeView version={activeVersion} />
          ) : displayVersion ? (
            <div
              ref={scrollRef}
              className={cn(
                "lab-scrollbar relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto",
                state.inspect && "cursor-crosshair",
              )}
              onPointerMove={onPointerMove}
              onPointerLeave={() => setHover(null)}
              onClick={(event) => {
                if (!state.inspect) return;
                const target = (event.target as HTMLElement).closest<HTMLElement>("[data-sid]");
                const id = (target?.dataset.sid ?? null) as SectionId | null;
                if (id) set({ selectedSection: id });
              }}
              // Tangentbord: Tab mellan sektionerna, Enter eller mellanslag väljer.
              onFocus={(event) => {
                if (!state.inspect) return;
                const id = ((event.target as HTMLElement).dataset.sid ?? null) as SectionId | null;
                const box = id ? measure(id) : null;
                if (id && box) setHover({ id, box });
              }}
              onKeyDown={(event) => {
                if (!state.inspect || (event.key !== "Enter" && event.key !== " ")) return;
                const id = ((event.target as HTMLElement).dataset.sid ?? null) as SectionId | null;
                if (!id) return;
                event.preventDefault();
                set({ selectedSection: id });
              }}
            >
              <div
                ref={contentRef}
                className={cn(
                  "@container relative transition-colors duration-700",
                  isPhoneFrame && "pt-7",
                  state.selectedSection && "pb-40",
                )}
                style={{ backgroundColor: SITE_THEMES[displayVersion.theme].bg }}
              >
                {state.compare && previousVersion && activeVersion ? (
                  <CompareLayers before={previousVersion} after={activeVersion} />
                ) : (
                  <SiteMock
                    version={displayVersion}
                    revealed={pending?.first ? state.revealed : undefined}
                    selectable={state.inspect}
                    highlight={
                      activeVersion && state.freshVersionId === activeVersion.id
                        ? activeVersion.changed
                        : []
                    }
                    editing={pending && !pending.first ? pending.version.changed : []}
                  />
                )}

                {/* Peka & ändra: hovringsram och vald ram */}
                <AnimatePresence>
                  {state.inspect && hover && hover.id !== state.selectedSection ? (
                    // En och samma ram som glider mellan sektionerna.
                    <motion.div
                      key="hover-frame"
                      initial={{ opacity: 0, top: hover.box.top, height: hover.box.height }}
                      animate={{ opacity: 1, top: hover.box.top, height: hover.box.height }}
                      exit={{ opacity: 0 }}
                      transition={{
                        type: "spring",
                        stiffness: 520,
                        damping: 42,
                        opacity: { duration: 0.15 },
                      }}
                      className="pointer-events-none absolute inset-x-1 z-20 rounded-xl border-2 border-dashed border-[var(--lab-teal)]/80 bg-[var(--lab-teal)]/[0.06]"
                    >
                      <motion.span
                        key={hover.id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="absolute -top-px left-3 -translate-y-full rounded-t-md bg-[var(--lab-teal)] px-2 py-0.5 text-[10.5px] font-semibold text-[#06231b]"
                      >
                        {SECTION_LABELS[hover.id]}
                      </motion.span>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
                {state.selectedSection && selectedBox ? (
                  <SectionEditor
                    key={state.selectedSection}
                    id={state.selectedSection}
                    box={selectedBox}
                    onClose={() => set({ selectedSection: null })}
                    onSubmit={(text) => studio.submit(text, state.selectedSection)}
                  />
                ) : null}
              </div>
            </div>
          ) : (
            <EmptyCanvas />
          )}

          {/* Ljussvep när en ny version visas (nycklad på versionen). */}
          {activeVersion && !pending && state.view === "preview" ? (
            <div
              key={`sweep-${activeVersion.id}`}
              className="lab-version-sweep pointer-events-none absolute inset-0 z-20"
              aria-hidden
            />
          ) : null}

          {pending?.first ? (
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="lab-scan" />
            </div>
          ) : null}
        </motion.div>

        {state.compare && previousVersion && activeVersion ? (
          <CompareSlider
            beforeLabel={`v${previousVersion.number}`}
            afterLabel={`v${activeVersion.number}`}
          />
        ) : null}

        <AnimatePresence>
          {pending && !pending.first ? (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.96 }}
              className="absolute top-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-[var(--lab-blue)]/40 bg-[#0b0f18]/90 px-3.5 py-1.5 text-[12px] font-medium shadow-[0_10px_40px_-10px_rgba(61,123,255,0.8)] backdrop-blur-xl"
            >
              <Loader2 className="size-3.5 animate-spin text-[#9db8ff]" />
              <span className="lab-shimmer-text">
                Bygger v{pending.version.number} · {pending.steps[pending.stepIndex]?.label}
              </span>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {state.inspect && !state.selectedSection ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="pointer-events-none absolute top-4 left-1/2 z-30 -translate-x-1/2 rounded-full bg-[var(--lab-teal)] px-3.5 py-1.5 text-[12px] font-semibold text-[#06231b] shadow-[0_10px_40px_-10px_rgba(47,198,160,0.9)]"
          >
            Klicka på det du vill ändra · Esc avslutar
          </motion.div>
        ) : null}

        {/* Versionsraden viker undan medan man pekar och ändrar. */}
        <AnimatePresence>
          {state.inspect ? null : (
            <VersionTimeline
              key="timeline"
              studio={studio}
              className={cn(
                "absolute left-1/2 z-30 -translate-x-1/2",
                isDesktop ? "bottom-4" : "bottom-3",
              )}
            />
          )}
        </AnimatePresence>
      </div>
    </motion.section>
  );
}

function EmptyCanvas() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <motion.span
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="flex size-14 items-center justify-center rounded-2xl bg-white/[0.05] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
      >
        <Wand2 className="size-6 text-[#9db8ff]" />
      </motion.span>
      <p className="text-[15px] font-medium">Inget byggt än</p>
      <p className="max-w-xs text-[13px] text-[var(--lab-muted)]">
        Beskriv sajten i chatten så ritas den här, sektion för sektion.
      </p>
    </div>
  );
}

function SectionEditor({
  id,
  box,
  onClose,
  onSubmit,
}: {
  id: SectionId;
  box: Box;
  onClose: () => void;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const editorRef = useRef<HTMLDivElement>(null);
  const send = (value: string) => {
    if (!value.trim()) return;
    onSubmit(value);
  };
  // Redigeraren hamnar under sektionen; se till att den syns hela, med plats
  // kvar ovanför versionsraden.
  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
    );
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <>
      <div
        className="pointer-events-none absolute inset-x-1 z-20 rounded-xl border-2 border-[var(--lab-teal)] shadow-[0_0_0_4px_rgba(47,198,160,0.15),0_0_50px_-10px_rgba(47,198,160,0.6)]"
        style={{ top: box.top, height: box.height }}
      />
      <motion.div
        ref={editorRef}
        initial={{ opacity: 0, y: 8, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 32 }}
        onClick={(event) => event.stopPropagation()}
        className="lab-root absolute left-1/2 z-30 w-[min(460px,calc(100%-24px))] -translate-x-1/2 cursor-default scroll-mb-24 rounded-2xl border border-white/10 bg-[#0b0f18]/95 p-3 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl"
        style={{ top: box.top + box.height + 10 }}
      >
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#9eeed6]">
            <Wand2 className="size-3.5" /> Ändra {SECTION_LABELS[id].toLowerCase()}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Stäng"
            className="flex size-6 items-center justify-center rounded-full text-[var(--lab-muted)] hover:bg-white/[0.07] hover:text-white"
          >
            <X className="size-3.5" />
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-1 pl-3 focus-within:border-[var(--lab-teal)]/60">
          <input
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") send(text);
              if (event.key === "Escape") onClose();
            }}
            placeholder={`Vad vill du ändra i ${SECTION_LABELS[id].toLowerCase()}?`}
            aria-label={`Ändring för ${SECTION_LABELS[id]}`}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-white/35"
          />
          <button
            type="button"
            onClick={() => send(text)}
            disabled={!text.trim()}
            aria-label="Skicka ändring"
            className="flex size-7 items-center justify-center rounded-lg bg-[var(--lab-teal)] text-[#06231b] disabled:bg-white/10 disabled:text-white/40"
          >
            <ArrowRight className="size-3.5" />
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SECTION_SUGGESTIONS[id].map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => send(suggestion)}
              className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11.5px] text-[var(--lab-muted)] transition-colors hover:border-[var(--lab-teal)]/50 hover:text-white"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </motion.div>
    </>
  );
}

function CompareLayers({ before, after }: { before: SiteVersion; after: SiteVersion }) {
  return (
    <div className="grid">
      <div className="[grid-area:1/1]">
        <SiteMock version={before} />
      </div>
      <div className="[grid-area:1/1]" style={{ clipPath: "inset(0 0 0 var(--lab-split, 50%))" }}>
        <SiteMock version={after} />
      </div>
    </div>
  );
}

/**
 * Före/efter-reglaget. Skriver positionen som CSS-variabel på dokumentet så
 * lagren klipps utan att React renderar om vid varje drag.
 */
function CompareSlider({ beforeLabel, afterLabel }: { beforeLabel: string; afterLabel: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(50);

  useEffect(() => {
    document.documentElement.style.setProperty("--lab-split", `${pos}%`);
  }, [pos]);
  useEffect(
    () => () => {
      document.documentElement.style.removeProperty("--lab-split");
    },
    [],
  );

  const update = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos(Math.min(96, Math.max(4, ((clientX - rect.left) / rect.width) * 100)));
  };

  return (
    <div ref={trackRef} className="pointer-events-none absolute inset-0 z-20">
      <div
        className="pointer-events-auto absolute inset-y-0 w-10 -translate-x-1/2 cursor-ew-resize touch-none"
        style={{ left: `${pos}%` }}
        role="slider"
        aria-label="Jämför versioner"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pos)}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") setPos((value) => Math.max(4, value - 4));
          if (event.key === "ArrowRight") setPos((value) => Math.min(96, value + 4));
        }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          update(event.clientX);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) update(event.clientX);
        }}
      >
        <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_20px_rgba(255,255,255,0.7)]" />
        <span className="absolute top-1/2 left-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[10px] font-bold text-[#0b0f18] shadow-xl">
          ⟷
        </span>
      </div>
      <span className="absolute top-3 left-3 rounded-full bg-black/70 px-2.5 py-1 font-mono text-[11px] text-white backdrop-blur">
        {beforeLabel}
      </span>
      <span className="absolute top-3 right-3 rounded-full bg-[var(--lab-blue)] px-2.5 py-1 font-mono text-[11px] text-white">
        {afterLabel}
      </span>
    </div>
  );
}
