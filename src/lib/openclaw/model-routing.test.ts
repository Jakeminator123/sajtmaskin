import { describe, expect, it } from "vitest";
import { resolveOpenClawModelRoute } from "./model-routing";

describe("resolveOpenClawModelRoute", () => {
  it.each([
    [{ enabled: true, surface: "tips", routingIntent: "general" }, "fast"],
    [{ enabled: true, surface: "chat", routingIntent: "general" }, "fast"],
    [
      {
        enabled: true,
        surface: "chat",
        routingIntent: "general",
        codeContextMode: "manifest",
      },
      "balanced",
    ],
    [
      {
        enabled: true,
        surface: "did",
        routingIntent: "general",
        codeContextMode: "light",
      },
      "balanced",
    ],
    [{ enabled: true, surface: "chat", routingIntent: "review" }, "strong"],
    [
      {
        enabled: true,
        surface: "chat",
        routingIntent: "general",
        hasActivePowers: true,
      },
      "strong",
    ],
    [
      {
        enabled: true,
        surface: "chat",
        routingIntent: "general",
        debug: true,
      },
      "strong",
    ],
    [{ enabled: false, surface: "tips", routingIntent: "general" }, "strong"],
  ] as const)("routes %o to %s", (input, expected) => {
    expect(resolveOpenClawModelRoute(input).lane).toBe(expected);
  });
});
