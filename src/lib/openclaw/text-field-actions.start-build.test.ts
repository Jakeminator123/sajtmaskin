import { describe, expect, it } from "vitest";
import { parseOpenClawMessage } from "./text-field-actions";

function wrap(payload: unknown): string {
  return ["Jag startar bygget.", "<openclaw-action>", JSON.stringify(payload), "</openclaw-action>"].join(
    "\n",
  );
}

describe("parseOpenClawMessage — start_build", () => {
  it("parsar ett direktbygg med prompt, etikett och motivering", () => {
    const parsed = parseOpenClawMessage(
      wrap({
        type: "start_build",
        label: "Tydligare bokning",
        reason: "Användaren bad om det",
        prompt: "Gör om hero-sektionen.\n\nMål:\n- Tydligare CTA",
      }),
    );
    expect(parsed.visibleContent).toBe("Jag startar bygget.");
    expect(parsed.actionError).toBeNull();
    expect(parsed.action).toEqual({
      type: "start_build",
      label: "Tydligare bokning",
      reason: "Användaren bad om det",
      prompt: "Gör om hero-sektionen.\n\nMål:\n- Tydligare CTA",
    });
  });

  it("avvisar ett direktbygg utan prompt med svensk orsak", () => {
    const parsed = parseOpenClawMessage(wrap({ type: "start_build", label: "x" }));
    expect(parsed.action).toBeNull();
    expect(parsed.actionError).toBe("Byggförslaget saknar en prompt att skicka.");
  });

  it("klipper en överlång prompt till taket", () => {
    const parsed = parseOpenClawMessage(
      wrap({ type: "start_build", prompt: "x".repeat(7_000) }),
    );
    expect(parsed.action?.type).toBe("start_build");
    expect(parsed.action && "prompt" in parsed.action ? parsed.action.prompt.length : 0).toBe(
      6_000,
    );
  });
});
