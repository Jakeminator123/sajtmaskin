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
  let requireIsShadowed = false;
  const findRequireBinding = (node: ts.Node): void => {
    if (
      (ts.isVariableDeclaration(node) || ts.isParameter(node)) &&
      bindingContains(node.name, "require")
    ) {
      requireIsShadowed = true;
    } else if (
      (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
      node.name?.text === "require"
    ) {
      requireIsShadowed = true;
    } else if (ts.isCatchClause(node) && node.variableDeclaration) {
      requireIsShadowed ||= bindingContains(node.variableDeclaration.name, "require");
    } else if (ts.isImportClause(node) && !node.isTypeOnly) {
      requireIsShadowed ||= node.name?.text === "require";
      const bindings = node.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) {
        requireIsShadowed ||= bindings.name.text === "require";
      } else if (bindings && ts.isNamedImports(bindings)) {
        requireIsShadowed ||= bindings.elements.some(
          (element) => !element.isTypeOnly && element.name.text === "require",
        );
      }
    }
    ts.forEachChild(node, findRequireBinding);
  };
  findRequireBinding(source);
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
          !requireIsShadowed))
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
