"use client";

import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  type DragControls,
  type PanInfo,
} from "framer-motion";
import {
  Bot,
  Box,
  Columns2,
  FilePlus2,
  GripHorizontal,
  History,
  LayoutGrid,
  Map as MapIcon,
  MessageSquare,
  MousePointerClick,
  PanelLeft,
  ScrollText,
  SlidersHorizontal,
  Video,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  SECTION_LABELS,
  SITE_THEMES,
  THEME_PROMPTS,
  visibleSections,
  type SectionId,
  type ThemeKey,
} from "../_lib/mock-data";
import type { Studio } from "../_lib/use-studio";
import { agentLine } from "./agent-call";
import { BuildCard, Composer, MessageRow } from "./chat-dock";
import { Segmented, ThemeDots } from "./ui-bits";

type FaceId = "chat" | "log" | "versions" | "map" | "agent" | "tools";

const W = 340;
const H = 440;
const D = 340;

/** Sidorna runt Y-axeln i ordning: fram, höger, bak, vänster. */
const SIDES: FaceId[] = ["chat", "log", "versions", "map"];
const ORDER: FaceId[] = ["chat", "log", "versions", "map", "agent", "tools"];

type Pose = { x: number; y: number; z: number; rotateX: number; rotateY: number };

/**
 * Varje sida som en pose (translate först, sedan rotation — framer-motions
 * ordning). Samma noder animeras mellan kubens poser och solfjäderns, så
 * chattens scroll och ett halvskrivet utkast överlever bytet.
 */
const FACE: Record<
  FaceId,
  { label: string; icon: LucideIcon; rx: number; ry: number; pose: Pose }
> = {
  chat: {
    label: "Chatt",
    icon: MessageSquare,
    rx: 0,
    ry: 0,
    pose: { x: 0, y: 0, z: D / 2, rotateX: 0, rotateY: 0 },
  },
  log: {
    label: "Bygglogg",
    icon: ScrollText,
    rx: 0,
    ry: -90,
    pose: { x: W / 2, y: 0, z: 0, rotateX: 0, rotateY: 90 },
  },
  versions: {
    label: "Versioner",
    icon: History,
    rx: 0,
    ry: -180,
    pose: { x: 0, y: 0, z: -D / 2, rotateX: 0, rotateY: 180 },
  },
  map: {
    label: "Sajtkarta",
    icon: MapIcon,
    rx: 0,
    ry: 90,
    pose: { x: -W / 2, y: 0, z: 0, rotateX: 0, rotateY: -90 },
  },
  agent: {
    label: "Agent",
    icon: Bot,
    rx: -90,
    ry: 0,
    pose: { x: 0, y: -H / 2, z: 0, rotateX: 90, rotateY: 0 },
  },
  tools: {
    label: "Verktyg",
    icon: SlidersHorizontal,
    rx: 90,
    ry: 0,
    pose: { x: 0, y: H / 2, z: 0, rotateX: -90, rotateY: 0 },
  },
};

/** Solfjäderns pose: korten som en utbredd hand, det hovrade lyfts fram. */
function fanPose(index: number, lifted: boolean) {
  const offset = index - (ORDER.length - 1) / 2;
  return {
    x: index * 122,
    y: offset * offset * 7 - 18 - (lifted ? 46 : 0),
    z: lifted ? 80 : index * 2,
    rotateX: 0,
    rotateY: 0,
    rotateZ: lifted ? 0 : offset * 5.5,
    scale: lifted ? 0.86 : 0.78,
  };
}

/** Närmaste vinkel som motsvarar `target`, så kuben aldrig snurrar ett varv i onödan. */
function nearestAngle(current: number, target: number) {
  return target + 360 * Math.round((current - target) / 360);
}

function isTextInput(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return Boolean(el?.closest("input, textarea, [contenteditable='true']"));
}

/**
 * Byggkuben: chattpanelens innehåll som sex sidor på en kub som flyter över
 * förhandsvisningen. Den vrider själv fram byggloggen när ett bygge startar
 * och tillbaka dit du var när det är klart. Dra, svep, piltangenter eller
 * flikarna under kuben för att vrida.
 */
