import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyOpenClawTextFieldAction,
  collectOpenClawTextFieldContext,
  parseOpenClawMessage,
} from "./text-field-actions";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("text-field-actions", () => {
  it("collects only visible, explicitly marked text fields", () => {
    document.body.innerHTML = `
      <textarea
        data-openclaw-text-target="landing.freeform.primary"
        data-openclaw-text-label="Frilägesfältet på startsidan"
        placeholder="Beskriv ditt företag"
      >Hej</textarea>
      <textarea
        data-openclaw-text-target="hidden.field"
        style="display:none"
      >Dold</textarea>
      <input
        data-openclaw-text-target="builder.chat.primary"
        aria-label="Builderns huvudprompt"
        value="Nästa steg"
        readonly
      />
    `;

    const fields = collectOpenClawTextFieldContext();

    expect(fields).toHaveLength(2);
    expect(fields[0]).toMatchObject({
      target: "landing.freeform.primary",
      label: "Frilägesfältet på startsidan",
      placeholder: "Beskriv ditt företag",
      value: "Hej",
      canWrite: true,
    });
    expect(fields[1]).toMatchObject({
      target: "builder.chat.primary",
      label: "Builderns huvudprompt",
      value: "Nästa steg",
      canWrite: false,
    });
  });

  it("parses assistant action blocks and strips them from visible text", () => {
    const parsed = parseOpenClawMessage(`Här är ett förslag till frilägesfältet.

<openclaw-action>
{"type":"fill_text_field","target":"landing.freeform.primary","value":"En varm och modern salongssajt","label":"Frilägesfältet"}
</openclaw-action>`);

    expect(parsed.visibleContent).toBe("Här är ett förslag till frilägesfältet.");
    expect(parsed.action).toEqual({
      type: "fill_text_field",
      target: "landing.freeform.primary",
      value: "En varm och modern salongssajt",
      label: "Frilägesfältet",
      focus: true,
    });
    expect(parsed.hasIncompleteAction).toBe(false);
  });

  it("hides incomplete action blocks from the visible assistant text", () => {
    const parsed = parseOpenClawMessage(`Jag kan fylla fältet åt dig.

<openclaw-action>
{"type":"fill_text_field","target":"landing.freeform.primary","value":"Utkast`);

    expect(parsed.visibleContent).toBe("Jag kan fylla fältet åt dig.");
    expect(parsed.action).toBeNull();
    expect(parsed.hasIncompleteAction).toBe(true);
  });

  it("fills a marked textarea and dispatches input events", () => {
    document.body.innerHTML = `
      <textarea
        data-openclaw-text-target="landing.freeform.primary"
        data-openclaw-text-label="Frilägesfältet på startsidan"
      ></textarea>
    `;

    const textarea = document.querySelector("textarea");
    const inputSpy = vi.fn();
    textarea?.addEventListener("input", inputSpy);

    const result = applyOpenClawTextFieldAction({
      type: "fill_text_field",
      target: "landing.freeform.primary",
      value: "En modern sajt för en salong i Göteborg",
      focus: true,
    });

    expect(result.ok).toBe(true);
    expect(textarea?.value).toBe("En modern sajt för en salong i Göteborg");
    expect(inputSpy).toHaveBeenCalledTimes(1);
  });
});
