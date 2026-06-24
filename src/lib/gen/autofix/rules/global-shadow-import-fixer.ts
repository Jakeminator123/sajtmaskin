/**
 * global-shadow-import-fixer — "name-guard".
 *
 * The LLM sometimes imports a **local** module under a name that shadows a
 * JavaScript/Web global, e.g.
 *
 *   import Date from "@/components/date";   // shadows the global `Date`
 *   ...
 *   const [now, setNow] = useState<Date | null>(null);
 *   setNow(new Date());                     // ← `new Date()` now constructs the
 *                                           //   imported React component, not the
 *                                           //   real Date → runtime crash + tsc error
 *
 * This is AST-based (never regex-rewrites import bodies) so it cannot emit
 * broken syntax. Two safe actions:
 *
 *   1. The shadowing binding is **not** used as a JSX component
 *      (`jsxTagRefs === 0`) → drop the binding. Any `new Date()` / `Date.now()`
 *      / `useState<Date>` references then resolve to the real global again.
 *      (This is the common hallucinated-import case.)
 *   2. The binding **is** used as a JSX component (`<Date .../>`) → rename the
 *      binding to a safe alias and rewrite only the JSX tag references; value /
 *      `new` / member / type references are left to resolve to the global.
 *
 * Scope is deliberately narrow: only **local** specifiers (`@/`, `./`, `../`).
 * Package imports that intentionally reuse a global name (e.g.
 * `import Image from "next/image"`) are never touched.
 */

import ts from "typescript";
import { createTsxSourceFile } from "./import-binding-ast";

/**
 * Globals worth guarding: commonly used as runtime values via `new X()`,
 * `X()`, or `X.method()`, so shadowing them with a local import causes real
 * runtime/typecheck breakage rather than a harmless name clash.
 */
const SHADOWABLE_GLOBALS = new Set<string>([
  "Date",
  "Map",
  "Set",
  "WeakMap",
  "WeakSet",
  "Promise",
  "Array",
  "Object",
  "Number",
  "String",
  "Boolean",
  "Symbol",
  "RegExp",
  "Error",
  "Math",
  "JSON",
  "Proxy",
  "Reflect",
  "BigInt",
  "Image",
  "Audio",
  "Event",
  "URL",
  "URLSearchParams",
  "Request",
  "Response",
  "Headers",
  "FormData",
  "Blob",
  "File",
  "Worker",
  "Notification",
]);

const LOCAL_SPEC_RE = /^(?:@\/|\.\/|\.\.\/)/;

export interface GlobalShadowFixResult {
  code: string;
  fixed: boolean;
  removed: string[];
  renamed: Array<{ from: string; to: string }>;
}

/**
 * Collects every identifier name that appears anywhere in the file —
 * declarations AND references AND property names. Used as the "taken" set when
 * picking a safe alias.
 *
 * The original implementation only scanned import bindings, so an alias like
 * `DateView` could still collide with a local `function DateView()` /
 * `const DateView` / `type DateView` / `class DateView` already present in the
 * file, producing a duplicate-binding compile error. Scanning all identifiers
 * guarantees the chosen alias clashes with nothing.
 */
function collectTakenNames(sf: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) names.add(node.text);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return names;
}

/**
 * True when `node` is the head (left-most) identifier of a property-access
 * chain that is used as a JSX tag name, e.g. `Date` in `<Date.Icon />` or
 * `<Date.Sub.Icon />`. Such a binding IS used as a component (its member is
 * rendered) and therefore must be aliased, not dropped — dropping it would
 * leave `<Date.Icon />` resolving to the (member-less) global `Date`.
 *
 * A value-position member access like `Date.now()` is deliberately NOT matched:
 * there the global static is the intended target, so the import is still safe
 * to remove.
 */
function isJsxTagMemberHead(node: ts.Identifier): boolean {
  let cur: ts.Node = node;
  let parent: ts.Node | undefined = node.parent;
  while (parent && ts.isPropertyAccessExpression(parent) && parent.expression === cur) {
    cur = parent;
    parent = parent.parent;
  }
  return (
    !!parent &&
    (ts.isJsxOpeningElement(parent) ||
      ts.isJsxSelfClosingElement(parent) ||
      ts.isJsxClosingElement(parent)) &&
    parent.tagName === cur
  );
}

/**
 * Counts references to `name` outside import declarations. Distinguishes JSX
 * tag references (`<name .../>`) from everything else (value, `new`, member,
 * type). Property names (`obj.name`, `{ name: ... }`) are not counted.
 */