export function BuildCube({
  studio,
  onExit,
  onFocusSection,
  onStartCall,
  callOpen,
  constraintsRef,
  dragControls,
}: {
  studio: Studio;
  onExit: () => void;
  onFocusSection: (id: SectionId) => void;
  onStartCall: () => void;
  callOpen: boolean;
  constraintsRef: RefObject<HTMLDivElement | null>;
  dragControls: DragControls;
}) {
  const reduceMotion = useReducedMotion();
  const { state } = studio;
  const [userFace, setUserFace] = useState<{ id: FaceId; at: number; lastSide: FaceId }>({
    id: "chat",
    at: 0,
    lastSide: "chat",
  });
  // Ett bygge som startat efter användarens senaste val visar byggloggen.
  const face: FaceId = state.pending && userFace.at < state.pending.startedAt ? "log" : userFace.id;

  const [fanned, setFanned] = useState(false);
  const [liftedFace, setLiftedFace] = useState<FaceId | null>(null);
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const scale = useMotionValue(1);
  const cz = useMotionValue(-D / 2);
  const panBase = useRef<{ rx: number; ry: number } | null>(null);

  const rotateTo = useCallback(
    (id: FaceId) => {
      const target = FACE[id];
      const spring = reduceMotion
        ? { duration: 0 }
        : { type: "spring" as const, stiffness: 150, damping: 19, mass: 0.9 };
      animate(rx, target.rx, spring);
      animate(ry, nearestAngle(ry.get(), target.ry), spring);
      if (!reduceMotion)
        animate(scale, [scale.get(), 0.9, 1], { duration: 0.65, ease: "easeInOut" });
    },
    [reduceMotion, rx, ry, scale],
  );

  useEffect(() => {
    if (fanned) return;
    rotateTo(face);
  }, [face, rotateTo, fanned]);

  // Solfjädern: kuben rätar upp sig och sidorna glider ut som kort.
  useEffect(() => {
    const spring = reduceMotion
      ? { duration: 0 }
      : { type: "spring" as const, stiffness: 160, damping: 22 };
    if (fanned) {
      animate(rx, 0, spring);
      animate(ry, nearestAngle(ry.get(), 0), spring);
      animate(cz, 0, spring);
    } else {
      animate(cz, -D / 2, spring);
    }
  }, [fanned, reduceMotion, rx, ry, cz]);

  const choose = (id: FaceId) => {
    setFanned(false);
    setLiftedFace(null);
    setUserFace((previous) => ({
      id,
      at: Date.now(),
      lastSide: SIDES.includes(id) ? id : previous.lastSide,
    }));
    if (id === face) rotateTo(id);
  };

  const onPanStart = (event: PointerEvent) => {
    if (fanned || isTextInput(event.target)) {
      panBase.current = null;
      return;
    }
    rx.stop();
    ry.stop();
    panBase.current = { rx: rx.get(), ry: ry.get() };
  };
  const onPan = (_event: PointerEvent, info: PanInfo) => {
    const base = panBase.current;
    if (!base) return;
    ry.set(base.ry + info.offset.x * 0.45);
    rx.set(Math.max(-100, Math.min(100, base.rx - info.offset.y * 0.45)));
  };
  const onPanEnd = (_event: PointerEvent, info: PanInfo) => {
    if (!panBase.current) return;
    panBase.current = null;
    const { x, y } = info.offset;
    let next: FaceId;
    if (Math.abs(y) > Math.abs(x) && Math.abs(y) > 50) {
      if (face === "agent" || face === "tools") next = userFace.lastSide;
      else next = y > 0 ? "agent" : "tools";
    } else if (Math.abs(x) > 40) {
      const index = ((Math.round(-ry.get() / 90) % 4) + 4) % 4;
      next = SIDES[index];
    } else {
      next = face;
    }
    choose(next);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (fanned && event.key === "Escape") {
      setFanned(false);
      event.preventDefault();
      return;
    }
    if (event.target !== event.currentTarget || fanned) return;
    const sideIndex = SIDES.indexOf(
      face === "agent" || face === "tools" ? userFace.lastSide : face,
    );
    if (event.key === "ArrowRight") choose(SIDES[(sideIndex + 1) % 4]);
    else if (event.key === "ArrowLeft") choose(SIDES[(sideIndex + 3) % 4]);
    else if (event.key === "ArrowUp") choose(face === "tools" ? userFace.lastSide : "agent");
    else if (event.key === "ArrowDown") choose(face === "agent" ? userFace.lastSide : "tools");
    else return;
    event.preventDefault();
  };

  const faces: Record<FaceId, ReactNode> = {
    chat: <ChatFace studio={studio} onFocusSection={onFocusSection} />,
    log: <LogFace studio={studio} />,
    versions: <VersionsFace studio={studio} />,
    map: <MapFace studio={studio} onFocusSection={onFocusSection} />,
    agent: <AgentFace studio={studio} onStartCall={onStartCall} callOpen={callOpen} />,
    tools: <ToolsFace studio={studio} />,
  };

  return (
    <motion.div
      drag
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      dragConstraints={constraintsRef}
      dragElastic={0.06}
      initial={{ opacity: 0, rotateY: -40, rotateX: 12, scale: 0.8, y: 40 }}
      animate={{ opacity: 1, rotateY: 0, rotateX: 0, scale: 1, y: 0 }}
      exit={{ opacity: 0, rotateY: 40, scale: 0.8, y: 40, transition: { duration: 0.3 } }}
      transition={{ type: "spring", stiffness: 200, damping: 22 }}
      style={{ transformPerspective: 1200 }}
      className="absolute bottom-5 left-5 z-30 select-none"
      aria-label="Byggkub"
      role="region"
    >
      <div
        className="mb-2 flex cursor-grab touch-none items-center gap-2 rounded-full border border-white/10 bg-[#0b0f18]/85 py-1 pr-1 pl-3 text-[12px] font-medium shadow-xl backdrop-blur-xl active:cursor-grabbing"
        onPointerDown={(event) => dragControls.start(event)}
      >
        <GripHorizontal className="size-4 text-[var(--lab-muted)]" aria-hidden />
        <span>Byggkub</span>
        <span className="text-[var(--lab-muted)]">·</span>
        <motion.span
          key={fanned ? "fan" : face}
          initial={{ opacity: 0, y: 6, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          className="text-[var(--lab-muted)]"
        >
          {fanned ? "Alla sidor" : FACE[face].label}
        </motion.span>
        <button
          type="button"
          onClick={() => {
            setLiftedFace(null);
            setFanned((value) => !value);
          }}
          onPointerDown={(event) => event.stopPropagation()}
          aria-pressed={fanned}
          title={fanned ? "Fäll ihop till kub" : "Visa alla sidor som kort"}
          aria-label={fanned ? "Fäll ihop till kub" : "Visa alla sidor som kort"}
          className={cn(
            "ml-auto flex size-7 items-center justify-center rounded-full transition-colors",
            fanned
              ? "bg-white text-[#0b0f18]"
              : "text-[var(--lab-muted)] hover:bg-white/[0.08] hover:text-white",
          )}
        >
          {fanned ? <Box className="size-3.5" /> : <LayoutGrid className="size-3.5" />}
        </button>
        <button
          type="button"
          onClick={onExit}
          onPointerDown={(event) => event.stopPropagation()}
          title="Tillbaka till panelen"
          aria-label="Tillbaka till panelen"
          className="flex size-7 items-center justify-center rounded-full text-[var(--lab-muted)] hover:bg-white/[0.08] hover:text-white"
        >
          <PanelLeft className="size-3.5" />
        </button>
      </div>

      <motion.div
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPanStart={onPanStart}
        onPan={onPan}
        onPanEnd={onPanEnd}
        aria-label={`Kubsida: ${FACE[face].label}. Piltangenter vrider kuben.`}
        className="relative rounded-[1.4rem] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--lab-blue)]"
        style={{ width: W, height: H, perspective: 1600, touchAction: "none" }}
      >
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute -bottom-6 left-1/2 h-10 w-[85%] -translate-x-1/2 rounded-[50%] bg-[var(--lab-blue)]/25 blur-2xl transition-opacity duration-500",
            fanned && "opacity-0",
          )}
        />
        <motion.div
          className="relative size-full"
          style={{ rotateX: rx, rotateY: ry, scale, z: cz, transformStyle: "preserve-3d" }}
        >
          {ORDER.map((id, index) => {
            const square = id === "agent" || id === "tools";
            const interactive = !fanned && id === face;
            const pose = fanned
              ? fanPose(index, liftedFace === id)
              : { ...FACE[id].pose, rotateZ: 0, scale: 1 };
            return (
              <motion.div
                key={id}
                initial={false}
                animate={pose}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : {
                        type: "spring",
                        stiffness: 170,
                        damping: 22,
                        delay: liftedFace ? 0 : (fanned ? index : ORDER.length - index) * 0.035,
                      }
                }
                className={cn(
                  "absolute left-0 flex flex-col overflow-hidden rounded-[1.4rem] border bg-[#0b0f18]",
                  fanned && liftedFace === id
                    ? "border-[var(--lab-teal)]/60 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9),0_0_40px_-10px_rgba(47,198,160,0.6)]"
                    : "border-white/[0.12] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_20px_50px_-20px_rgba(0,0,0,0.8)]",
                )}
                style={{
                  width: W,
                  height: square ? D : H,
                  top: square ? (H - D) / 2 : 0,
                  backfaceVisibility: "hidden",
                  WebkitBackfaceVisibility: "hidden",
                }}
              >
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_60%_at_50%_0%,rgba(61,123,255,0.10),transparent_60%)]" />
                <div
                  aria-hidden={!interactive}
                  inert={!interactive}
                  className="relative flex min-h-0 flex-1 flex-col"
                >
                  {faces[id]}
                </div>
                {fanned ? (
                  <button
                    type="button"
                    onClick={() => choose(id)}
                    onMouseEnter={() => setLiftedFace(id)}
                    onMouseLeave={() =>
                      setLiftedFace((current) => (current === id ? null : current))
                    }
                    onFocus={() => setLiftedFace(id)}
                    aria-label={`Öppna ${FACE[id].label}`}
                    className="absolute inset-0 z-10 cursor-pointer rounded-[1.4rem] focus-visible:outline-2 focus-visible:outline-[var(--lab-teal)]"
                  />
                ) : null}
              </motion.div>
            );
          })}
        </motion.div>
      </motion.div>

      <nav
        aria-label="Kubsidor"
        className="mt-3 flex items-center justify-between rounded-full border border-white/10 bg-[#0b0f18]/85 p-1 shadow-xl backdrop-blur-xl"
      >
        {ORDER.map((id) => {
          const Icon = FACE[id].icon;
          const active = !fanned && id === face;
          const busy = id === "log" && Boolean(state.pending);
          return (
            <button
              key={id}
              type="button"
              onClick={() => choose(id)}
              title={FACE[id].label}
              aria-label={FACE[id].label}
              aria-current={active || undefined}
              className={cn(
                "relative flex h-8 flex-1 items-center justify-center rounded-full transition-colors",
                active ? "text-white" : "text-[var(--lab-muted)] hover:text-white",
              )}
            >
              {active ? (
                <motion.span
                  layoutId="lab-cube-tab"
                  className="absolute inset-0 rounded-full bg-white/[0.10]"
                  transition={{ type: "spring", stiffness: 500, damping: 38 }}
                />
              ) : null}
              <Icon className="relative size-4" />
              {busy ? (
                <span className="absolute top-1 right-[30%] size-1.5 animate-pulse rounded-full bg-[var(--lab-blue)]" />
              ) : null}
            </button>
          );
        })}
      </nav>
    </motion.div>
  );
}

