import ts from "typescript";

import {
  countParseErrors,
  createTsxSourceFile,
  isGuardablePath,
} from "../autofix/rules/import-binding-ast";
import type { PlanIntegrationContract } from "../plan/schema";

export type ProviderEvidenceRule = {
  kind?: "database" | "auth" | "payment" | "integration";
  providerKey: string;
  dossierCapability?: string;
  packageRoots?: readonly string[];
};

export type ProjectProviderEvidence = {
  kind?: "database" | "auth" | "payment" | "integration";
  providerKey: string;
  dossierCapability?: string;
  packageRoot: string;
};

type ProjectFile = { path: string; content: string };

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function packageRootForSpecifier(specifier: string): string {
  if (specifier.startsWith("@")) return specifier.split("/").slice(0, 2).join("/");
  return specifier.split("/")[0] ?? specifier;
}

function runtimeModuleSpecifiers(file: ProjectFile): Set<string> {
  if (!isGuardablePath(file.path) || countParseErrors(file.content, file.path) > 0) {
    return new Set();
  }
  const source = createTsxSourceFile(file.path, file.content);
  const found = new Set<string>();
  const bindingContains = (name: ts.BindingName, target: string): boolean => {
    if (ts.isIdentifier(name)) return name.text === target;
    return name.elements.some(
      (element) => !ts.isOmittedExpression(element) && bindingContains(element.name, target),
    );
  };
  const isFunctionScope = (node: ts.Node): node is ts.FunctionLikeDeclaration =>
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isConstructorDeclaration(node);
  const nearestScope = (
    node: ts.Node,
    predicate: (candidate: ts.Node) => boolean,
  ): ts.Node => {
    let current: ts.Node | undefined = node.parent;
    while (current) {
      if (predicate(current)) return current;
      current = current.parent;
    }
    return source;
  };
  const nearestLexicalScope = (node: ts.Node): ts.Node =>
    nearestScope(
      node,
      (candidate) =>
        ts.isBlock(candidate) ||
        ts.isCaseBlock(candidate) ||
        ts.isCatchClause(candidate) ||
        ts.isForStatement(candidate) ||
        ts.isForInStatement(candidate) ||
        ts.isForOfStatement(candidate) ||
        isFunctionScope(candidate) ||
        ts.isSourceFile(candidate),
    );
  const nearestFunctionScope = (node: ts.Node): ts.Node =>
    nearestScope(node, (candidate) => isFunctionScope(candidate) || ts.isSourceFile(candidate));
  const requireShadowScopes = new Set<ts.Node>();
  const findRequireBinding = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      !ts.isCatchClause(node.parent) &&
      bindingContains(node.name, "require")
    ) {
      const declarationList = node.parent;
      const isBlockScoped =
        ts.isVariableDeclarationList(declarationList) &&
        (declarationList.flags & ts.NodeFlags.BlockScoped) !== 0;
      requireShadowScopes.add(
        isBlockScoped ? nearestLexicalScope(node) : nearestFunctionScope(node),
      );
    } else if (ts.isParameter(node) && bindingContains(node.name, "require")) {
      requireShadowScopes.add(nearestFunctionScope(node));
    } else if (ts.isFunctionDeclaration(node) && node.name?.text === "require") {
      requireShadowScopes.add(nearestLexicalScope(node));
    } else if (ts.isFunctionExpression(node) && node.name?.text === "require") {
      requireShadowScopes.add(node);
    } else if (
      (ts.isClassDeclaration(node) || ts.isClassExpression(node)) &&
      node.name?.text === "require"
    ) {
      requireShadowScopes.add(
        ts.isClassExpression(node) ? node : nearestLexicalScope(node),
      );
    } else if (ts.isCatchClause(node) && node.variableDeclaration) {
      if (bindingContains(node.variableDeclaration.name, "require")) {
        requireShadowScopes.add(node);
      }
    } else if (ts.isImportClause(node) && !node.isTypeOnly) {
      let shadowsRequire = node.name?.text === "require";
      const bindings = node.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) {
        shadowsRequire ||= bindings.name.text === "require";
      } else if (bindings && ts.isNamedImports(bindings)) {
        shadowsRequire ||= bindings.elements.some(
          (element) => !element.isTypeOnly && element.name.text === "require",
        );
      }
      if (shadowsRequire) requireShadowScopes.add(source);
    } else if (ts.isImportEqualsDeclaration(node) && node.name.text === "require") {
      requireShadowScopes.add(source);
    }
    ts.forEachChild(node, findRequireBinding);
  };
  findRequireBinding(source);
  const isRequireShadowedAt = (node: ts.Node): boolean => {
    let current: ts.Node | undefined = node;
    while (current) {
      if (requireShadowScopes.has(current)) return true;
      current = current.parent;
    }
    return false;
  };
  const addLiteral = (node: ts.Expression | undefined): void => {
    if (node && ts.isStringLiteralLike(node)) found.add(packageRootForSpecifier(node.text));
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      const hasRuntimeBinding =
        !clause ||
        (clause.isTypeOnly !== true &&
          (Boolean(clause.name) ||
            (clause.namedBindings &&
              (ts.isNamespaceImport(clause.namedBindings) ||
                clause.namedBindings.elements.some((element) => !element.isTypeOnly)))));
      if (hasRuntimeBinding) addLiteral(node.moduleSpecifier);
    } else if (ts.isExportDeclaration(node)) {
      const hasRuntimeBinding =
        node.isTypeOnly !== true &&
        (!node.exportClause ||
          ts.isNamespaceExport(node.exportClause) ||
          node.exportClause.elements.some((element) => !element.isTypeOnly));
      if (hasRuntimeBinding) addLiteral(node.moduleSpecifier);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      !node.isTypeOnly &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      addLiteral(node.moduleReference.expression);
    } else if (
      ts.isCallExpression(node) &&
      ((node.expression.kind === ts.SyntaxKind.ImportKeyword) ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require" &&
          !isRequireShadowedAt(node)))
    ) {
      addLiteral(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, visit);
  return found;
}