function analyzeUsage(
  sf: ts.SourceFile,
  name: string,
): { total: number; jsxTagRefs: number; jsxMemberHeadRefs: number } {
  let total = 0;
  let jsxTagRefs = 0;
  let jsxMemberHeadRefs = 0;

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) return; // skip the import itself
    if (ts.isIdentifier(node) && node.text === name) {
      const p = node.parent;
      const isPropertyName =
        !!p &&
        ((ts.isPropertyAccessExpression(p) && p.name === node) ||
          (ts.isPropertyAssignment(p) && p.name === node) ||
          (ts.isShorthandPropertyAssignment(p) && p.name === node) ||
          (ts.isQualifiedName(p) && p.right === node) ||
          (ts.isPropertySignature(p) && p.name === node) ||
          (ts.isBindingElement(p) && p.propertyName === node));
      if (!isPropertyName) {
        total += 1;
        const isJsxTag =
          !!p &&
          (ts.isJsxOpeningElement(p) ||
            ts.isJsxSelfClosingElement(p) ||
            ts.isJsxClosingElement(p)) &&
          p.tagName === node;
        if (isJsxTag) jsxTagRefs += 1;
        else if (isJsxTagMemberHead(node)) jsxMemberHeadRefs += 1;
      }
    }
    ts.forEachChild(node, visit);
  };

  ts.forEachChild(sf, visit);
  return { total, jsxTagRefs, jsxMemberHeadRefs };
}

function makeAlias(name: string, taken: Set<string>): string {
  const suffixes = ["View", "Component", "Cmp", "Comp", "Local"];
  for (const suffix of suffixes) {
    const candidate = `${name}${suffix}`;
    if (!taken.has(candidate) && !SHADOWABLE_GLOBALS.has(candidate)) return candidate;
  }
  let i = 2;
  while (taken.has(`${name}View${i}`)) i += 1;
  return `${name}View${i}`;
}

function rebuildImportClause(
  node: ts.ImportDeclaration,
  removeNames: Set<string>,
  renameMap: Map<string, string>,
): ts.ImportDeclaration | undefined {
  const ic = node.importClause;
  if (!ic) return node;
  let changed = false;

  let newDefault = ic.name;
  if (ic.name) {
    if (removeNames.has(ic.name.text)) {
      newDefault = undefined;
      changed = true;
    } else if (renameMap.has(ic.name.text)) {
      newDefault = ts.factory.createIdentifier(renameMap.get(ic.name.text)!);
      changed = true;
    }
  }

  let newNamed: ts.NamedImportBindings | undefined = ic.namedBindings;
  if (ic.namedBindings && ts.isNamedImports(ic.namedBindings)) {
    const kept: ts.ImportSpecifier[] = [];
    for (const el of ic.namedBindings.elements) {
      const local = el.name.text;
      if (removeNames.has(local)) {
        changed = true;
        continue;
      }
      if (renameMap.has(local)) {
        const imported = el.propertyName ?? el.name;
        kept.push(
          ts.factory.updateImportSpecifier(
            el,
            el.isTypeOnly,
            ts.factory.createIdentifier(imported.text),
            ts.factory.createIdentifier(renameMap.get(local)!),
          ),
        );
        changed = true;
      } else {
        kept.push(el);
      }
    }
    newNamed = kept.length === 0 ? undefined : ts.factory.updateNamedImports(ic.namedBindings, kept);
  }

  if (!changed) return node;
  if (!newDefault && !newNamed) return undefined; // whole import removed

  const newIc = ts.factory.updateImportClause(ic, ic.isTypeOnly, newDefault, newNamed);
  const attributes = (node as ts.ImportDeclaration & { attributes?: ts.ImportAttributes })
    .attributes;
  return ts.factory.updateImportDeclaration(
    node,
    node.modifiers,
    newIc,
    node.moduleSpecifier,
    attributes ?? node.assertClause,
  );
}

function withJsxTagName<T extends ts.JsxOpeningElement | ts.JsxSelfClosingElement | ts.JsxClosingElement>(
  node: T,
  newTag: ts.JsxTagNameExpression,
): T {
  if (ts.isJsxSelfClosingElement(node)) {
    return ts.factory.updateJsxSelfClosingElement(node, newTag, node.typeArguments, node.attributes) as T;
  }
  if (ts.isJsxOpeningElement(node)) {
    return ts.factory.updateJsxOpeningElement(node, newTag, node.typeArguments, node.attributes) as T;
  }
  return ts.factory.updateJsxClosingElement(node, newTag) as T;
}

/** Leftmost identifier of a JSX tag name (`Date` in `<Date.Sub.Icon />`). */
function leftmostTagIdentifier(tag: ts.JsxTagNameExpression): ts.Identifier | null {
  let cur: ts.Node = tag;
  while (ts.isPropertyAccessExpression(cur)) cur = cur.expression;
  return ts.isIdentifier(cur) ? cur : null;
}

