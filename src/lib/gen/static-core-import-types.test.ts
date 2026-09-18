import { describe, expect, it } from "vitest";

import { getStaticCoreFromWorkspace } from "./static-core-loader";

/**
 * Guards the assembled static core against re-introducing the 01/04
 * contradiction where `FormEvent` was listed among DOM globals that are "not
 * imported" while 04 required `import type { FormEvent } from "react"`.
 *
 * DOM *element* types (`HTMLFormElement`) are TypeScript globals; React
 * *event* types (`FormEvent`, `MouseEvent`, `ChangeEvent`) must be imported as
 * types from "react". Every core line that names a React event type has to say
 * the same thing.
 */
describe("static core import-type contract (DOM element types vs React event types)", () => {
  const core = getStaticCoreFromWorkspace();
  const lines = core.split("\n");
  const reactEventTypeLine = /\b(FormEvent|ChangeEvent|KeyboardEvent)\b/;

  it("requires React event types to be type-imported from react", () => {
    expect(core).toContain('import type { FormEvent } from "react"');
    expect(core).toContain("React types are `import type`");
  });

  it("never groups React event types with globals that must not be imported", () => {
    const contradictory = lines.filter(
      (line) =>
        reactEventTypeLine.test(line) &&
        /\b(not imported|never import|DOM globals|TypeScript globals)\b/.test(line),
    );
    expect(contradictory).toEqual([]);
  });

  it("says the same thing on every line that names a React event type", () => {
    const mentions = lines.filter((line) => reactEventTypeLine.test(line));
    expect(mentions.length).toBeGreaterThan(0);
    for (const line of mentions) {
      expect(line, line).toMatch(/import type|from "react"/);
    }
  });

  it("keeps the DOM element-type rule: globals, never imported, never JSX tags", () => {
    const domRule = lines.find(
      (line) => line.includes("HTMLFormElement") && line.includes("never import them"),
    );
    expect(domRule).toBeDefined();
    expect(domRule).toContain("`<HTMLFormElement>`");
    expect(domRule).toContain("`<form>`");
    expect(domRule).not.toMatch(reactEventTypeLine);
  });
});
