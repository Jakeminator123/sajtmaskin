import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyOpenClawTextFieldAction,
  collectOpenClawTextFieldContext,
  parseOpenClawMessage,
} from "./text-field-actions";
import { validateOpenClawApplyQuickEditAction } from "./quick-edit-action";

function actionMessage(intro: string, payload: string): string {
  return `${intro}\n\n<openclaw-action>\n${payload}\n</openclaw-action>`;
}

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
      submit: false,
    });
    expect(parsed.hasIncompleteAction).toBe(false);
    expect(parsed.actionError).toBeNull();
  });

  it("hides incomplete action blocks from the visible assistant text", () => {
    const parsed = parseOpenClawMessage(`Jag kan fylla fältet åt dig.

<openclaw-action>
{"type":"fill_text_field","target":"landing.freeform.primary","value":"Utkast`);

    expect(parsed.visibleContent).toBe("Jag kan fylla fältet åt dig.");
    expect(parsed.action).toBeNull();
    expect(parsed.hasIncompleteAction).toBe(true);
    // Ett halvskrivet block strömmar fortfarande in — det är inte ett fel.
    expect(parsed.actionError).toBeNull();
  });

  it("strips every complete action block and only honours the first", () => {
    const parsed = parseOpenClawMessage(
      [
        "Jag bekräftar mandatet.",
        "",
        "<openclaw-action>",
        `{"type":"start_bug_hunt","mode":"followups","count":3}`,
        "</openclaw-action>",
        "",
        "Och här är första follow-upen.",
        "",
        "<openclaw-action>",
        `{"type":"fill_text_field","target":"builder.chat.primary","value":"Gör om heron","submit":true}`,
        "</openclaw-action>",
      ].join("\n"),
    );

    expect(parsed.visibleContent).toBe(
      "Jag bekräftar mandatet.\n\nOch här är första follow-upen.",
    );
    expect(parsed.visibleContent).not.toContain("openclaw-action");
    expect(parsed.visibleContent).not.toContain("fill_text_field");
    expect(parsed.action).toMatchObject({ type: "start_bug_hunt", mode: "followups", count: 3 });
    expect(parsed.actionError).toBeNull();
  });

  it("keeps a trailing half-streamed block out of the visible text", () => {
    const parsed = parseOpenClawMessage(
      [
        "Först en bekräftelse.",
        "<openclaw-action>",
        `{"type":"request_repair","label":"Laga bygget"}`,
        "</openclaw-action>",
        "Sedan skickar jag follow-upen.",
        "<openclaw-action>",
        `{"type":"fill_text_field","target":"builder.chat.primary","value":"Utka`,
      ].join("\n"),
    );

    expect(parsed.visibleContent).toBe(
      "Först en bekräftelse.\n\nSedan skickar jag follow-upen.",
    );
    expect(parsed.action).toMatchObject({ type: "request_repair" });
    expect(parsed.hasIncompleteAction).toBe(true);
  });

  it("reports a reason when the action block is not valid JSON", () => {
    const parsed = parseOpenClawMessage(
      actionMessage("Här är ett förslag.", `{"type":"fill_text_field",`),
    );

    expect(parsed.visibleContent).toBe("Här är ett förslag.");
    expect(parsed.action).toBeNull();
    expect(parsed.hasIncompleteAction).toBe(false);
    expect(parsed.actionError).toBe("Actionblocket är inte giltig JSON.");
  });

  it("reports a reason for an unknown action type", () => {
    const parsed = parseOpenClawMessage(
      actionMessage("Jag publicerar sajten.", `{"type":"deploy_site","target":"production"}`),
    );

    expect(parsed.visibleContent).toBe("Jag publicerar sajten.");
    expect(parsed.action).toBeNull();
    expect(parsed.hasIncompleteAction).toBe(false);
    expect(parsed.actionError).toBe(`Okänd action-typ "deploy_site".`);
  });

  it("passes the quick-edit validation error through verbatim for a protected path", () => {
    const payload = {
      type: "apply_quick_edit",
      label: "Uppdatera beroenden",
      ops: [{ kind: "replace_content", path: "package.json", content: "{}" }],
    };
    const validation = validateOpenClawApplyQuickEditAction(payload);
    const parsed = parseOpenClawMessage(
      actionMessage("Jag vill uppdatera beroenden.", JSON.stringify(payload)),
    );

    expect(validation.ok).toBe(false);
    expect(parsed.action).toBeNull();
    expect(parsed.actionError).toBe(validation.ok ? null : validation.error);
    expect(parsed.actionError).toContain("skyddad fil");
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

  it("refuses to write into a non-writable field", () => {
    document.body.innerHTML = `
      <textarea
        data-openclaw-text-target="builder.chat.primary"
        data-openclaw-text-label="Builderns huvudprompt"
        readonly
      >Befintligt</textarea>
    `;

    const textarea = document.querySelector("textarea");
    const inputSpy = vi.fn();
    textarea?.addEventListener("input", inputSpy);

    const result = applyOpenClawTextFieldAction({
      type: "fill_text_field",
      target: "builder.chat.primary",
      value: "Försök skriva över",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/inte skrivbart/i);
    expect(result.field?.canWrite).toBe(false);
    expect(textarea?.value).toBe("Befintligt");
    expect(inputSpy).not.toHaveBeenCalled();
  });
});
