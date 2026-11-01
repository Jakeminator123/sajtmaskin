/** String and expression access for the SEO metadata pass. One AST owner for
 * audits, copy rewrites and deterministic enrichment; punctuation inside a
 * literal must never be mistaken for an object-property separator. */
import ts from "typescript";

export type MetadataStringRead =
  { kind: "literal"; value: string } | { kind: "dynamic" } | { kind: "missing" };

type MetadataObject = { file: ts.SourceFile; object: ts.ObjectLiteralExpression };

function unwrap(expression: ts.Expression): ts.Expression {
  while (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isNonNullExpression(expression)
  ) {
    expression = expression.expression;
  }
  return expression;
}

function parseMetadata(source: string, allowFunction = true): MetadataObject | null {
  const file = ts.createSourceFile(
    "layout.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  for (const statement of file.statements) {
    if (
      !ts.canHaveModifiers(statement) ||
      !ts.getModifiers(statement)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    )
      continue;
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (
          !ts.isIdentifier(declaration.name) ||
          declaration.name.text !== "metadata" ||
          !declaration.initializer
        )
          continue;
        const object = unwrap(declaration.initializer);
        return ts.isObjectLiteralExpression(object) ? { file, object } : null;
      }
    }
    if (
      allowFunction &&
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === "generateMetadata" &&
      statement.body
    ) {
      let object: ts.ObjectLiteralExpression | undefined;
      const visit = (node: ts.Node) => {
        if (object || (ts.isFunctionLike(node) && node !== statement)) return;
        if (ts.isReturnStatement(node) && node.expression) {
          const value = unwrap(node.expression);
          if (ts.isObjectLiteralExpression(value)) object = value;
          return;
        }
        ts.forEachChild(node, visit);
      };
      visit(statement.body);
      return object ? { file, object } : null;
    }
  }
  return null;
}

function propertyName(property: ts.ObjectLiteralElementLike): string | null {
  const name = property.name;
  return name && (ts.isIdentifier(name) || ts.isStringLiteral(name)) ? name.text : null;
}

function property(metadata: MetadataObject, key: string) {
  // Last explicit property wins, as it does at runtime. Spreads remain intact.
  return [...metadata.object.properties].reverse().find((p) => propertyName(p) === key);
}

export function findMetadataObject(source: string): { start: number; end: number } | null {
  const metadata = parseMetadata(source);
  return metadata
    ? { start: metadata.object.getStart(metadata.file), end: metadata.object.end }
    : null;
}

export function hasMetadataKeys(source: string, keys: readonly string[]): boolean {
  const metadata = parseMetadata(source, false);
  return metadata !== null && keys.every((key) => property(metadata, key) !== undefined);
}

export function readMetadataString(source: string, key: string): MetadataStringRead {
  const metadata = parseMetadata(source);
  const entry = metadata && property(metadata, key);
  if (!entry) return { kind: "missing" };
  if (!ts.isPropertyAssignment(entry)) return { kind: "dynamic" };
  const value = unwrap(entry.initializer);
  return ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)
    ? { kind: "literal", value: value.text }
    : { kind: "dynamic" };
}

/** Complete expression, never a regex prefix. Shorthand values are expressions too. */
export function readMetadataExpression(source: string, key: string, fallback: string): string {
  const metadata = parseMetadata(source, false);
  const entry = metadata && property(metadata, key);
  if (!metadata || !entry) return fallback;
  if (ts.isShorthandPropertyAssignment(entry)) return entry.name.getText(metadata.file);
  if (ts.isPropertyAssignment(entry)) return `(${entry.initializer.getText(metadata.file)})`;
  return fallback;
}

export function toSafeStringLiteral(value: string): string {
  return JSON.stringify(value)
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function insertProperties(
  source: string,
  metadata: MetadataObject,
  entries: [string, string][],
): string {
  if (!entries.length) return source;
  const open = metadata.object.getStart(metadata.file);
  const rest = source.slice(open + 1);
  return (
    source.slice(0, open + 1) +
    "\n" +
    entries.map(([key, value]) => `  ${key}: ${value},`).join("\n") +
    (/^\r?\n/.test(rest) ? "" : "\n") +
    rest
  );
}

/** Fill absent fields without replacing project metadata, comments or spreads.
 * Defaults precede original properties so even unknown spread fields keep their precedence. */
export function addMetadataDefaults(source: string, defaults: Record<string, string>): string {
  const metadata = parseMetadata(source, false);
  if (!metadata) return source;
  return insertProperties(
    source,
    metadata,
    Object.entries(defaults).filter(([key]) => !property(metadata, key)),
  );
}

export function writeMetadataString(source: string, key: string, value: string): string {
  const metadata = parseMetadata(source);
  if (!metadata) return source;
  const entry = property(metadata, key);
  if (!entry) return insertProperties(source, metadata, [[key, toSafeStringLiteral(value)]]);
  if (!ts.isPropertyAssignment(entry)) return source;
  const expression = unwrap(entry.initializer);
  if (!ts.isStringLiteral(expression) && !ts.isNoSubstitutionTemplateLiteral(expression))
    return source;
  return (
    source.slice(0, entry.initializer.getStart(metadata.file)) +
    toSafeStringLiteral(value) +
    source.slice(entry.initializer.end)
  );
}
