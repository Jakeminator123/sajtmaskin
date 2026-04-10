import { describe, expect, it } from "vitest";
import { inferCapabilities } from "./capability-inference";

describe("inferCapabilities", () => {
  it("detects app-like cinematic 3D website prompts in Swedish", () => {
    const caps = inferCapabilities(
      "Jag vill ha en hemsida som är mycket app-lik med en massa coola 3dsaker och filmisk neon-känsla.",
    );

    expect(caps.needs3D).toBe(true);
    expect(caps.needsMotion).toBe(true);
    expect(caps.needsAppShell).toBe(true);
    expect(caps.needsPremiumVisuals).toBe(true);
  });
});