function FaceHeader({
  icon: Icon,
  title,
  aside,
}: {
  icon: LucideIcon;
  title: string;
  aside?: ReactNode;
}) {
  return (
    <div className="relative flex shrink-0 items-center gap-2 border-b border-white/[0.06] px-4 py-3 text-[12.5px] font-semibold">
      <Icon className="size-4 text-[#9db8ff]" />
      {title}
      {aside ? (
        <span className="ml-auto text-[11px] font-normal text-[var(--lab-muted)]">{aside}</span>
      ) : null}
    </div>
  );
}

function ChatFace({
  studio,
  onFocusSection,
}: {
  studio: Studio;
  onFocusSection: (id: SectionId) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const messages = studio.state.messages;
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);
  return (
    <>
      <FaceHeader icon={MessageSquare} title="Chatt" aside={`${messages.length} meddelanden`} />
      <div
        ref={ref}
        className="lab-scrollbar relative min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pt-3 pb-2"
      >
        {messages.map((message, index) => (
          <MessageRow
            key={message.id}
            message={message}
            studio={studio}
            isLast={index === messages.length - 1}
            onFocusSection={onFocusSection}
          />
        ))}
      </div>
      <div className="relative">
        <Composer studio={studio} layoutId={null} showHint={false} />
      </div>
    </>
  );
}

