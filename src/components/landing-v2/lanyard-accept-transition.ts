/**
 * Cookie-accept → flykt → dinglande överlämning.
 * Flygbanan (transform) är oförändrad; opacity låses så kortet inte
 * blir genomskinligt mitt i slaget. Reduced-motion behåller uttoningen.
 */

export const LANYARD_FLIP_MS_DESKTOP = 1550;
export const LANYARD_FLIP_MS_MOBILE = 1150;
export const LANYARD_FLIP_MS_REDUCED = 350;
export const LANYARD_ACCEPT_HANDOFF_LEAD_MS = 60;

/** Kort + snodd under flykten — aldrig under detta (förutom reduced-motion-fade). */
export const LANYARD_ACCEPT_FLIGHT_OPACITY = 1;
export const LANYARD_REDUCED_MOTION_FADE_END_OPACITY = 0;

function flyStop(transform: string): string {
  return `{ transform: ${transform}; opacity: ${LANYARD_ACCEPT_FLIGHT_OPACITY}; }`;
}

export const LANYARD_ACCEPT_FLIGHT_KEYFRAMES = `
        @keyframes lanyard-fly-back {
          0% ${flyStop("translateY(0) translateZ(0) scale(1)")}
          18% ${flyStop("translateY(2.4vh) translateZ(190px) scale(1.09)")}
          72% ${flyStop("translateY(-30vh) translateZ(-1050px) scale(0.5)")}
          100% ${flyStop("translateY(-24vh) translateZ(-560px) scale(0.66)")}
        }
        @keyframes lanyard-fly-back-mobile {
          0% ${flyStop("translateY(0) translateZ(0) scale(1)")}
          18% ${flyStop("translateY(1.6vh) translateZ(120px) scale(1.06)")}
          72% ${flyStop("translateY(-21vh) translateZ(-720px) scale(0.56)")}
          100% ${flyStop("translateY(-16vh) translateZ(-380px) scale(0.7)")}
        }
        @keyframes lanyard-fade-out {
          0% { opacity: ${LANYARD_ACCEPT_FLIGHT_OPACITY}; }
          100% { opacity: ${LANYARD_REDUCED_MOTION_FADE_END_OPACITY}; }
        }
      `;

export function lanyardAcceptFlipMs(input: {
  reducedMotion: boolean;
  mobile: boolean;
}): number {
  if (input.reducedMotion) return LANYARD_FLIP_MS_REDUCED;
  return input.mobile ? LANYARD_FLIP_MS_MOBILE : LANYARD_FLIP_MS_DESKTOP;
}

export function lanyardAcceptHandoffDelayMs(flipMs: number): number {
  return Math.max(0, flipMs - LANYARD_ACCEPT_HANDOFF_LEAD_MS);
}

export function lanyardAcceptFlightAnimation(input: {
  leaving: boolean;
  reducedMotion: boolean;
  mobile: boolean;
  flipMs: number;
}): string {
  if (!input.leaving) return "none";
  if (input.reducedMotion) {
    return `lanyard-fade-out ${input.flipMs}ms ease-out forwards`;
  }
  const name = input.mobile ? "lanyard-fly-back-mobile" : "lanyard-fly-back";
  return `${name} ${input.flipMs}ms cubic-bezier(0.34, 0.02, 0.26, 1) forwards`;
}

/** Ingen 300ms crossfade — överlämningen ska vara solid, inte genomskinlig. */
export function lanyardPhysicsLayerClass(revealed: boolean): string {
  return revealed
    ? "h-full w-full opacity-100"
    : "h-full w-full pointer-events-none opacity-0";
}
