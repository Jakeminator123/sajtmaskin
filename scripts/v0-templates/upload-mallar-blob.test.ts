import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const scriptPath = resolve("scripts/v0-templates/upload-mallar-blob.mjs");
const sourceText = readFileSync(scriptPath, "utf8");
const sourceFile = ts.createSourceFile(
  scriptPath,
  sourceText,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.JS,
);

function findFunction(name: string): ts.FunctionDeclaration {
  const declaration = sourceFile.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  );
  if (!declaration) throw new Error(`Missing function ${name}`);
  return declaration;
}

function findTopLevelVariable(name: string): ts.VariableDeclaration {
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    const declaration = statement.declarationList.declarations.find(
      (candidate) => ts.isIdentifier(candidate.name) && candidate.name.text === name,
    );
    if (declaration) return declaration;
  }
  throw new Error(`Missing top-level variable ${name}`);
}

function findPutOptions(name: string): ts.ObjectLiteralExpression {
  const declaration = findFunction(name);
  const calls: ts.CallExpression[] = [];

  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "put"
    ) {
      calls.push(node);
    }
    ts.forEachChild(node, visit);
  }

  visit(declaration);
  expect(calls, `${name} must own exactly one Blob put call`).toHaveLength(1);
  const options = calls[0]?.arguments[2];
  if (!options || !ts.isObjectLiteralExpression(options)) {
    throw new Error(`${name} must pass an inline options object to put`);
  }
  return options;
}

function expectExplicitExistingToken(name: string): void {
  const options = findPutOptions(name);
  const tokenProperty = options.properties.find(
    (property): property is ts.PropertyAssignment =>
      ts.isPropertyAssignment(property) &&
      ((ts.isIdentifier(property.name) && property.name.text === "token") ||
        (ts.isStringLiteral(property.name) && property.name.text === "token")),
  );

  expect(tokenProperty, `${name} must pin the existing Blob credential`).toBeDefined();
  expect(tokenProperty?.initializer.getText(sourceFile)).toBe("blobReadWriteToken");
}

describe("upload-mallar Blob caller credential contract", () => {
  it("reads and trims one canonical token after dotenv loading", () => {
    const declaration = findTopLevelVariable("blobReadWriteToken");
    expect(declaration.initializer?.getText(sourceFile)).toBe(
      "process.env.BLOB_READ_WRITE_TOKEN?.trim()",
    );

    const declarationStart = declaration.getStart(sourceFile);
    const dotenvCalls = sourceFile.statements.filter(
      (statement): statement is ts.ExpressionStatement =>
        ts.isExpressionStatement(statement) &&
        ts.isCallExpression(statement.expression) &&
        ts.isIdentifier(statement.expression.expression) &&
        statement.expression.expression.text === "loadDotenv",
    );
    expect(dotenvCalls).toHaveLength(2);
    expect(dotenvCalls.every((statement) => statement.getStart(sourceFile) < declarationStart)).toBe(
      true,
    );
  });

  it("fails upload mode when the trimmed canonical token is blank", () => {
    const main = findFunction("main");
    const guards: ts.IfStatement[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isIfStatement(node) && node.thenStatement.getText(sourceFile).includes("cannot upload")) {
        guards.push(node);
      }
      ts.forEachChild(node, visit);
    };
    visit(main);

    expect(guards).toHaveLength(1);
    expect(guards[0]?.expression.getText(sourceFile)).toBe("!dryRun && !blobReadWriteToken");
  });

  it("pins the existing token on the still-image SDK call", () => {
    expectExplicitExistingToken("uploadStillImage");
  });

  it("pins the existing token on the archive SDK call", () => {
    expectExplicitExistingToken("uploadZip");
  });
});