/**
 * Rewrites only the head identifier of a JSX member tag, keeping the chain
 * (`<Date.Sub.Icon/>` -> `<Alias.Sub.Icon/>`). Returns a plain
 * `PropertyAccessExpression`; the call site casts it to the JSX-branded
 * `JsxTagNameExpression` (the node is structurally a valid JSX tag name).
 */
function renameJsxTagMemberHead(
  tag: ts.PropertyAccessExpression,
  newHead: string,
): ts.PropertyAccessExpression {
  const newExpr = ts.isPropertyAccessExpression(tag.expression)
    ? renameJsxTagMemberHead(tag.expression, newHead)
    : ts.factory.createIdentifier(newHead);
  return ts.factory.updatePropertyAccessExpression(tag, newExpr, tag.name);
}

export function fixGlobalShadowingImports(code: string, filePath: string): GlobalShadowFixResult {
  const noop: GlobalShadowFixResult = { code, fixed: false, removed: [], renamed: [] };
  if (!/\.(tsx?|jsx?)$/i.test(filePath)) return noop;

  const sf = createTsxSourceFile(filePath, code);

  // 1. Find candidate bindings: local specifier + name that shadows a global.
  const candidateNames: string[] = [];
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st)) continue;
    if (!ts.isStringLiteral(st.moduleSpecifier)) continue;
    if (!LOCAL_SPEC_RE.test(st.moduleSpecifier.text)) continue;
    const ic = st.importClause;
    if (!ic) continue;
    if (ic.name && SHADOWABLE_GLOBALS.has(ic.name.text)) candidateNames.push(ic.name.text);
    if (ic.namedBindings && ts.isNamedImports(ic.namedBindings)) {
      for (const el of ic.namedBindings.elements) {
        if (SHADOWABLE_GLOBALS.has(el.name.text)) candidateNames.push(el.name.text);
      }
    }
  }
  if (candidateNames.length === 0) return noop;

  // 2. Decide per candidate: remove (not used as JSX) or rename (used as a JSX
  //    component, either as a plain tag `<Date/>` or as a member tag head
  //    `<Date.Icon/>`). Aliases avoid colliding with ANY identifier in the file.
  const removeNames = new Set<string>();
  const renameMap = new Map<string, string>();
  const taken = collectTakenNames(sf);
  for (const name of candidateNames) {
    if (removeNames.has(name) || renameMap.has(name)) continue;
    const usage = analyzeUsage(sf, name);
    if (usage.jsxTagRefs === 0 && usage.jsxMemberHeadRefs === 0) {
      removeNames.add(name);
    } else {
      const alias = makeAlias(name, taken);
      taken.add(alias);
      renameMap.set(name, alias);
    }
  }
  if (removeNames.size === 0 && renameMap.size === 0) return noop;

  // 3. Transform: prune/rename imports + rewrite JSX tag references.
  const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
    const visit = (node: ts.Node): ts.Node | undefined => {
      if (ts.isImportDeclaration(node)) {
        return rebuildImportClause(node, removeNames, renameMap);
      }
      if (
        ts.isJsxOpeningElement(node) ||
        ts.isJsxSelfClosingElement(node) ||
        ts.isJsxClosingElement(node)
      ) {
        const tag = node.tagName;
        if (ts.isIdentifier(tag) && renameMap.has(tag.text)) {
          const renamed = withJsxTagName(node, ts.factory.createIdentifier(renameMap.get(tag.text)!));
          return ts.visitEachChild(renamed, visit, context);
        }
        if (ts.isPropertyAccessExpression(tag)) {
          const head = leftmostTagIdentifier(tag);
          if (head && renameMap.has(head.text)) {
            const newTag = renameJsxTagMemberHead(tag, renameMap.get(head.text)!) as ts.JsxTagNameExpression;
            const renamed = withJsxTagName(node, newTag);
            return ts.visitEachChild(renamed, visit, context);
          }
        }
      }
      return ts.visitEachChild(node, visit, context);
    };
    return (root) => ts.visitNode(root, visit) as ts.SourceFile;
  };

  const result = ts.transform(sf, [transformer]);
  const transformed = result.transformed[0] as ts.SourceFile;
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed, removeComments: false });
  const out = printer.printFile(transformed);
  result.dispose();

  return {
    code: out.endsWith("\n") || code.endsWith("\n") ? out : `${out}\n`,
    fixed: true,
    removed: [...removeNames],
    renamed: [...renameMap].map(([from, to]) => ({ from, to })),
  };
}
