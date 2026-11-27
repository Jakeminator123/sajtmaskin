"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Clock, Coffee, Hammer, MapPin, Phone, Scissors, Star } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  SECTION_LABELS,
  SITE_THEMES,
  visibleSections,
  type SectionId,
  type SiteVersion,
} from "../_lib/mock-data";

type SiteMockProps = {
  version: SiteVersion;
  /** Hur många sektioner som är färdigbyggda; resten visas som ritning. */
  revealed?: number;
  /** Sektioner som just ändrats och ska lysa upp en kort stund. */
  highlight?: SectionId[];
  /** Sektioner som håller på att ändras (uppföljning pågår). */
  editing?: SectionId[];
};

const KIND_ICON = { cafe: Coffee, salon: Scissors, craft: Hammer } as const;

const SERIF = 'ui-serif, "Iowan Old Style", "Palatino Linotype", Georgia, serif';

export function SiteMock({ version, revealed, highlight = [], editing = [] }: SiteMockProps) {
  const theme = SITE_THEMES[version.theme];
  const { content } = version;
  const sections = visibleSections(content);
  const Icon = KIND_ICON[content.kind];

  const style = {
    "--s-bg": theme.bg,
    "--s-surface": theme.surface,
    "--s-text": theme.text,
    "--s-muted": theme.muted,
    "--s-accent": theme.accent,
    "--s-accent-text": theme.accentText,
    "--s-line": theme.line,
    "--s-hero-from": theme.heroFrom,
    "--s-hero-to": theme.heroTo,
  } as CSSProperties;

  const render: Record<SectionId, () => ReactNode> = {
    hero: () => (
      <div className="px-5 pt-4 pb-10 @3xl:px-10 @3xl:pb-16">
        <nav className="flex items-center justify-between py-3">
          <span className="text-lg font-semibold tracking-tight" style={{ fontFamily: SERIF }}>
            {content.brand}
          </span>
          <ul className="hidden items-center gap-6 text-sm text-[var(--s-muted)] @2xl:flex">
            {content.nav.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <span className="rounded-full bg-[var(--s-accent)] px-3.5 py-1.5 text-xs font-medium text-[var(--s-accent-text)]">
            {content.booking ? "Boka" : "Kontakt"}
          </span>
        </nav>
        <div className="mt-6 grid items-center gap-8 @3xl:mt-10 @3xl:grid-cols-[1.1fr_1fr]">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-[var(--s-accent)] uppercase">
              {content.hero.eyebrow} · {content.city}
            </p>
            <h1
              className="mt-3 text-[2rem] leading-[1.05] tracking-tight @3xl:text-5xl @5xl:text-6xl"
              style={{ fontFamily: SERIF }}
            >
              {content.hero.title}
            </h1>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-[var(--s-muted)]">
              {content.hero.lead}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <span className="rounded-full bg-[var(--s-accent)] px-5 py-2.5 text-sm font-medium text-[var(--s-accent-text)] shadow-sm">
                {content.hero.cta}
              </span>
              <span className="rounded-full border border-[var(--s-line)] px-5 py-2.5 text-sm font-medium">
                {content.hero.secondary}
              </span>
            </div>
          </div>
          <div className="relative aspect-[4/3] overflow-hidden rounded-[1.75rem] bg-[radial-gradient(120%_90%_at_20%_10%,var(--s-hero-from),var(--s-hero-to))]">
            <div className="absolute -top-10 -right-10 size-48 rounded-full bg-white/25 blur-2xl" />
            <div className="absolute bottom-6 left-6 size-28 rounded-full border border-white/40" />
            <div className="absolute bottom-10 left-10 size-20 rounded-full border border-white/30" />
            <Icon
              className="absolute top-1/2 left-1/2 size-24 -translate-x-1/2 -translate-y-1/2 text-white/80"
              strokeWidth={1.2}
            />
            <div className="absolute right-4 bottom-4 flex items-center gap-1.5 rounded-full bg-[var(--s-surface)] px-3 py-1.5 text-xs font-medium text-[var(--s-text)] shadow-lg">
              <Star className="size-3.5 fill-[var(--s-accent)] text-[var(--s-accent)]" />
              4,9 på Google
            </div>
          </div>
        </div>
      </div>
    ),
    offer: () => (
      <div className="px-5 py-12 @3xl:px-10">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-2xl tracking-tight @3xl:text-3xl" style={{ fontFamily: SERIF }}>
            {content.offerTitle}
          </h2>
          <span className="text-sm text-[var(--s-muted)]">{content.offers.length} val</span>
        </div>
        <ul className="mt-6 grid gap-3 @2xl:grid-cols-2">
          {content.offers.map((offer) => (
            <li
              key={offer.name}
              className="flex items-start justify-between gap-4 rounded-2xl border border-[var(--s-line)] bg-[var(--s-surface)] p-4"
            >
              <div>
                <p className="font-medium">{offer.name}</p>
                <p className="mt-0.5 text-sm text-[var(--s-muted)]">{offer.desc}</p>
              </div>
              <span className="shrink-0 text-sm font-semibold text-[var(--s-accent)]">
                {offer.price}
              </span>
            </li>
          ))}
        </ul>
      </div>
    ),
    highlights: () => (
      <div className="px-5 py-10 @3xl:px-10">
        <div className="grid gap-4 @3xl:grid-cols-3">
          {content.highlights.map((item, index) => (
            <div key={item.title} className="rounded-2xl bg-[var(--s-surface)] p-5">
              <span className="text-xs font-semibold text-[var(--s-accent)]">0{index + 1}</span>
              <p className="mt-2 font-medium">{item.title}</p>
              <p className="mt-1 text-sm text-[var(--s-muted)]">{item.text}</p>
            </div>
          ))}
        </div>
      </div>
    ),
    booking: () => (
      <div className="px-5 py-10 @3xl:px-10">
        <div className="rounded-[1.75rem] bg-[var(--s-accent)] p-6 text-[var(--s-accent-text)] @3xl:flex @3xl:items-center @3xl:justify-between @3xl:p-10">
          <div>
            <h2 className="text-2xl tracking-tight @3xl:text-3xl" style={{ fontFamily: SERIF }}>
              Boka direkt
            </h2>
            <p className="mt-2 text-sm opacity-85">
              Välj en tid som passar dig. Bekräftelse direkt i mejlen.
            </p>
          </div>
          <div className="mt-5 flex flex-wrap gap-2 @3xl:mt-0">
            {["Idag 14:00", "Idag 16:30", "Imorgon 09:00"].map((slot) => (
              <span
                key={slot}
                className="rounded-full bg-white/15 px-4 py-2 text-sm font-medium ring-1 ring-white/30"
              >
                {slot}
              </span>
            ))}
          </div>
        </div>
      </div>
    ),
    about: () => (
      <div className="grid gap-6 px-5 py-12 @3xl:grid-cols-2 @3xl:px-10">
        <h2 className="text-2xl tracking-tight @3xl:text-4xl" style={{ fontFamily: SERIF }}>
          {content.about.title}
        </h2>
        <p className="text-[15px] leading-relaxed text-[var(--s-muted)]">{content.about.text}</p>
      </div>
    ),
    hours: () => (
      <div className="px-5 py-10 @3xl:px-10">
        <div className="rounded-2xl border border-[var(--s-line)] bg-[var(--s-surface)] p-5 @3xl:p-8">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Clock className="size-4 text-[var(--s-accent)]" /> Öppettider
          </div>
          <dl className="mt-4 grid gap-2 @2xl:grid-cols-3">
            {content.hours.map((row) => (
              <div
                key={row.day}
                className="flex justify-between rounded-xl bg-[var(--s-bg)] px-4 py-3 text-sm"
              >
                <dt className="text-[var(--s-muted)]">{row.day}</dt>
                <dd className="font-medium">{row.time}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    ),
    contact: () => (
      <footer className="mt-4 border-t border-[var(--s-line)] px-5 py-10 @3xl:px-10">
        <div className="grid gap-6 @3xl:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <p className="text-lg font-semibold" style={{ fontFamily: SERIF }}>
              {content.brand}
            </p>
            <p className="mt-1 text-sm text-[var(--s-muted)]">Välkommen in, vi ses snart.</p>
          </div>
          <p className="flex items-center gap-2 text-sm">
            <MapPin className="size-4 text-[var(--s-accent)]" /> {content.contact.address}
          </p>
          <p className="flex items-center gap-2 text-sm">
            <Phone className="size-4 text-[var(--s-accent)]" /> {content.contact.phone}
          </p>
        </div>
      </footer>
    ),
  };

  return (
    <div
      className="lab-site min-h-full bg-[var(--s-bg)] text-[var(--s-text)]"
      style={style}
      data-theme-key={version.theme}
    >
      {sections.map((id, index) => {
        const built = revealed === undefined || index < revealed;
        return (
          <section key={id} data-sid={id} className="relative">
            <AnimatePresence mode="popLayout" initial={false}>
              {built ? (
                <motion.div
                  key="built"
                  initial={{ opacity: 0, filter: "blur(10px)", y: 12 }}
                  animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
                  transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                >
                  {render[id]()}
                </motion.div>
              ) : (
                <motion.div key="blueprint" exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                  <Blueprint id={id} />
                </motion.div>
              )}
            </AnimatePresence>
            {/* Nycklad på versionen: glöden spelas en gång per ny version. */}
            {highlight.includes(id) ? (
              <div
                key={`glow-${version.id}`}
                className="lab-section-glow pointer-events-none absolute inset-0 z-10"
              />
            ) : null}
            {editing.includes(id) ? (
              <div className="lab-editing-sheen pointer-events-none absolute inset-0 z-10" />
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function Blueprint({ id }: { id: SectionId }) {
  const tall = id === "hero";
  return (
    <div className={cn("px-5 py-6 @3xl:px-10", tall && "pb-10")}>
      <div
        className={cn(
          "lab-blueprint relative overflow-hidden rounded-2xl border border-dashed border-[var(--s-accent)]/40 p-5",
          tall ? "h-72 @3xl:h-96" : "h-36",
        )}
      >
        <span className="absolute top-3 left-3 rounded-md bg-[var(--s-accent)]/10 px-2 py-0.5 font-mono text-[10px] tracking-wider text-[var(--s-accent)] uppercase">
          {SECTION_LABELS[id]} · ritas
        </span>
        <div className="mt-8 space-y-3">
          <div className="h-3 w-2/5 rounded-full bg-[var(--s-text)]/10" />
          <div className="h-3 w-3/5 rounded-full bg-[var(--s-text)]/[0.07]" />
          {tall ? <div className="h-3 w-1/3 rounded-full bg-[var(--s-text)]/[0.07]" /> : null}
        </div>
      </div>
    </div>
  );
}
