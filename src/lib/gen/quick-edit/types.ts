import type { CodeFile } from "@/lib/gen/parser";

/**
 * A single deterministic, user-directed edit. There is no prompt parsing here:
 * the caller already knows exactly which file (and, for text replacement, which
 * exact string) to change — from the code view, file tree, or a selected
 * element in the inspector.
 */
export type QuickEditOp =
  | {
      kind: "replace_content";
      path: string;
      /** Full new content for `path`. Creates the file if it does not exist. */
      content: string;
    }
  | {
      kind: "replace_text";
      path: string;
      /** Exact literal to find. Must exist in the file. */
      find: string;
      /** Replacement literal. */
      replace: string;
      /**
       * 1-based occurrence to replace when `find` is not unique. Required when
       * the file contains more than one match; otherwise the edit is rejected
       * as ambiguous (no guessing).
       */
      occurrence?: number;
    }
  | {
      kind: "delete_file";
      /**
       * File to remove from the version. Used by the preview "−" page control
       * to actually drop a route's file(s) (union-merge follow-ups never
       * delete, so without this a "removed" page lingers in the file set).
       * Essential/structural paths are refused (see `isDeletableQuickEditPath`).
       */
      path: string;
    }
  | {
      kind: "delete_jsx_node";
      path: string;
      /**
       * 1-based line holding the element's opening `<`, as reported by the
       * preview inspector bridge together with `tagName`. The complete node
       * (opening tag, children, closing tag) is removed via the AST; the edit
       * is refused when it would leave the file unparsable.
       */
      lineNumber: number;
      /** Tag at that line. `""`, `"<>"` or `"Fragment"` targets a JSX fragment. */
      tagName: string;
    };

export type QuickEditFailureReason =
  | "no_base_files"
  | "empty_ops"
  | "unsafe_path"
  | "protected_path"
  | "file_not_found"
  | "no_match"
  | "ambiguous_match"
  | "no_change"
  | "integrations_base"
  /** Base version is owned by an active verify/repair lease — retry shortly (M#qe1). */
  | "base_busy"
  /** `delete_jsx_node` against a file/locator that cannot carry a JSX node. */
  | "jsx_delete_unsupported"
  /** `delete_jsx_node` would break the component or the file's syntax. */
  | "jsx_delete_unsafe"
  /** A machine-authored op left a file less parseable than it was (syntax gate). */
  | "parse_regression";

export type QuickEditApplyResult =
  | { ok: true; files: CodeFile[]; changedPaths: string[]; removedPaths: string[] }
  | { ok: false; reason: QuickEditFailureReason; message: string };
