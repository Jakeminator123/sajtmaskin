import { describe, expect, it } from "vitest";
import {
  buildLocalDeclarationIndex,
  extractLocalComponentDeclarations,
} from "./local-declarations";

describe("extractLocalComponentDeclarations", () => {
  it("finds module-scope value and type declarations", () => {
    const code = [
      "const DialogPortal = DialogPrimitive.Portal",
      "function DialogContent() { return null }",
      "type GamePhase = 'a' | 'b'",
      "interface Props { n: number }",
      "class Store {}",
    ].join("\n");
    expect([...extractLocalComponentDeclarations(code)].sort()).toEqual([
      "DialogContent",
      "DialogPortal",
      "GamePhase",
      "Props",
      "Store",
    ]);
  });

  it("recognizes typed const Button: React.FC = …", () => {
    const code = 'const Button: React.FC<{ children?: React.ReactNode }> = ({ children }) => null';
    expect(extractLocalComponentDeclarations(code).has("Button")).toBe(true);
  });

  it("ignores nested declarations inside functions for the flat Set", () => {
    // Flat Set is module-scope values + types only (tag-mismatch back-compat).
    // Import decisions use isValueInScope — see tests below.
    const code = [
      "function helper() {",
      "  const Button = () => null;",
      "  return <Button />;",
      "}",
      "export function Page() { return <Button /> }",
    ].join("\n");
    expect(extractLocalComponentDeclarations(code).has("Button")).toBe(false);
  });

  it("does not treat braces inside strings as scope", () => {
    const code = [
      'const label = "use { Button } carefully";',
      "const Button = () => null;",
    ].join("\n");
    expect(extractLocalComponentDeclarations(code).has("Button")).toBe(true);
  });

  it("ignores declaration-shaped text inside comments and strings", () => {
    const code = [
      "// const Button = exempel",
      'const tip = "const Card = exempel";',
      "export function Page() { return <Button><Card /></Button> }",
    ].join("\n");
    const idx = buildLocalDeclarationIndex(code);
    expect(idx.allNames.has("Button")).toBe(false);
    expect(idx.allNames.has("Card")).toBe(false);
  });

  it("keeps type names in allNames but not as value bindings", () => {
    const code = [
      "type Card = { title: string }",
      "interface Button { label: string }",
      "export function Page() { return <Button><Card /></Button> }",
    ].join("\n");
    const idx = buildLocalDeclarationIndex(code);
    expect(idx.typeNames.has("Card")).toBe(true);
    expect(idx.typeNames.has("Button")).toBe(true);
    expect(idx.allNames.has("Button")).toBe(true);
    const buttonUsage = code.indexOf("<Button>");
    const cardUsage = code.indexOf("<Card");
    expect(idx.isValueInScope("Button", buttonUsage)).toBe(false);
    expect(idx.isValueInScope("Card", cardUsage)).toBe(false);
  });
});

describe("buildLocalDeclarationIndex — usage scope", () => {
  it("covers nested JSX with a nested value decl, but not sibling scopes", () => {
    const code = [
      "function makeToolbar() {",
      "  const Button = (props: { children?: React.ReactNode }) => <button {...props} />;",
      "  return <Button>local</Button>;",
      "}",
      "",
      "export default function Page() {",
      "  return <Button>Klicka</Button>;",
      "}",
    ].join("\n");
    const idx = buildLocalDeclarationIndex(code);
    const nestedUsage = code.indexOf("<Button>local");
    const pageUsage = code.indexOf("<Button>Klicka");
    expect(idx.isValueInScope("Button", nestedUsage)).toBe(true);
    expect(idx.isValueInScope("Button", pageUsage)).toBe(false);
  });

  it("does not invent an outer import need when JSX only uses the nested local", () => {
    const code = [
      "function makeToolbar() {",
      "  const Button = () => null;",
      "  return <Button />;",
      "}",
      "export default function Page() { return makeToolbar(); }",
    ].join("\n");
    const idx = buildLocalDeclarationIndex(code);
    const usage = code.indexOf("<Button");
    expect(idx.isValueInScope("Button", usage)).toBe(true);
  });

  it("treats module-level function declarations as hoisted", () => {
    const code = [
      "export default function Page() { return <Button>Klicka</Button>; }",
      "function Button() { return <button type=\"button\" />; }",
    ].join("\n");
    const idx = buildLocalDeclarationIndex(code);
    const usage = code.indexOf("<Button>");
    expect(idx.isValueInScope("Button", usage)).toBe(true);
  });

  it("treats module-scope const as visible to earlier function bodies", () => {
    // Module evaluation finishes before Page() runs, so a later const Button is
    // a real local — do not inject a shadcn import.
    const code = [
      "export default function Page() { return <Button>Klicka</Button>; }",
      "const Button = () => <button type=\"button\" />;",
    ].join("\n");
    const idx = buildLocalDeclarationIndex(code);
    const usage = code.indexOf("<Button>");
    expect(idx.isValueInScope("Button", usage)).toBe(true);
  });

  it("does not hoist nested const above its declaration inside the same block", () => {
    const code = [
      "export default function Page() {",
      "  const el = <Button>Klicka</Button>;",
      "  const Button = () => <button type=\"button\" />;",
      "  return el;",
      "}",
    ].join("\n");
    const idx = buildLocalDeclarationIndex(code);
    const usage = code.indexOf("<Button>");
    expect(idx.isValueInScope("Button", usage)).toBe(false);
  });
});
