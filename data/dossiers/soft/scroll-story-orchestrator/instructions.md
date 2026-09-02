# When to use

Use this dossier only when the brief explicitly asks for scrollytelling: several chapters whose media stays pinned while the text scrolls past. Triggers (Swedish + English): `scrollytelling`, `scroll story`, `scrollberättelse`, `scrollstyrd berättelse`, fastnålade/sticky scener eller kapitel, "Apple-liknande produktpresentation", flera scener som byts under scroll.

Best fit:

- An Apple-style product presentation with 3–6 pinned chapters.
- A before/after renovation or brand story told as stacked scenes.

Do not use for:

- Hero parallax
- Scroll reveal / fade-in
- Smooth scroll
- Sticky header
- A long landing page
- Mood words like cinematic, immersive, or premium alone

# How to integrate

Emit files 1:1: `components/use-scroll-story.ts` → `components/use-scroll-story.ts` (import `@/components/use-scroll-story`); `components/scroll-story.tsx` → `components/scroll-story.tsx` (`@/components/scroll-story`); `components/scroll-story-progress.tsx` → `components/scroll-story-progress.tsx` (`@/components/scroll-story-progress`). Add `framer-motion`. Mount `ScrollStory` with 3–6 steps. Keep `use-scroll-story.ts` and `scroll-story.tsx` verbatim.

```tsx
import Image from "next/image";
import { ScrollStory } from "@/components/scroll-story";

export function KoketBerattelse() {
  return (
    <ScrollStory
      ariaLabel="Köksrenoveringens kapitel"
      mediaSide="right"
      steps={[
        {
          id: "fore",
          eyebrow: "Steg 1",
          title: "Före",
          description: "Det slitna köket med mörka skåp och dålig belysning.",
          media: (
            <Image
              src="/kok-fore.jpg"
              alt="Kök före renovering"
              fill
              className="object-cover"
              sizes="(min-width: 768px) 50vw, 100vw"
            />
          ),
        },
        {
          id: "under-arbetet",
          eyebrow: "Steg 2",
          title: "Under arbetet",
          description: "Rivning, el och nya stommar på plats.",
          media: (
            <Image
              src="/kok-under.jpg"
              alt="Kök under renovering"
              fill
              className="object-cover"
              sizes="(min-width: 768px) 50vw, 100vw"
            />
          ),
        },
        {
          id: "resultatet",
          eyebrow: "Steg 3",
          title: "Resultatet",
          description: "Ljust kök med nya luckor, stenbänk och plats för familjen.",
          media: (
            <Image
              src="/kok-efter.jpg"
              alt="Färdigrenoverat kök"
              fill
              className="object-cover"
              sizes="(min-width: 768px) 50vw, 100vw"
            />
          ),
        },
      ]}
    />
  );
}
```

Give every image a meaningful `alt`. Wrap `next/image` `fill` media so it has a positioned parent (the sticky stage and the linear media frame already do).

# UX rules

- Sticky pinning is desktop-only (`min-width: 768px`) and only when motion is allowed. Mobile and `prefers-reduced-motion: reduce` render chapters in linear document order (media, then text). Do not keep sticky layout in those modes.
- Every chapter title is in the DOM exactly once. Inactive sticky chapters may be dimmed with opacity; never `hidden`, `display: none`, or `opacity: 0` on the text.
- Do not hijack scroll, lock `document.body`, or add wheel/touch listeners. Native page scroll drives progress.
- No horizontal overflow. Keep 3–6 chapters and keep each chapter's text short.
- Always pass `ariaLabel`. Progress buttons (sticky mode) jump with `scrollIntoView` and use `behavior: "auto"` when reduced motion is on.

# Avoid

- Do not add wheel, touch, or custom scroll listeners; the browser owns scrolling.
- Do not lock `document.body` overflow or otherwise hijack scroll.
- Do not paraphrase `use-scroll-story.ts` or `scroll-story.tsx` — their mode, progress, and DOM-once contract is load-bearing.
- Do not use this for a single parallax hero; that stays freehand.
- Do not autoplay video with sound inside a chapter.
- Do not hide chapter text with `hidden`, `display:none`, or opacity 0 in linear mode — every title stays readable.

# Verification

- Desktop width: media column is sticky, chapter indicator updates as you scroll, first chapter is `aria-current="step"` at the top.
- Resize to 320px: layout is linear, media sits above each chapter's text, no sticky stage, no horizontal overflow.
- Set `prefers-reduced-motion: reduce`: layout stays linear even on a wide viewport; progress jumps use `behavior: "auto"`.
- Tab through the section: document order matches chapter order; titles are reachable; inactive stacked media is `aria-hidden`.
- Active chapter updates deterministically from normalized scroll progress (not from wheel deltas).
- Unmount the section: matchMedia `change` listeners are removed; no leftover body styles.
