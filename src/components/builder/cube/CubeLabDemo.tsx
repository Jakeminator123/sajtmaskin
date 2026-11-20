"use client";

/**
 * Labbyta för Kuben: komponenten med realistiska attrappsidor över en
 * fejkad förhandsvisning i full storlek. Kräver varken env eller databas.
 *
 * Frågeparametrar (för mätning): `geometry=virtual|box`,
 * `hidden=content-visibility|visibility|display`, `reduced=1`.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  FolderTree,
  MessageSquare,
  ScrollText,
  SendHorizontal,
  SlidersHorizontal,
  Video,
} from "lucide-react";
import { BuilderCube, type CubeFaceSpec, type HiddenFaceStrategy } from "./BuilderCube";
import { useCubeLayout } from "./cube-layout-storage";
import type { CubeFaceId } from "./cube-model";
import type { CubeGeometry } from "./cube-geometry";

const ANSWERS = Array.from({ length: 60 }, (_, i) => ({
  id: i,
  text:
    i % 3 === 0
      ? `Jag har lagt till en hero-sektion med rubrik, kort ingress och en tydlig knapp (svar ${i + 1}).`
      : i % 3 === 1
        ? `Färgerna följer nu varumärket: mörk bakgrund, varm accent och luftig typografi (svar ${i + 1}).`
        : `Kontaktformuläret validerar e-post och visar ett tack efter skickat meddelande (svar ${i + 1}).`,
}));

const LOG = Array.from({ length: 120 }, (_, i) => {
  const kinds = ["info", "ok", "warn"] as const;
  const kind = kinds[i % 7 === 0 ? 2 : i % 2];
  const msgs = ["kompilerar app/page.tsx", "bygger 14 rutter", "optimerar bilder", "typkontroll klar", "startar preview-VM"];
  return { id: i, kind, text: `[${String(10 + (i % 50)).padStart(2, "0")}:${String((i * 7) % 60).padStart(2, "0")}] ${msgs[i % msgs.length]}` };
});

const SITEMAP = [
  { name: "Start", path: "/", children: [] },
  {
    name: "Tjänster",
    path: "/tjanster",
    children: [
      { name: "Badrum", path: "/tjanster/badrum" },
      { name: "Kök", path: "/tjanster/kok" },
      { name: "Fasad", path: "/tjanster/fasad" },
    ],
  },
  { name: "Om oss", path: "/om", children: [{ name: "Team", path: "/om/team" }] },
  { name: "Kontakt", path: "/kontakt", children: [] },
];

function ChatFace({ onSend }: { onSend: (text: string) => void }) {
  const [draft, setDraft] = useState("");
  return (
    <form
      className="flex h-full flex-col gap-3 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!draft.trim()) return;
        onSend(draft.trim());
        setDraft("");
      }}
    >
      <p className="text-muted-foreground text-xs">Beskriv vad du vill ändra på sajten.</p>
      <textarea
        data-testid="lab-chat-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="T.ex. gör hero-bilden större och lägg till en offertknapp"
        className="border-border/80 bg-background focus:ring-ring min-h-0 flex-1 resize-none rounded-xl border p-3 text-sm outline-none focus:ring-2"
      />
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-[11px]">{draft.length} tecken</span>
        <button
          type="submit"
          className="bg-primary text-primary-foreground inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          disabled={!draft.trim()}
        >
          <SendHorizontal className="size-3.5" aria-hidden="true" />
          Skicka
        </button>
      </div>
    </form>
  );
}

function AnswersFace({ extra }: { extra: string[] }) {
  return (
    <div data-testid="lab-answers-scroll" className="h-full overflow-y-auto overscroll-contain p-3">
      <ol className="space-y-2">
        {ANSWERS.map((a) => (
          <li key={a.id} className="bg-muted/40 rounded-lg px-3 py-2 text-sm leading-relaxed">
            {a.text}
          </li>
        ))}
        {extra.map((t, i) => (
          <li key={`x${i}`} className="bg-primary/10 rounded-lg px-3 py-2 text-sm">
            Du: {t}
          </li>
        ))}
      </ol>
    </div>
  );
}

function BuildLogFace() {
  return (
    <div className="h-full overflow-y-auto p-3 font-mono text-[11px] leading-5">
      {LOG.map((l) => (
        <div
          key={l.id}
          className={l.kind === "warn" ? "text-amber-300" : l.kind === "ok" ? "text-emerald-300" : "text-muted-foreground"}
        >
          {l.text}
        </div>
      ))}
    </div>
  );
}

/** Canvas → MediaStream → <video srcObject>: samma väg som en WebRTC-ström. */
function AvatarFace() {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 320;
    const ctx = canvas.getContext("2d");
    const video = videoRef.current;
    if (!ctx || !video || typeof canvas.captureStream !== "function") return;
    let frame = 0;
    let raf = 0;
    const draw = () => {
      frame += 1;
      const t = frame / 60;
      ctx.fillStyle = "#11141a";
      ctx.fillRect(0, 0, 320, 320);
      const g = ctx.createRadialGradient(160, 150, 10, 160, 150, 120);
      g.addColorStop(0, "#fb7185");
      g.addColorStop(1, "#4c1d2b");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(160, 150, 90 + Math.sin(t * 2) * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#11141a";
      const mouth = 6 + Math.abs(Math.sin(t * 7)) * 14;
      ctx.fillRect(130, 190, 60, mouth);
      ctx.fillStyle = "#e5e7eb";
      ctx.font = "14px sans-serif";
      ctx.fillText(`ruta ${frame}`, 12, 304);
      raf = requestAnimationFrame(draw);
    };
    draw();
    const stream = canvas.captureStream(30);
    video.srcObject = stream;
    video.play().catch(() => {});
    return () => {
      cancelAnimationFrame(raf);
      stream.getTracks().forEach((t) => t.stop());
    };
  }, []);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-4">
      <video
        ref={videoRef}
        data-testid="lab-avatar-video"
        muted
        playsInline
        className="aspect-square w-full max-w-72 rounded-2xl border border-border/60 bg-black object-cover"
      />
      <p className="text-muted-foreground text-xs">Livevideo (attrapp via MediaStream).</p>
    </div>
  );
}

