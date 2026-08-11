import { describe, expect, it } from "vitest";
import { extractLocalComponentDeclarations } from "./local-declarations";

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

  it("ignores nested declarations inside functions", () => {
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
});