function LogFace({ studio }: { studio: Studio }) {
  const { state } = studio;
  const done = [...state.versions].reverse();
  return (
    <>
      <FaceHeader
        icon={ScrollText}
        title="Bygglogg"
        aside={state.pending ? "Bygger nu" : `${done.length} byggen`}
      />
      <div className="lab-scrollbar relative min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3">
        {state.pending ? <BuildCard studio={studio} versionId={state.pending.version.id} /> : null}
        {done.map((version) => (
          <div
            key={version.id}
            className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3"
          >
            <div className="flex items-center justify-between text-[12px]">
              <span className="font-mono font-semibold">v{version.number}</span>
              <span className="font-mono text-[11px] text-[var(--lab-muted)] tabular-nums">
                {((state.lastBuildMs[version.id] ?? 0) / 1000).toFixed(1).replace(".", ",")} s
              </span>
            </div>
            <p className="mt-1 text-[12px] leading-snug text-white/80">{version.summary}</p>
            <p className="mt-1.5 text-[10.5px] text-[var(--lab-muted)]">
              {version.changed.map((id) => SECTION_LABELS[id]).join(" · ")}
            </p>
          </div>
        ))}
        {!state.pending && done.length === 0 ? (
          <p className="px-1 pt-6 text-center text-[12px] text-[var(--lab-muted)]">
            Inga byggen än.
          </p>
        ) : null}
      </div>
    </>
  );
}

