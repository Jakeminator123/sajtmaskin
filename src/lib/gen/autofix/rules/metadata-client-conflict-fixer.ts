/**
 * Mechanical fixer: strip `"use client"` from files that export page
 * metadata (Next.js App Router forbids that combo). Falls back to
 * removing the static metadata export when the file genuinely needs
 * client-side hooks/handlers.
 *
 * Extracted from `src/lib/gen/autofix/pipeline.ts` 2026-04-21.
 */

import type { FixEntry } from "../types";
import ts from "typescript";
import { createTsxSourceFile } from "./import-binding-ast";
import { indexIdentifierUsage } from "./type-value-position";

const CLIENT_HOOKS = new Set([
  "useState", "useEffect", "useCallback", "useMemo", "useRef", "useContext", "useReducer",
  "useTransition", "useOptimistic", "useRouter", "useSearchParams", "usePathname", "useParams",
  "useSelectedLayoutSegment", "useSelectedLayoutSegments", "useFormStatus", "useActionState",
]);
const BROWSER_GLOBALS = new Set(["window", "document", "localStorage", "sessionStorage", "navigator"]);
const HOOK_NAMESPACE_MODULES = new Set(["react", "react-dom", "next/navigation"]);

function unwrapExpression(expression: ts.Expression): ts.Expression {
  while (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) ||
         ts.isTypeAssertionExpression(expression) || ts.isNonNullExpression(expression) ||
         ts.isSatisfiesExpression(expression)) expression = expression.expression;
  return expression;
}

function memberName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  if (ts.isComputedPropertyName(name) && ts.isStringLiteral(name.expression)) return name.expression.text;
}

function isHookNamespace(expression: ts.Expression, namespaces: ReadonlySet<string>): boolean {
  const value = unwrapExpression(expression);
  if (ts.isIdentifier(value)) return namespaces.has(value.text);
  if (ts.isPropertyAccessExpression(value) && value.name.text === "default") {
    return isHookNamespace(value.expression, namespaces);
  }
  if (ts.isElementAccessExpression(value) && ts.isStringLiteral(value.argumentExpression) &&
      value.argumentExpression.text === "default") return isHookNamespace(value.expression, namespaces);
  return false;
}

function collectNamespaceAliases(sourceFile: ts.SourceFile, namespaces: Set<string>): void {
  const declarations: ts.VariableDeclaration[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isTypeNode(node) || ts.isImportDeclaration(node)) return;
    if (ts.isVariableDeclaration(node) && node.initializer) declarations.push(node);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  let previousSize: number;
  do {
    previousSize = namespaces.size;
    for (const declaration of declarations) {
      if (!declaration.initializer || !isHookNamespace(declaration.initializer, namespaces)) continue;
      if (ts.isIdentifier(declaration.name)) {
        namespaces.add(declaration.name.text);
      } else if (ts.isObjectBindingPattern(declaration.name)) {
        for (const element of declaration.name.elements) {
          if (ts.isIdentifier(element.name) &&
              (element.dotDotDotToken || (element.propertyName && memberName(element.propertyName) === "default"))) {
            namespaces.add(element.name.text);
          }
        }
      }
    }
  } while (namespaces.size !== previousSize);
}

function findClientDirective(sourceFile: ts.SourceFile): ts.ExpressionStatement | undefined {
  for (const statement of sourceFile.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) break;
    if (statement.expression.text === "use client") return statement;
  }
}

