"use client";

import { useEffect, useState } from "react";

/**
 * Smooth typewriter-style reveal for streamed assistant text.
 *
 * SSE chunks from the gateway often arrive in large bursts, which makes the
 * chat bubble jump several lines at a time. Instead of rendering the raw
 * target directly, this eases the visible text toward it a few characters per
 * animation frame, accelerating with the backlog so it never lags far behind
 * real time. Once started, the animation always plays out to the full text
 * (even after streaming has ended) so the tail never snaps into place.
 *
 * Messages mounted with `animate` false (restored history, user bubbles) start
 * fully revealed and only animate if their content later grows.
 */
export function useSmoothText(target: string, animate: boolean): string {
  const [shownLength, setShownLength] = useState(() => (animate ? 0 : target.length));

  const catchingUp = shownLength < target.length;

  useEffect(() => {
    if (!catchingUp) return;
    let raf = 0;
    let last = performance.now();

    const step = (now: number) => {
      const dt = Math.min(now - last, 100);
      last = now;
      setShownLength((current) => {
        const backlog = target.length - current;
        if (backlog <= 0) return current;
        // ~90 chars/s base speed; large backlogs catch up within ~a second.
        const speed = 90 + backlog * 3;
        const advance = Math.max(1, Math.round((speed * dt) / 1000));
        return Math.min(current + advance, target.length);
      });
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [catchingUp, target]);

  return target.slice(0, Math.min(shownLength, target.length));
}
