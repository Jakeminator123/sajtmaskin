import { describe, expect, it } from "vitest";

const PROTECTED_POLICY_PATHS = [
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "next.config.mjs",
  "tailwind.config.ts",
  ".env.local",
  "config/.env.production",
  "certs/server.pem",
];

import { parseOpenClawMessage } from "./text-field-actions";
import {
  OPENCLAW_QUICK_EDIT_MAX_OPS,
  OPENCLAW_QUICK_EDIT_MAX_TOTAL_CHARS,
  describeOpenClawQuickEditOp,
  parseOpenClawApplyQuickEditAction,
  validateOpenClawApplyQuickEditAction,
} from "./quick-edit-action";

function wrapAction(json: string): string {
  return ["Jag föreslår en liten ändring.", "<openclaw-action>", json, "</openclaw-action>"].join(
    "\n",
  );
}

describe("parseOpenClawMessage — apply_quick_edit action", () => {
  it("parses a valid apply_quick_edit action block", () => {
    const content = wrapAction(
      JSON.stringify({
        type: "apply_quick_edit",
        label: "Byt rubriken",
        reason: "Stavfel i hero-rubriken",
        ops: [
          {
            kind: "replace_text",
            path: "app/page.tsx",
            find: "Välkomen",
            replace: "Välkommen",
            occurrence: 1,
          },
          { kind: "delete_file", path: "components/unused.tsx" },
        ],
      }),
    );

    const parsed = parseOpenClawMessage(content);
    expect(parsed.hasIncompleteAction).toBe(false);
    expect(parsed.visibleContent).toContain("Jag föreslår en liten ändring.");
    expect(parsed.action).toEqual({
      type: "apply_quick_edit",
      label: "Byt rubriken",
      reason: "Stavfel i hero-rubriken",
      ops: [
        {
          kind: "replace_text",
          path: "app/page.tsx",
          find: "Välkomen",
          replace: "Välkommen",
          occurrence: 1,
        },
        { kind: "delete_file", path: "components/unused.tsx" },
      ],
    });
  });

  it("parses a replace_content op and trims label/reason", () => {
    const parsed = parseOpenClawApplyQuickEditAction({
      type: "apply_quick_edit",
      label: "  Ny footer  ",
      reason: "  Kortare copyrightrad  ",
      ops: [{ kind: "replace_content", path: "components/footer.tsx", content: "export {}\n" }],
    });

    expect(parsed).toEqual({
      type: "apply_quick_edit",
      label: "Ny footer",
      reason: "Kortare copyrightrad",
      ops: [{ kind: "replace_content", path: "components/footer.tsx", content: "export {}\n" }],
    });
  });

  it("rejects an unknown op kind (delete_jsx_node is not allowed from OpenClaw)", () => {
    const raw = {
      type: "apply_quick_edit",
      ops: [{ kind: "delete_jsx_node", path: "app/page.tsx", lineNumber: 4, tagName: "div" }],
    };
    const validation = validateOpenClawApplyQuickEditAction(raw);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.error).toContain('okänd op-typ "delete_jsx_node"');
    }
    expect(parseOpenClawMessage(wrapAction(JSON.stringify(raw))).action).toBeNull();
  });

  it("rejects too many ops", () => {
    const raw = {
      type: "apply_quick_edit",
      ops: Array.from({ length: OPENCLAW_QUICK_EDIT_MAX_OPS + 1 }, (_, i) => ({
        kind: "delete_file",
        path: `components/extra-${i}.tsx`,
      })),
    };
    const validation = validateOpenClawApplyQuickEditAction(raw);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.error).toBe(
        `För många ops: ${OPENCLAW_QUICK_EDIT_MAX_OPS + 1} (max ${OPENCLAW_QUICK_EDIT_MAX_OPS}).`,
      );
    }
    expect(parseOpenClawMessage(wrapAction(JSON.stringify(raw))).action).toBeNull();
  });

  it.each(["../escape.tsx", "app/../../secret.ts", "/etc/passwd", "C:/windows/app.tsx"])(
    "rejects unsafe path %s",
    (path) => {
      const raw = {
        type: "apply_quick_edit",
        ops: [{ kind: "replace_content", path, content: "x" }],
      };
      const validation = validateOpenClawApplyQuickEditAction(raw);
      expect(validation.ok).toBe(false);
      if (!validation.ok) {
        expect(validation.error).toContain("ogiltig sökväg");
      }
      expect(parseOpenClawMessage(wrapAction(JSON.stringify(raw))).action).toBeNull();
    },
  );

  it("rejects a backslash path with .. traversal (normalized before the check)", () => {
    const validation = validateOpenClawApplyQuickEditAction({
      type: "apply_quick_edit",
      ops: [{ kind: "delete_file", path: "..\\escape.tsx" }],
    });
    expect(validation.ok).toBe(false);
  });

  // Policy-stopp (Bugbot): OC-lanen är striktare än serverns guards — struktur-/
  // beroendefiler (som kodvyn medvetet tillåter) och secrets/lockfiler får
  // aldrig nå ett godkännandekort från Sajtagenten.
  it.each(PROTECTED_POLICY_PATHS)("rejects protected policy path %s", (path) => {
    const raw = {
      type: "apply_quick_edit",
      ops: [{ kind: "replace_content", path, content: "x" }],
    };
    const validation = validateOpenClawApplyQuickEditAction(raw);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.error).toContain("skyddad fil");
    }
    expect(parseOpenClawMessage(wrapAction(JSON.stringify(raw))).action).toBeNull();
  });

  it("still allows ordinary app files next to the policy stop", () => {
    const validation = validateOpenClawApplyQuickEditAction({
      type: "apply_quick_edit",
      ops: [{ kind: "replace_text", path: "app/page.tsx", find: "a", replace: "b" }],
    });
    expect(validation.ok).toBe(true);
  });

  // delete_file använder serverns fulla raderingspredikat: nödvändiga
  // projektfiler (app/page.tsx m.fl.) ska stoppas redan i förfiltret i
  // stället för att faila efter godkännande (Bugbot).
  it.each(["app/page.tsx", "app/layout.tsx", "src/app/globals.css", "next-env.d.ts"])(
    "rejects delete_file on essential project file %s",
    (path) => {
      const validation = validateOpenClawApplyQuickEditAction({
        type: "apply_quick_edit",
        ops: [{ kind: "delete_file", path }],
      });
      expect(validation.ok).toBe(false);
      if (!validation.ok) {
        expect(validation.error).toContain("skyddad eller nödvändig fil");
      }
    },
  );

  it("still allows delete_file on an ordinary component", () => {
    const validation = validateOpenClawApplyQuickEditAction({
      type: "apply_quick_edit",
      ops: [{ kind: "delete_file", path: "components/unused.tsx" }],
    });
    expect(validation.ok).toBe(true);
  });

  it("normalizes backslash paths to forward slashes at parse time", () => {
    const validation = validateOpenClawApplyQuickEditAction({
      type: "apply_quick_edit",
      ops: [
        { kind: "replace_content", path: "components\\footer.tsx", content: "x" },
      ],
    });
    expect(validation.ok).toBe(true);
    if (validation.ok) {
      expect(validation.action.ops[0]?.path).toBe("components/footer.tsx");
    }
  });

  it("rejects oversized total content across ops", () => {
    const half = "a".repeat(Math.ceil(OPENCLAW_QUICK_EDIT_MAX_TOTAL_CHARS / 2) + 1);
    const raw = {
      type: "apply_quick_edit",
      ops: [
        { kind: "replace_content", path: "app/a.tsx", content: half },
        { kind: "replace_text", path: "app/b.tsx", find: half, replace: "" },
      ],
    };
    const validation = validateOpenClawApplyQuickEditAction(raw);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.error).toContain("För stor total textmängd");
    }
    expect(parseOpenClawMessage(wrapAction(JSON.stringify(raw))).action).toBeNull();
  });

  it("rejects an empty ops array and missing required op fields", () => {
    expect(
      validateOpenClawApplyQuickEditAction({ type: "apply_quick_edit", ops: [] }).ok,
    ).toBe(false);
    expect(
      validateOpenClawApplyQuickEditAction({
        type: "apply_quick_edit",
        ops: [{ kind: "replace_text", path: "app/page.tsx", find: "", replace: "x" }],
      }).ok,
    ).toBe(false);
    expect(
      validateOpenClawApplyQuickEditAction({
        type: "apply_quick_edit",
        ops: [{ kind: "replace_content", path: "app/page.tsx" }],
      }).ok,
    ).toBe(false);
  });

  it("drops an invalid occurrence instead of forwarding it", () => {
    const parsed = parseOpenClawApplyQuickEditAction({
      type: "apply_quick_edit",
      ops: [
        { kind: "replace_text", path: "app/page.tsx", find: "a", replace: "b", occurrence: -2 },
      ],
    });
    expect(parsed?.ops[0]).toEqual({
      kind: "replace_text",
      path: "app/page.tsx",
      find: "a",
      replace: "b",
    });
  });

  it("describes op kinds in Swedish for the approval card", () => {
    expect(
      describeOpenClawQuickEditOp({ kind: "replace_content", path: "a.tsx", content: "" }),
    ).toBe("ersätt filinnehåll");
    expect(
      describeOpenClawQuickEditOp({ kind: "replace_text", path: "a.tsx", find: "a", replace: "" }),
    ).toBe("ersätt text");
    expect(describeOpenClawQuickEditOp({ kind: "delete_file", path: "a.tsx" })).toBe(
      "ta bort fil",
    );
  });

  it("still parses a request_repair action (regression)", () => {
    const parsed = parseOpenClawMessage(
      wrapAction('{"type":"request_repair","label":"Laga fel"}'),
    );
    expect(parsed.action?.type).toBe("request_repair");
  });
});
