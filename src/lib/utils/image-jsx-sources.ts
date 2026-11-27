import ts from "typescript";
import { createTsxSourceFile } from "@/lib/gen/autofix/rules/import-binding-ast";

export type ImageSourceSpan = {
  url: string;
  alt: string;
  start: number;
  end: number;
  attributeQuote?: string;
  legacyScalar?: true;
};

function isolatedChecker(source: ts.SourceFile): ts.TypeChecker {
  const host: ts.CompilerHost = {
    getSourceFile: (name) => name === source.fileName ? source : undefined,
    getDefaultLibFileName: () => "",
    writeFile: () => undefined,
    getCurrentDirectory: () => "/",
    getCanonicalFileName: (name) => name,
    fileExists: (name) => name === source.fileName,
    readFile: (name) => name === source.fileName ? source.text : undefined,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
  };
  return ts.createProgram([source.fileName], {
    noLib: true, noResolve: true, allowJs: true, jsx: ts.JsxEmit.Preserve,
  }, host).getTypeChecker();
}

function unwrap(expression: ts.Expression): ts.Expression {
  while (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression)) {
    expression = expression.expression;
  }
  return expression;
}

function jsxAttribute(node: ts.JsxOpeningLikeElement, name: string): ts.JsxAttribute | undefined {
  return node.attributes.properties.find(
    (property): property is ts.JsxAttribute => ts.isJsxAttribute(property) && ts.isIdentifier(property.name) && property.name.text === name,
  );
}