export function detectProjectProviderEvidence(
  files: readonly ProjectFile[],
  rules: readonly ProviderEvidenceRule[],
): ProjectProviderEvidence[] {
  const packageFile = files.find((file) => file.path === "package.json");
  let declared = new Set<string>();
  if (packageFile) {
    try {
      const parsed: unknown = JSON.parse(packageFile.content);
      if (!isPlainRecord(parsed)) return [];
      if (
        ("dependencies" in parsed && !isPlainRecord(parsed.dependencies)) ||
        ("devDependencies" in parsed && !isPlainRecord(parsed.devDependencies))
      ) {
        return [];
      }
      declared = new Set([
        ...Object.keys((parsed.dependencies as Record<string, unknown> | undefined) ?? {}),
        ...Object.keys((parsed.devDependencies as Record<string, unknown> | undefined) ?? {}),
      ]);
    } catch {
      return [];
    }
  }
  const imported = new Set<string>();
  for (const file of files) {
    for (const specifier of runtimeModuleSpecifiers(file)) imported.add(specifier);
  }
  const evidence: ProjectProviderEvidence[] = [];
  for (const rule of rules) {
    const packageRoot = rule.packageRoots?.find(
      (candidate) => declared.has(candidate) && imported.has(candidate),
    );
    if (!packageRoot) continue;
    evidence.push({
      kind: rule.kind,
      providerKey: rule.providerKey,
      dossierCapability: rule.dossierCapability,
      packageRoot,
    });
  }
  return evidence;
}

export function projectProviderEvidenceMatchesContract(
  evidence: readonly ProjectProviderEvidence[],
  contract: Pick<PlanIntegrationContract, "providerKey" | "dossierCapability">,
): boolean {
  if (!contract.providerKey || !contract.dossierCapability) return false;
  const providerKey = contract.providerKey.toLowerCase();
  const capability = contract.dossierCapability.toLowerCase();
  return evidence.some(
    (entry) =>
      entry.providerKey.toLowerCase() === providerKey &&
      entry.dossierCapability?.toLowerCase() === capability,
  );
}
