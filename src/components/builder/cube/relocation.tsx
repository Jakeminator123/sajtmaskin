"use client";

/**
 * Flyttbart innehåll: EN monterad instans som kan visas på två ställen.
 *
 * Buildern visar komposern, tidslinjen och F3-ytorna antingen i chattpanelen
 * eller på var sin sida i byggkuben. Två platser i React-trädet vore två
 * instanser: ett layoutbyte skulle avmontera komposern och ta med sig utkast,
 * bilagor och pågående uppladdningar. Här flyttas i stället DOM-noden.
 * React-trädet är detsamma i båda lägena, så tillstånd, effekter och kontext
 * överlever bytet.
 *
 * | Del | Roll |
 * |---|---|
 * | `useRelocationSlot` | Kopplar ihop ett innehåll med ett utlopp |
 * | `Relocatable` | Renderar innehållet i sitt hem och äger den flyttbara noden |
 * | `RelocationOutlet` | Platsen noden står på medan utloppet är monterat |
 *
 * Varför det håller: React lägger aldrig till, flyttar eller tar bort den
 * flyttbara noden efter monteringen. Den är hemmets enda barn och har alltid
 * samma typ, och allt React gör med innehållet sker inuti noden, oavsett var i
 * dokumentet den sitter. Utloppet har inga React-barn.
 *
 * Flytten sker i utloppets ref-callback, alltså medan både hemmet och
 * utloppet sitter i dokumentet: då finns rullägena kvar att läsa. Hemmet får
 * därför inte döljas med `display: none` i samma rendering som utloppet
 * monteras; dölj det med `invisible`, som behåller layouten.
 *
 * Händelser bubblar i komponentträdet, som för en portal: en React-lyssnare på
 * utloppets DOM-förfäder ser inte händelser från innehållet. Den som värdar
 * ett utlopp och behöver dem lyssnar i DOM:en.
 */

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export interface RelocationSlot {
  /** Ref-callback för utloppet: innehållet står där medan elementet finns. */
  outletRef: (element: HTMLElement | null) => void;
  /** Anmäler hemmet och den flyttbara noden; returnerar avanmälan. */
  register: (home: HTMLElement, body: HTMLElement) => () => void;
}

/** Inom så här många pixlar från slutet räknas en rullyta som «följer slutet». */
const BOTTOM_SLACK_PX = 2;

interface ScrollMemo {
  element: Element;
  top: number;
  left: number;
  /** Rullytan stod vid sitt slut och ska göra det även efter flytten. */
  atBottom: boolean;
}

function applyScroll({ element, top, left, atBottom }: ScrollMemo) {
  element.scrollLeft = left;
  element.scrollTop = atBottom ? element.scrollHeight : top;
}

/**
 * Sant när innehållet i `container` faktiskt är utlagt, så att rullägen går
 * att läsa där. En dold yta (`display: none`, eller en kubsida som inte står
 * fram och har `content-visibility: hidden`) svarar 0 oavsett var läsaren stod.
 */
function isRendered(container: Element | null): boolean {
  let element = container;
  // `contents` ger ingen egen ruta att fråga om; närmaste ruta uppåt avgör.
  while (element && getComputedStyle(element).display === "contents") {
    element = element.parentElement;
  }
  if (!element || !element.isConnected) return false;
  return typeof element.checkVisibility === "function" ? element.checkVisibility() : true;
}

function readScroll(node: HTMLElement): ScrollMemo[] {
  const memos: ScrollMemo[] = [];
  for (const element of node.querySelectorAll("*")) {
    if (element.scrollTop === 0 && element.scrollLeft === 0) continue;
    memos.push({
      element,
      top: element.scrollTop,
      left: element.scrollLeft,
      atBottom:
        element.scrollHeight - element.clientHeight - element.scrollTop <= BOTTOM_SLACK_PX,
    });
  }
  return memos;
}

const NOTHING_PENDING = () => {};

/**
 * Skriver rullägena, och en gång till när ytan ritas: målet kan vara dolt, och
 * där finns ingen layout att rulla i. En storleksobservatör rapporterar först
 * när elementet har en ritad storlek — genast på en synlig yta, annars när den
 * dolda ytan visas. Returnerar en funktion som släpper det som ännu väntar.
 */
function restoreScroll(memos: readonly ScrollMemo[]): () => void {
  if (memos.length === 0) return NOTHING_PENDING;
  for (const memo of memos) applyScroll(memo);
  if (typeof ResizeObserver === "undefined") return NOTHING_PENDING;

  const pending = new Map<Element, ScrollMemo>(memos.map((memo) => [memo.element, memo]));
  const observer = new ResizeObserver((entries) => {
    for (const { target } of entries) {
      const memo = pending.get(target);
      if (!memo) continue;
      applyScroll(memo);
      pending.delete(target);
      observer.unobserve(target);
    }
    if (pending.size === 0) observer.disconnect();
  });
  for (const memo of memos) observer.observe(memo.element);
  return () => observer.disconnect();
}

function createRelocationSlot(): RelocationSlot {
  let home: HTMLElement | null = null;
  let body: HTMLElement | null = null;
  let target: HTMLElement | null = null;
  // Senast kända rullägen. En nod som flyttas i dokumentet får sitt rulläge
  // nollställt av webbläsaren; en tidslinje som stod vid det senaste
  // meddelandet ska stå där även efter flytten.
  let known: ScrollMemo[] = [];
  let releasePending = NOTHING_PENDING;

  const sync = () => {
    if (!home || !body) return;
    const destination = target ?? home;
    if (body.parentNode === destination) return;
    releasePending();
    // Från en dold yta går lägena inte att läsa; då gäller de senast kända,
    // hellre än att tidslinjen hamnar vid sitt första meddelande.
    if (isRendered(body.parentElement)) known = readScroll(body);
    destination.appendChild(body);
    releasePending = restoreScroll(known);
  };

  return {
    outletRef: (element) => {
      target = element;
      sync();
    },
    register: (nextHome, nextBody) => {
      home = nextHome;
      body = nextBody;
      sync();
      return () => {
        releasePending();
        releasePending = NOTHING_PENDING;
        known = [];
        // Noden lämnas tillbaka innan React tar bort hemmet; annars blir den
        // kvar i ett utlopp som inte längre har något innehåll att visa.
        if (nextBody.parentNode !== nextHome) nextHome.appendChild(nextBody);
        if (home === nextHome) home = null;
        if (body === nextBody) body = null;
      };
    },
  };
}

/** En slot per innehåll. Den är stabil, så den orsakar ingen omrendering. */
export function useRelocationSlot(): RelocationSlot {
  const [slot] = useState(createRelocationSlot);
  return slot;
}

export function Relocatable({ slot, children }: { slot: RelocationSlot; children: ReactNode }) {
  const homeRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const home = homeRef.current;
    const body = bodyRef.current;
    if (!home || !body) return;
    return slot.register(home, body);
  }, [slot]);

  // `contents`: varken hemmet eller den flyttbara noden får egen ruta, så
  // innehållet läggs ut precis som om det låg direkt i sin förälder.
  return (
    <div ref={homeRef} className="contents" data-relocatable-home="">
      <div ref={bodyRef} className="contents" data-relocatable-body="">
        {children}
      </div>
    </div>
  );
}

export function RelocationOutlet({
  slot,
  className,
}: {
  slot: RelocationSlot;
  className?: string;
}) {
  const { outletRef } = slot;
  return <div ref={outletRef} className={className} data-relocation-outlet="" />;
}
