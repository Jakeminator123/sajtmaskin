import { describe, expect, it } from "vitest";
import { resolveTier2InstallCommand } from "./sandbox-preview";

describe("resolveTier2InstallCommand", () => {
  it("prefers pnpm when a pnpm lockfile exists", () => {
    expect(
      resolveTier2InstallCommand([
        { name: "package.json", content: "{}" },
        { name: "pnpm-lock.yaml", content: "lockfileVersion: '9.0'" },
      ]),
    ).toBe("pnpm install --frozen-lockfile --prefer-offline");
  });

  it("uses npm ci when a package-lock exists", () => {
    expect(
      resolveTier2InstallCommand([
        { name: "package.json", content: "{}" },
        { name: "package-lock.json", content: "{}" },
      ]),
    ).toBe("npm ci --prefer-offline");
  });

  it("falls back to npm install when no lockfile exists", () => {
    expect(
      resolveTier2InstallCommand([{ name: "package.json", content: "{}" }]),
    ).toBe("npm install --prefer-offline");
  });
});