/** Rewrite the image use site while leaving the value available to links and videos. */
export function collectJsxImageSources(file: { name: string; content: string }): ImageSourceSpan[] {
  const source = createTsxSourceFile(`/image-source.${file.name.split(".").pop()}`, file.content);
  const refs: ImageSourceSpan[] = [];
  const elements: ts.JsxOpeningLikeElement[] = [];
  const identifiers: ts.Identifier[] = [];
  const declarations: ts.VariableDeclaration[] = [];

  function visit(node: ts.Node) {
    if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
        ts.isIdentifier(node.tagName) && (node.tagName.text === "img" || node.tagName.text === "Image")) {
      elements.push(node);
    }
    if (ts.isIdentifier(node)) identifiers.push(node);
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isIdentifier(node.name) &&
        /(?:image|photo|picture|thumbnail|poster|logo)(?:url|src)?$/i.test(node.name.text)) {
      declarations.push(node);
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  let checker: ts.TypeChecker | undefined;
  let usages: Map<ts.Symbol, ts.Identifier[]> | undefined;

  function symbolAt(identifier: ts.Identifier) {
    checker ??= isolatedChecker(source);
    // In a shorthand or export specifier, resolve the underlying local value.
    if (ts.isShorthandPropertyAssignment(identifier.parent) && identifier.parent.name === identifier) {
      return checker.getShorthandAssignmentValueSymbol(identifier.parent);
    }
    if (ts.isExportSpecifier(identifier.parent)) return checker.getExportSpecifierLocalTargetSymbol(identifier.parent);
    return checker.getSymbolAtLocation(identifier);
  }

  function referencesFor(symbol: ts.Symbol): ts.Identifier[] {
    if (!usages) {
      usages = new Map();
      for (const id of identifiers) {
        const ref = symbolAt(id);
        if (ref) {
          const existing = usages.get(ref);
          if (existing) existing.push(id);
          else usages.set(ref, [id]);
        }
      }
    }
    return usages.get(symbol) ?? [];
  }

  function constant(identifier: ts.Identifier) {
    const symbol = symbolAt(identifier);
    const declaration = symbol?.valueDeclaration;
    if (!symbol || symbol.declarations?.length !== 1 || !declaration || !ts.isVariableDeclaration(declaration) ||
        !declaration.initializer || !ts.isIdentifier(declaration.name) || declaration.end > identifier.getStart(source) ||
        !ts.isVariableDeclarationList(declaration.parent) || !(declaration.parent.flags & ts.NodeFlags.Const)) return undefined;
    return { symbol, declaration, value: unwrap(declaration.initializer) };
  }

  // A const object can still be reassigned through an alias, or have mutable
  // fields. Only follow plain records used as property reads in JSX.
  function readonlyObject(binding: NonNullable<ReturnType<typeof constant>>): boolean {
    const statement = binding.declaration.parent.parent;
    if (ts.isVariableStatement(statement) && statement.modifiers?.some((mod) => mod.kind === ts.SyntaxKind.ExportKeyword)) {
      return false;
    }
    return referencesFor(binding.symbol).every((id) => {
      if (id === binding.declaration.name) return true;
      let access: ts.Node = id.parent;
      if ((!ts.isPropertyAccessExpression(access) && !ts.isElementAccessExpression(access)) || access.expression !== id) return false;
      while ((ts.isParenthesizedExpression(access.parent) || ts.isAsExpression(access.parent) ||
              ts.isSatisfiesExpression(access.parent)) && access.parent.expression === access) {
        access = access.parent;
      }
      return ts.isJsxExpression(access.parent);
    });
  }

  function staticString(input: ts.Expression, depth = 0): string | undefined {
    if (depth > 4) return undefined;
    const expression = unwrap(input);
    if (ts.isStringLiteralLike(expression)) return expression.text;
    if (ts.isIdentifier(expression)) {
      const binding = constant(expression);
      return binding ? staticString(binding.value, depth + 1) : undefined;
    }

    const key = ts.isPropertyAccessExpression(expression) ? expression.name.text :
      ts.isElementAccessExpression(expression) && ts.isStringLiteralLike(expression.argumentExpression)
        ? expression.argumentExpression.text : undefined;
    if ((!ts.isPropertyAccessExpression(expression) && !ts.isElementAccessExpression(expression)) ||
        !key || !ts.isIdentifier(expression.expression)) return undefined;

    const binding = constant(expression.expression);
    if (!binding || !ts.isObjectLiteralExpression(binding.value) || !readonlyObject(binding)) return undefined;
    const fields = new Map<string, ts.Expression>();
    for (const property of binding.value.properties) {
      if (ts.isShorthandPropertyAssignment(property)) fields.set(property.name.text, property.name);
      else if (ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name))) {
        fields.set(property.name.text, property.initializer);
      } else return undefined;
    }
    const fieldValue = fields.get(key);
    return fieldValue ? staticString(fieldValue, depth + 1) : undefined;
  }

  for (const element of elements) {
    const src = jsxAttribute(element, "src");
    const initializer = src?.initializer;
    if (!src || !initializer) continue;
    // A later spread can override this source at runtime.
    const attributes = element.attributes.properties;
    if (attributes.slice(attributes.indexOf(src) + 1).some(
      (property) => ts.isJsxSpreadAttribute(property) ||
        (ts.isIdentifier(property.name) && property.name.text === "src"),
    )) continue;

    const altNode = jsxAttribute(element, "alt")?.initializer;
    const altExpression = altNode && ts.isJsxExpression(altNode) ? altNode.expression : altNode;
    const expression = ts.isJsxExpression(initializer) ? initializer.expression : initializer;
    if (!expression) continue;
    const url = staticString(expression);
    if (url) {
      refs.push({
        url, alt: altExpression ? (staticString(altExpression) ?? "") : "",
        start: expression.getStart(source), end: expression.end,
        ...(ts.isStringLiteral(initializer) ? { attributeQuote: file.content[initializer.getStart(source)] } : {}),
      });
    }
  }

  // Preserve replay for a standalone legacy scalar only when it has no
  // consumers. An actual JSX binding is always handled above at the use site.
  for (const declaration of declarations) {
    if (!declaration.initializer || !ts.isIdentifier(declaration.name) ||
        !ts.isStringLiteralLike(declaration.initializer) ||
        !ts.isVariableDeclarationList(declaration.parent) || !(declaration.parent.flags & ts.NodeFlags.Const)) continue;
    const statement = declaration.parent.parent;
    if (ts.isVariableStatement(statement) && statement.modifiers?.some((mod) => mod.kind === ts.SyntaxKind.ExportKeyword)) continue;
    const symbol = symbolAt(declaration.name);
    if (!symbol || referencesFor(symbol).some((id) => id !== declaration.name)) continue;
    refs.push({
      url: declaration.initializer.text, alt: "", legacyScalar: true,
      start: declaration.initializer.getStart(source), end: declaration.initializer.end,
    });
  }

  return refs;
}