function VersionsFace({ studio }: { studio: Studio }) {
  const { state, activeVersion, previousVersion, selectVersion, set } = studio;
  return (
    <>
      <FaceHeader icon={History} title="Versioner" aside={`${state.versions.length} st`} />
      <div className="lab-scrollbar relative min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {[...state.versions].reverse().map((version) => {
          const active = version.id === activeVersion?.id;
          return (
            <button
              key={version.id}
              type="button"
              onClick={() => selectVersion(version.id)}
              disabled={Boolean(state.pending)}
              className={cn(
                "w-full rounded-2xl border p-3 text-left transition-colors disabled:cursor-wait",
                active
                  ? "border-[var(--lab-blue)]/60 bg-[var(--lab-blue)]/10"
                  : "border-white/[0.06] bg-white/[0.02] hover:border-white/15",
              )}
            >
              <span className="flex items-center justify-between">
                <span className="font-mono text-[12px] font-semibold">v{version.number}</span>
                <ThemeDots theme={version.theme} />
              </span>
              <span className="mt-1 line-clamp-2 block text-[12px] leading-snug text-[var(--lab-muted)]">
                {version.summary}
              </span>
            </button>
          );
        })}
      </div>
      {previousVersion ? (
        <div className="relative border-t border-white/[0.06] p-3">
          <button
            type="button"
            onClick={() => set({ compare: !state.compare, inspect: false, view: "preview" })}
            className={cn(
              "flex h-9 w-full items-center justify-center gap-2 rounded-full text-[12.5px] font-semibold transition-colors",
              state.compare ? "bg-white text-[#0b0f18]" : "bg-white/[0.07] hover:bg-white/[0.12]",
            )}
          >
            <Columns2 className="size-4" />
            {state.compare ? "Sluta jämföra" : `Jämför med v${previousVersion.number}`}
          </button>
        </div>
      ) : null}
    </>
  );
}

