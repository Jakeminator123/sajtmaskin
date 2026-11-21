import { describe, expect, it } from "vitest";
import { isDragExempt, keyboardNudge } from "./cube-drag";

describe("isDragExempt", () => {
  const header = document.createElement("div");
  header.innerHTML = `
    <span id="title">Titel</span>
    <button id="grip" data-cube-grip><svg id="grip-icon"></svg></button>
    <button id="btn"><svg id="btn-icon"></svg></button>
    <input id="input" />
    <textarea id="ta"></textarea>
    <a id="link" href="#">länk</a>
    <iframe id="frame"></iframe>
    <div data-no-drag><span id="nodrag"></span></div>`;
  const el = (id: string) => header.querySelector(`#${id}`);

  it("lets plain header surface and the grip start a drag", () => {
    expect(isDragExempt(header, header)).toBe(false);
    expect(isDragExempt(el("title"), header)).toBe(false);
    expect(isDragExempt(el("grip-icon"), header)).toBe(false);
  });

  it("never drags from buttons, inputs, textareas, links, iframes or opt-outs", () => {
    for (const id of ["btn-icon", "input", "ta", "link", "frame", "nodrag"]) {
      expect(isDragExempt(el(id), header)).toBe(true);
    }
  });
});

describe("keyboardNudge", () => {
  it("moves 10 px, 40 px with Shift", () => {
    expect(keyboardNudge({ key: "ArrowLeft", shiftKey: false })).toEqual({ dx: -10, dy: 0 });
    expect(keyboardNudge({ key: "ArrowDown", shiftKey: true })).toEqual({ dx: 0, dy: 40 });
    expect(keyboardNudge({ key: "a", shiftKey: false })).toBeNull();
  });
});
