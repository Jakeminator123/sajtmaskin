import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isOpenClawSendReady,
  parseOpenClawMessage,
  triggerOpenClawSend,
} from "./text-field-actions";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("send-target helpers", () => {
  it("reports the send button as not ready when disabled", () => {
    document.body.innerHTML = `
      <button data-openclaw-send-target="builder.chat.primary" disabled aria-label="Send message"></button>
    `;
    expect(isOpenClawSendReady("builder.chat.primary")).toBe(false);
    const result = triggerOpenClawSend("builder.chat.primary");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("not_ready");
  });

  it("clicks the send button when enabled", () => {
    document.body.innerHTML = `
      <button data-openclaw-send-target="builder.chat.primary" aria-label="Send message"></button>
    `;
    const button = document.querySelector<HTMLButtonElement>(
      "[data-openclaw-send-target]",
    )!;
    const onClick = vi.fn();
    button.addEventListener("click", onClick);
    expect(isOpenClawSendReady("builder.chat.primary")).toBe(true);
    const result = triggerOpenClawSend("builder.chat.primary");
    expect(result.ok).toBe(true);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("returns not_found for an unknown target", () => {
    const result = triggerOpenClawSend("does.not.exist");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("not_found");
  });
});

describe("parseOpenClawMessage — debug actions", () => {
  it("parses fill_text_field with submit:true", () => {
    const content = `Skickar follow-up.
<openclaw-action>
{"type":"fill_text_field","target":"builder.chat.primary","value":"Granska bilderna","submit":true}
</openclaw-action>`;
    const parsed = parseOpenClawMessage(content);
    expect(parsed.action?.type).toBe("fill_text_field");
    if (parsed.action?.type === "fill_text_field") {
      expect(parsed.action.submit).toBe(true);
      expect(parsed.action.value).toBe("Granska bilderna");
    }
  });

  it("defaults submit to false when omitted", () => {
    const content = `<openclaw-action>
{"type":"fill_text_field","target":"builder.chat.primary","value":"hej"}
</openclaw-action>`;
    const parsed = parseOpenClawMessage(content);
    if (parsed.action?.type === "fill_text_field") {
      expect(parsed.action.submit).toBe(false);
    }
  });

  it("parses a start_bug_hunt action", () => {
    const content = `Armerar.
<openclaw-action>
{"type":"start_bug_hunt","mode":"followups","count":5,"reason":"Buggranska"}
</openclaw-action>`;
    const parsed = parseOpenClawMessage(content);
    expect(parsed.action?.type).toBe("start_bug_hunt");
    if (parsed.action?.type === "start_bug_hunt") {
      expect(parsed.action.mode).toBe("followups");
      expect(parsed.action.count).toBe(5);
    }
  });
});