function isExported(statement: ts.VariableStatement | ts.FunctionDeclaration): boolean {
  return statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

function isMetadataDeclaration(declaration: ts.VariableDeclaration): boolean {
  return ts.isIdentifier(declaration.name) && declaration.name.text === "metadata";
}

function hasMetadataExport(sourceFile: ts.SourceFile): boolean {
  return sourceFile.statements.some((statement) =>
    (ts.isVariableStatement(statement) && isExported(statement) &&
      statement.declarationList.declarations.some(isMetadataDeclaration)) ||
    (ts.isFunctionDeclaration(statement) && isExported(statement) && statement.name?.text === "generateMetadata"),
  );
}

function needsUseClient(sourceFile: ts.SourceFile): boolean {
  const hookNames = new Set(CLIENT_HOOKS);
  const importedHooks: string[] = [];
  const hookNamespaces = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (!statement.importClause?.isTypeOnly && statement.moduleSpecifier.text === "framer-motion") return true;
    if (statement.importClause?.isTypeOnly) continue;
    const bindings = statement.importClause?.namedBindings;
    if (HOOK_NAMESPACE_MODULES.has(statement.moduleSpecifier.text)) {
      if (statement.importClause?.name) hookNamespaces.add(statement.importClause.name.text);
      if (bindings && ts.isNamespaceImport(bindings)) hookNamespaces.add(bindings.name.text);
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          if (!element.isTypeOnly && element.propertyName?.text === "default") hookNamespaces.add(element.name.text);
        }
      }
    }
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      if (!element.isTypeOnly && CLIENT_HOOKS.has((element.propertyName ?? element.name).text)) {
        hookNames.add(element.name.text);
        importedHooks.push(element.name.text);
      }
    }
  }
  if (hookNamespaces.size > 0) collectNamespaceAliases(sourceFile, hookNamespaces);

  if (importedHooks.length > 0) {
    const usage = indexIdentifierUsage(sourceFile.text, sourceFile.fileName);
    for (const name of importedHooks) {
      const references = usage.usageOf(name);
      // A hook consumed as a value still requires the client boundary: it can
      // be assigned to an alias, passed to another function, or put in an object.
      // Unknown/shadowed bindings are insufficient evidence to remove it safely.
      if (references.value > 0 || references.unknown > 0) return true;
    }
  }

  let needed = false;
  const visit = (node: ts.Node): void => {
    if (needed || ts.isTypeNode(node) || ts.isImportDeclaration(node)) return;
    if (ts.isJsxAttribute(node) && /^on[A-Z]/.test(node.name.getText(sourceFile))) {
      needed = true;
    } else if (ts.isPropertyAccessExpression(node) && CLIENT_HOOKS.has(node.name.text) &&
               isHookNamespace(node.expression, hookNamespaces)) {
      needed = true;
    } else if (ts.isElementAccessExpression(node) && isHookNamespace(node.expression, hookNamespaces)) {
      const key = unwrapExpression(node.argumentExpression);
      // An unknown computed key can select a client hook too.
      if (!ts.isStringLiteral(key) || CLIENT_HOOKS.has(key.text)) needed = true;
    } else if (ts.isVariableDeclaration(node) && node.initializer && ts.isObjectBindingPattern(node.name) &&
               isHookNamespace(node.initializer, hookNamespaces)) {
      needed = node.name.elements.some((element) => {
        const name = element.propertyName ?? (ts.isIdentifier(element.name) ? element.name : undefined);
        return name !== undefined && (memberName(name) === undefined || CLIENT_HOOKS.has(memberName(name)!));
      });
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if ((ts.isIdentifier(callee) && hookNames.has(callee.text)) ||
          (ts.isPropertyAccessExpression(callee) && CLIENT_HOOKS.has(callee.name.text))) needed = true;
    } else if ((ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
               ts.isIdentifier(node.expression) && BROWSER_GLOBALS.has(node.expression.text)) {
      needed = true;
    }
    if (!needed) ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return needed;
}

function removeNode(code: string, sourceFile: ts.SourceFile, node: ts.Node): string {
  const end = node.end + (code.slice(node.end).match(/^[\t ]*\r?\n(?:[\t ]*\r?\n)*/)?.[0].length ?? 0);
  return code.slice(0, node.getStart(sourceFile)) + code.slice(end);
}

function stripStaticMetadata(code: string, sourceFile: ts.SourceFile): string {
  const printer = ts.createPrinter({ removeComments: true });
  let result = code;
  for (const statement of [...sourceFile.statements].reverse()) {
    if (!ts.isVariableStatement(statement) || !isExported(statement)) continue;
    const remaining = statement.declarationList.declarations.filter((declaration) => !isMetadataDeclaration(declaration));
    if (remaining.length === statement.declarationList.declarations.length) continue;
    if (remaining.length === 0) {
      result = removeNode(result, sourceFile, statement);
    } else {
      const updated = ts.factory.updateVariableStatement(statement, statement.modifiers,
        ts.factory.updateVariableDeclarationList(statement.declarationList, remaining));
      result = result.slice(0, statement.getStart(sourceFile)) +
        printer.printNode(ts.EmitHint.Unspecified, updated, sourceFile) + result.slice(statement.end);
    }
  }
  return result;
}

function stripMetadataImport(code: string, filePath: string): string {
  const sourceFile = createTsxSourceFile(filePath, code);
  const usedNames = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) return;
    if (ts.isIdentifier(node)) usedNames.add(node.text);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  const printer = ts.createPrinter({ removeComments: true });
  let result = code;
  for (const statement of [...sourceFile.statements].reverse()) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) ||
        statement.moduleSpecifier.text !== "next") continue;
    const clause = statement.importClause;
    if (!clause?.namedBindings || !ts.isNamedImports(clause.namedBindings)) continue;
    const remaining = clause.namedBindings.elements.filter((element) =>
      (element.propertyName ?? element.name).text !== "Metadata" || usedNames.has(element.name.text),
    );
    if (remaining.length === clause.namedBindings.elements.length) continue;
    if (remaining.length === 0 && !clause.name) {
      result = removeNode(result, sourceFile, statement);
    } else {
      const updated = ts.factory.updateImportDeclaration(statement, statement.modifiers,
        ts.factory.updateImportClause(clause, clause.isTypeOnly, clause.name,
          remaining.length ? ts.factory.updateNamedImports(clause.namedBindings, remaining) : undefined),
        statement.moduleSpecifier, statement.attributes);
      result = result.slice(0, statement.getStart(sourceFile)) +
        printer.printNode(ts.EmitHint.Unspecified, updated, sourceFile) + result.slice(statement.end);
    }
  }
  return result;
}

export function fixMetadataClientConflict(
  code: string,
  filePath: string,
): { code: string; fixed: boolean; fixes: FixEntry[] } {
  const sourceFile = createTsxSourceFile(filePath, code);
  const directive = findClientDirective(sourceFile);
  if (!directive || !hasMetadataExport(sourceFile)) {
    return { code, fixed: false, fixes: [] };
  }

  if (!needsUseClient(sourceFile)) {
    const nextCode = removeNode(code, sourceFile, directive);
    return {
      code: nextCode,
      fixed: nextCode !== code,
      fixes:
        nextCode !== code
          ? [
              {
                fixer: "metadata-client-conflict-fixer",
                category: "mechanical",
                description:
                  'Removed unnecessary "use client" directive from metadata file',
                file: filePath,
              },
            ]
          : [],
    };
  }

  const withoutStaticMetadata = stripStaticMetadata(code, sourceFile);
  if (withoutStaticMetadata !== code) {
    const cleaned = stripMetadataImport(withoutStaticMetadata, filePath);
    return {
      code: cleaned,
      fixed: true,
      fixes: [
        {
          fixer: "metadata-client-conflict-fixer",
          category: "mechanical",
          description:
            "Removed static metadata export from client component to keep App Router valid",
          file: filePath,
        },
      ],
    };
  }

  return { code, fixed: false, fixes: [] };
}
