import { describe, expect, it } from "vitest";
import {
  LANYARD_ACCEPT_FLIGHT_KEYFRAMES,
  LANYARD_ACCEPT_FLIGHT_OPACITY,
  LANYARD_FLIP_MS_DESKTOP,
  LANYARD_FLIP_MS_MOBILE,
  LANYARD_FLIP_MS_REDUCED,
  LANYARD_REDUCED_MOTION_FADE_END_OPACITY,
  lanyardAcceptFlightAnimation,
  lanyardAcceptFlipMs,
  lanyardAcceptHandoffDelayMs,
  lanyardPhysicsLayerClass,
} from "./lanyard-accept-transition";

describe("lanyard accept transition", () => {
  it("locks fly-back keyframes at full opacity and keeps reduced-motion fade", () => {
    const opacityLocks = LANYARD_ACCEPT_FLIGHT_KEYFRAMES.match(/opacity:\s*([0-9.]+)/g) ?? [];
    const flyBack = LANYARD_ACCEPT_FLIGHT_KEYFRAMES.slice(
      0,
      LANYARD_ACCEPT_FLIGHT_KEYFRAMES.indexOf("@keyframes lanyard-fade-out"),
    );

    expect(LANYARD_ACCEPT_FLIGHT_OPACITY).toBe(1);
    expect(LANYARD_REDUCED_MOTION_FADE_END_OPACITY).toBe(0);
    expect(flyBack).toContain("@keyframes lanyard-fly-back");
    expect(flyBack).toContain("@keyframes lanyard-fly-back-mobile");
    expect(flyBack).not.toContain("opacity: 0");
    expect(opacityLocks.filter((lock) => lock.includes(` ${LANYARD_ACCEPT_FLIGHT_OPACITY}`))).toHaveLength(9);
    expect(LANYARD_ACCEPT_FLIGHT_KEYFRAMES).toContain(
      `@keyframes lanyard-fade-out {\n          0% { opacity: ${LANYARD_ACCEPT_FLIGHT_OPACITY}; }\n          100% { opacity: ${LANYARD_REDUCED_MOTION_FADE_END_OPACITY}; }`,
    );
  });

  it("uses fly-back for motion and fade-out only for reduced-motion", () => {
    expect(
      lanyardAcceptFlightAnimation({
        leaving: true,
        reducedMotion: false,
        mobile: false,
        flipMs: LANYARD_FLIP_MS_DESKTOP,
      }),
    ).toContain("lanyard-fly-back ");
    expect(
      lanyardAcceptFlightAnimation({
        leaving: true,
        reducedMotion: false,
        mobile: true,
        flipMs: LANYARD_FLIP_MS_MOBILE,
      }),
    ).toContain("lanyard-fly-back-mobile");
    expect(
      lanyardAcceptFlightAnimation({
        leaving: true,
        reducedMotion: true,
        mobile: false,
        flipMs: LANYARD_FLIP_MS_REDUCED,
      }),
    ).toBe(`lanyard-fade-out ${LANYARD_FLIP_MS_REDUCED}ms ease-out forwards`);
    expect(
      lanyardAcceptFlightAnimation({
        leaving: false,
        reducedMotion: false,
        mobile: false,
        flipMs: LANYARD_FLIP_MS_DESKTOP,
      }),
    ).toBe("none");
  });

  it("snaps the physics layer to opaque without an opacity tween", () => {
    expect(lanyardPhysicsLayerClass(false)).toBe(
      "h-full w-full pointer-events-none opacity-0",
    );
    expect(lanyardPhysicsLayerClass(true)).toBe("h-full w-full opacity-100");
    expect(lanyardPhysicsLayerClass(true)).not.toContain("transition-opacity");
    expect(lanyardAcceptFlipMs({ reducedMotion: true, mobile: true })).toBe(
      LANYARD_FLIP_MS_REDUCED,
    );
    expect(lanyardAcceptHandoffDelayMs(LANYARD_FLIP_MS_DESKTOP)).toBe(1490);
  });
});
