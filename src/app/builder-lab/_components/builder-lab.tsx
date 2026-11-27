"use client";

import { AnimatePresence, LayoutGroup, MotionConfig, motion, useDragControls } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { LG_UP_MEDIA_QUERY, useMediaQuery } from "@/lib/hooks/use-media-query";
import type { SectionId } from "../_lib/mock-data";
import { useStudio } from "../_lib/use-studio";
import { AgentCall } from "./agent-call";
import { BuildCube } from "./build-cube";
import { Canvas, siteSlug } from "./canvas";
import { ChatDock, Composer } from "./chat-dock";
import { CommandPalette } from "./command-palette";
import { LaunchStage } from "./launch-stage";
import { PublishDialog } from "./publish-dialog";
import { TopBar, type LayoutMode } from "./top-bar";

function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

/**
 * Builder-labbet: ett fristående koncept för builderns UI/UX. Allt körs i
 * webbläsaren med påhittad data; den riktiga buildern (/builder) påverkas inte.
 */
export function BuilderLab() {
  const studio = useStudio();
  const { state, set, activeVersion, started } = studio;
  const isDesktop = useMediaQuery(LG_UP_MEDIA_QUERY, true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("panel");
  const [callOpen, setCallOpen] = useState(false);
  const [focusRequest, setFocusRequest] = useState<{ id: SectionId; n: number } | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const cubeDrag = useDragControls();
  const callDrag = useDragControls();

  const canPublish = Boolean(activeVersion) && !state.pending;
  const openPublish = useCallback(() => {
    if (canPublish) setPublishOpen(true);
  }, [canPublish]);
  const exit = useCallback(() => {
    setPublishOpen(false);
    setCallOpen(false);
    studio.reset();
  }, [studio]);
  const focusSection = useCallback(
    (id: SectionId) => {
      set({ view: "preview", compare: false });
      setFocusRequest((previous) => ({ id, n: (previous?.n ?? 0) + 1 }));
    },
    [set],
  );
  const toggleCall = useCallback(() => setCallOpen((open) => !open), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if (event.key === "Escape" && (state.inspect || state.compare || state.selectedSection)) {
        set({ inspect: false, compare: false, selectedSection: null });
        return;
      }
      if (isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (!started || paletteOpen || publishOpen) return;
      const key = event.key.toLowerCase();
      if (key === "e" && activeVersion && !state.pending) {
        set({ inspect: !state.inspect, view: "preview", compare: false, selectedSection: null });
      } else if (key === "1") set({ device: "desktop" });
      else if (key === "2") set({ device: "tablet" });
      else if (key === "3") set({ device: "mobile" });
      else if (key === "c" && activeVersion)
        set({ view: state.view === "code" ? "preview" : "code", inspect: false });
      else if (key === "p") openPublish();
      else if (key === "v") toggleCall();
      else if (key === "b" && isDesktop)
        setLayoutMode((mode) => (mode === "cube" ? "panel" : "cube"));
      else if (key === "f" && isDesktop)
        setLayoutMode((mode) => (mode === "focus" ? "panel" : "focus"));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    state.inspect,
    state.compare,
    state.selectedSection,
    state.pending,
    state.view,
    started,
    paletteOpen,
    publishOpen,
    activeVersion,
    isDesktop,
    set,
    openPublish,
    toggleCall,
  ]);

  const mode: LayoutMode = isDesktop ? layoutMode : "panel";

  return (
    <MotionConfig reducedMotion="user">
      <div className="lab-root relative h-dvh w-full overflow-hidden">
        <LayoutGroup>
          <AnimatePresence initial={false}>
            {!started ? (
              <div key="launch" className="lab-scrollbar absolute inset-0 overflow-y-auto">
                <LaunchStage studio={studio} onOpenPalette={() => setPaletteOpen(true)} />
              </div>
            ) : (
              <motion.div
                key="workspace"
                className="absolute inset-0 flex flex-col overflow-hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
              >
                <div className="lab-aurora pointer-events-none absolute inset-0" aria-hidden />
                <div className="lab-noise pointer-events-none absolute inset-0" aria-hidden />
                <TopBar
                  studio={studio}
                  isDesktop={isDesktop}
                  layoutMode={mode}
                  onLayoutModeChange={setLayoutMode}
                  callOpen={callOpen}
                  onToggleCall={toggleCall}
                  onOpenPalette={() => setPaletteOpen(true)}
                  onPublish={openPublish}
                  onExit={exit}
                />
                <div
                  ref={workspaceRef}
                  className="relative flex min-h-0 flex-1 px-2 pb-2 max-lg:pb-[7.5rem] sm:px-3 sm:pb-3"
                >
                  <AnimatePresence initial={false}>
                    {isDesktop && mode === "panel" ? (
                      <ChatDock
                        key="dock"
                        studio={studio}
                        variant="side"
                        onFocusSection={focusSection}
                        onStartCall={() => setCallOpen(true)}
                      />
                    ) : null}
                  </AnimatePresence>
                  <Canvas studio={studio} isDesktop={isDesktop} focusRequest={focusRequest} />

                  <AnimatePresence>
                    {mode === "cube" ? (
                      <BuildCube
                        key="cube"
                        studio={studio}
                        onExit={() => setLayoutMode("panel")}
                        onFocusSection={focusSection}
                        onStartCall={() => setCallOpen(true)}
                        callOpen={callOpen}
                        constraintsRef={workspaceRef}
                        dragControls={cubeDrag}
                      />
                    ) : null}
                    {mode === "focus" ? (
                      // Fokusläge: bara sajten och en flytande inmatning (samma
                      // komposer som glider ut ur panelen).
                      <motion.div
                        key="floating-composer"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="absolute bottom-3 left-5 z-30 w-[380px] drop-shadow-[0_30px_60px_rgba(0,0,0,0.7)]"
                      >
                        <Composer studio={studio} compact />
                      </motion.div>
                    ) : null}
                    {callOpen ? (
                      <AgentCall
                        key="call"
                        studio={studio}
                        onClose={() => setCallOpen(false)}
                        constraintsRef={workspaceRef}
                        dragControls={callDrag}
                      />
                    ) : null}
                  </AnimatePresence>
                </div>
                {!isDesktop ? (
                  <ChatDock
                    studio={studio}
                    variant="sheet"
                    onFocusSection={focusSection}
                    onStartCall={() => setCallOpen(true)}
                  />
                ) : null}
              </motion.div>
            )}
          </AnimatePresence>
        </LayoutGroup>

        <CommandPalette
          studio={studio}
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          onPublish={openPublish}
          onExit={exit}
          layoutMode={mode}
          onLayoutModeChange={setLayoutMode}
          callOpen={callOpen}
          onToggleCall={toggleCall}
          isDesktop={isDesktop}
        />
        <PublishDialog
          open={publishOpen}
          onOpenChange={setPublishOpen}
          version={activeVersion}
          slug={siteSlug(activeVersion?.content.brand ?? state.projectName)}
        />
      </div>
    </MotionConfig>
  );
}