function SitemapFace() {
  return (
    <nav aria-label="Sajtkarta" className="h-full overflow-y-auto p-3 text-sm">
      <ul className="space-y-1">
        {SITEMAP.map((p) => (
          <li key={p.path}>
            <a href={`#${p.path}`} className="hover:bg-muted/60 flex justify-between rounded-md px-2 py-1">
              <span>{p.name}</span>
              <span className="text-muted-foreground font-mono text-[11px]">{p.path}</span>
            </a>
            {p.children.length > 0 ? (
              <ul className="border-border/60 ml-3 border-l pl-2">
                {p.children.map((c) => (
                  <li key={c.path}>
                    <a href={`#${c.path}`} className="hover:bg-muted/60 flex justify-between rounded-md px-2 py-1">
                      <span>{c.name}</span>
                      <span className="text-muted-foreground font-mono text-[11px]">{c.path}</span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </nav>
  );
}

function ToolsFace({
  geometry,
  setGeometry,
}: {
  geometry: CubeGeometry;
  setGeometry: (g: CubeGeometry) => void;
}) {
  const [seo, setSeo] = useState(true);
  const [anim, setAnim] = useState(false);
  const [width, setWidth] = useState(72);
  const [radius, setRadius] = useState(12);
  const toggle = (label: string, on: boolean, set: (v: boolean) => void) => (
    <label className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => set(!on)}
        className={`relative h-5 w-9 rounded-full transition-colors ${on ? "bg-primary" : "bg-muted"}`}
      >
        <span className={`bg-background absolute top-0.5 size-4 rounded-full transition-[left] ${on ? "left-[18px]" : "left-0.5"}`} />
      </button>
    </label>
  );
  return (
    <div className="h-full space-y-3 overflow-y-auto p-3">
      {toggle("SEO-metadata", seo, setSeo)}
      {toggle("Animationer på sajten", anim, setAnim)}
      <label className="block text-sm">
        Innehållsbredd: {width} rem
        <input type="range" min={48} max={96} value={width} onChange={(e) => setWidth(+e.target.value)} className="mt-1 w-full" />
      </label>
      <label className="block text-sm">
        Hörnradie: {radius} px
        <input type="range" min={0} max={24} value={radius} onChange={(e) => setRadius(+e.target.value)} className="mt-1 w-full" />
      </label>
      <fieldset className="border-border/60 rounded-lg border p-2 text-sm">
        <legend className="text-muted-foreground px-1 text-xs">Labb: geometri</legend>
        {(["virtual", "box"] as const).map((g) => (
          <label key={g} className="mr-3 inline-flex items-center gap-1.5">
            <input type="radio" name="geometry" checked={geometry === g} onChange={() => setGeometry(g)} />
            {g === "virtual" ? "B: virtuell" : "A: låda"}
          </label>
        ))}
      </fieldset>
    </div>
  );
}

function FakeSitePreview() {
  const [clicks, setClicks] = useState(0);
  return (
    <div className="absolute inset-0 overflow-y-auto bg-[#f6f3ee] text-[#1d1b18]" data-testid="lab-preview">
      <header className="flex items-center justify-between px-10 py-6">
        <strong className="text-lg">Byggfirman Ek &amp; Sten</strong>
        <nav className="flex gap-6 text-sm">
          <span>Tjänster</span>
          <span>Om oss</span>
          <span>Kontakt</span>
        </nav>
      </header>
      <section className="px-10 py-20">
        <h1 className="max-w-2xl text-5xl leading-tight font-semibold">Hantverk som håller i generationer.</h1>
        <p className="mt-4 max-w-xl text-lg text-[#5b554c]">
          Badrum, kök och fasader i Stockholm. Fast pris, tydlig tidplan och ett team som städar efter sig.
        </p>
        <button
          type="button"
          data-testid="lab-preview-button"
          onClick={() => setClicks((c) => c + 1)}
          className="mt-8 rounded-full bg-[#1d1b18] px-6 py-3 text-sm text-white"
        >
          Begär offert ({clicks})
        </button>
      </section>
      <section className="grid grid-cols-3 gap-6 px-10 pb-24">
        {["Badrum", "Kök", "Fasad"].map((t) => (
          <div key={t} className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-4 aspect-[4/3] rounded-xl bg-[#e4ddd2]" />
            <h2 className="font-medium">{t}</h2>
            <p className="mt-1 text-sm text-[#5b554c]">Från planering till slutbesiktning.</p>
          </div>
        ))}
      </section>
    </div>
  );
}

function readParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

export function CubeLabDemo() {
  const { layout, setLayout, resetLayout } = useCubeLayout();
  const [activeFace, setActiveFace] = useState<CubeFaceId>("chat");
  const [sent, setSent] = useState<string[]>([]);
  const [geometry, setGeometry] = useState<CubeGeometry>("virtual");
  const [hidden, setHidden] = useState<HiddenFaceStrategy>("content-visibility");
  const [reduced, setReduced] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    const g = readParam("geometry");
    const h = readParam("hidden");
    // Frågeparametrar finns bara i webbläsaren.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- labbparametrar läses efter montering
    if (g === "box" || g === "virtual") setGeometry(g);
    if (h === "visibility" || h === "display" || h === "content-visibility") setHidden(h);
    if (readParam("reduced") === "1") setReduced(true);
  }, []);

  const faces = useMemo<Record<CubeFaceId, CubeFaceSpec>>(
    () => ({
      chat: {
        label: "Chatt",
        icon: <MessageSquare />,
        // Som i byggaren: ett skickat meddelande vrider fram svaren.
        content: (
          <ChatFace
            onSend={(t) => {
              setSent((s) => [...s, t]);
              setActiveFace("answers");
            }}
          />
        ),
      },
      answers: { label: "Svar", icon: <Bot />, content: <AnswersFace extra={sent} />, badge: sent.length || undefined },
      buildlog: { label: "Bygglogg", icon: <ScrollText />, content: <BuildLogFace />, badge: "dot" },
      tools: {
        label: "Verktyg",
        icon: <SlidersHorizontal />,
        content: <ToolsFace geometry={geometry} setGeometry={setGeometry} />,
      },
      avatar: { label: "Avatar", icon: <Video />, content: <AvatarFace /> },
      sitemap: { label: "Sajtkarta", icon: <FolderTree />, content: <SitemapFace /> },
    }),
    [sent, geometry],
  );

  return (
    <div className="bg-background fixed inset-0 overflow-hidden" data-testid="lab-root">
      <FakeSitePreview />
      <BuilderCube
        faces={faces}
        activeFace={activeFace}
        onActiveFaceChange={setActiveFace}
        position={{ x: layout.cube.x, y: layout.cube.y }}
        onPositionChange={(p) => setLayout((l) => ({ ...l, cube: { ...l.cube, ...p } }))}
        size={{ width: layout.cube.width, height: layout.cube.height }}
        onSizeChange={(s) => setLayout((l) => ({ ...l, cube: { ...l.cube, ...s } }))}
        mode={layout.mode}
        onModeChange={(mode) => setLayout((l) => ({ ...l, mode }))}
        cards={{ rects: layout.cards, folded: layout.folded, order: layout.order }}
        onCardsChange={(c) => setLayout((l) => ({ ...l, cards: c.rects, folded: c.folded, order: c.order }))}
        onResetLayout={resetLayout}
        geometry={geometry}
        hiddenStrategy={hidden}
        reducedMotion={reduced}
      />
    </div>
  );
}