function MapFace({
  studio,
  onFocusSection,
}: {
  studio: Studio;
  onFocusSection: (id: SectionId) => void;
}) {
  const { state, activeVersion, set } = studio;
  const version = activeVersion ?? state.pending?.version ?? null;
  const sections = version ? visibleSections(version.content) : [];
  return (
    <>
      <FaceHeader icon={MapIcon} title="Sajtkarta" aside="1 sida" />
      <div className="lab-scrollbar relative min-h-0 flex-1 overflow-y-auto p-3">
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-2">
          <p className="flex items-center justify-between px-2 py-1.5 text-[12px] font-semibold">
            Startsida{" "}
            <span className="font-mono text-[11px] font-normal text-[var(--lab-muted)]">/</span>
          </p>
          <ol className="mt-1 space-y-0.5">
            {sections.map((id, index) => {
              const changed = activeVersion?.changed.includes(id) && activeVersion.number > 1;
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => onFocusSection(id)}
                    className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left text-[12.5px] transition-colors hover:bg-white/[0.06]"
                  >
                    <span className="font-mono text-[10px] text-white/30">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {SECTION_LABELS[id]}
                    {changed ? (
                      <span className="ml-auto rounded-full bg-[var(--lab-blue)]/15 px-2 py-0.5 text-[10px] text-[#c7d6ff]">
                        ändrad
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
      <div className="relative grid grid-cols-2 gap-2 border-t border-white/[0.06] p-3">
        <button
          type="button"
          onClick={() => toast("Labbet: fler sidor är inte kopplade.")}
          className="flex h-9 items-center justify-center gap-1.5 rounded-full bg-white/[0.07] text-[12px] font-medium hover:bg-white/[0.12]"
        >
          <FilePlus2 className="size-3.5" /> Ny sida
        </button>
        <button
          type="button"
          disabled={!activeVersion || Boolean(state.pending)}
          onClick={() => set({ inspect: true, view: "preview", compare: false })}
          className="flex h-9 items-center justify-center gap-1.5 rounded-full bg-[var(--lab-teal)]/15 text-[12px] font-medium text-[#9eeed6] hover:bg-[var(--lab-teal)]/25 disabled:opacity-40"
        >
          <MousePointerClick className="size-3.5" /> Peka & ändra
        </button>
      </div>
    </>
  );
}

function AgentFace({
  studio,
  onStartCall,
  callOpen,
}: {
  studio: Studio;
  onStartCall: () => void;
  callOpen: boolean;
}) {
  const line = agentLine(studio);
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center gap-4 p-5 text-center">
      <span className="relative flex size-24 items-center justify-center" aria-hidden>
        <span className="lab-orb absolute inset-0 rounded-full" />
        <span className="absolute inset-[18%] rounded-full bg-[#0b0f18]" />
        <Bot className="relative size-7 text-white/90" />
      </span>
      <p className="text-[13px] leading-snug text-white/85">{line.text}</p>
      <button
        type="button"
        onClick={onStartCall}
        disabled={callOpen}
        className="flex h-9 items-center gap-2 rounded-full bg-white px-4 text-[12.5px] font-semibold text-[#0b0f18] disabled:bg-white/10 disabled:text-white/50"
      >
        <Video className="size-4" /> {callOpen ? "Samtal pågår" : "Starta videosamtal"}
      </button>
    </div>
  );
}

function ToolsFace({ studio }: { studio: Studio }) {
  const { state, set, submit, activeVersion } = studio;
  const [toggles, setToggles] = useState({ autofix: true, images: true, tips: false });
  const rows: { key: keyof typeof toggles; label: string }[] = [
    { key: "autofix", label: "Rätta fel automatiskt" },
    { key: "images", label: "AI-bilder" },
    { key: "tips", label: "Tips efter varje bygge" },
  ];
  return (
    <div className="relative flex flex-1 flex-col gap-3 overflow-y-auto p-4">
      <div>
        <p className="mb-1.5 text-[11px] font-medium text-[var(--lab-muted)]">
          Palett (ny version)
        </p>
        <div className="flex gap-2">
          {(Object.keys(SITE_THEMES) as ThemeKey[]).map((key) => (
            <button
              key={key}
              type="button"
              disabled={!activeVersion || Boolean(state.pending) || activeVersion.theme === key}
              onClick={() => submit(THEME_PROMPTS[key])}
              title={SITE_THEMES[key].label}
              aria-label={SITE_THEMES[key].label}
              className={cn(
                "flex h-9 flex-1 items-center justify-center rounded-xl border transition-colors disabled:cursor-not-allowed",
                activeVersion?.theme === key
                  ? "border-white/40 bg-white/[0.08]"
                  : "border-white/[0.08] hover:border-white/25",
              )}
            >
              <ThemeDots theme={key} />
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-[var(--lab-muted)]">Chattläge</span>
        <Segmented
          id="cube-mode"
          ariaLabel="Chattläge"
          size="sm"
          value={state.composerMode}
          onChange={(composerMode) => set({ composerMode })}
          options={[
            { value: "auto", label: "Auto" },
            { value: "ask", label: "Fråga" },
            { value: "build", label: "Bygg" },
          ]}
        />
      </div>
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center justify-between text-[12.5px]">
            {row.label}
            <button
              type="button"
              role="switch"
              aria-checked={toggles[row.key]}
              aria-label={row.label}
              onClick={() => setToggles((value) => ({ ...value, [row.key]: !value[row.key] }))}
              className={cn(
                "relative h-5 w-9 rounded-full transition-colors",
                toggles[row.key] ? "bg-[var(--lab-teal)]" : "bg-white/15",
              )}
            >
              <motion.span
                className="absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow"
                animate={{ x: toggles[row.key] ? 16 : 0 }}
                transition={{ type: "spring", stiffness: 600, damping: 32 }}
              />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
