import { describe, expect, it } from "vitest";
import { checkCrossFileImports } from "./cross-file-import-checker";
import type { CodeFile } from "@/lib/gen/parser";

describe("checkCrossFileImports", () => {
  it("does not create a stub when a missing local import duplicates a package binding (rapier case)", () => {
    const floating: CodeFile = {
      path: "components/floating-bike-scene.tsx",
      language: "tsx",
      content: [
        '"use client";',
        "",
        "import {",
        "  CuboidCollider,",
        "  Physics,",
        "  RigidBody,",
        "  type RapierRigidBody,",
        '} from "@react-three/rapier";',
        'import RapierRigidBody from "@/components/rapier-rigid-body";',
        "",
        "export function FloatingBikeScene() { return null; }",
      ].join("\n"),
    };

    const result = checkCrossFileImports([floating]);

    expect(result.fixes.some((f) => f.stubFile.includes("rapier-rigid-body"))).toBe(false);
    expect(result.files.some((f) => f.path === "components/rapier-rigid-body.tsx")).toBe(false);
    const updated = result.files.find((f) => f.path === "components/floating-bike-scene.tsx");
    expect(updated?.content).toBeDefined();
    expect(updated!.content).not.toContain("@/components/rapier-rigid-body");
    expect(updated!.content).toContain("@react-three/rapier");
  });

  it("still creates a stub for a genuine missing local component with a unique name", () => {
    const page: CodeFile = {
      path: "app/page.tsx",
      language: "tsx",
      content: [
        'import { UniqueMissingWidget } from "@/components/unique-missing-widget";',
        "export default function Page() { return null; }",
      ].join("\n"),
    };

    const result = checkCrossFileImports([page]);

    expect(result.fixes.length).toBeGreaterThan(0);
    const stub = result.files.find((f) => f.path === "components/unique-missing-widget.tsx");
    expect(stub?.content).toContain("UniqueMissingWidget");
  });

  it("strips denylisted default imports like HTMLFormElement without stubbing", () => {
    const page: CodeFile = {
      path: "app/form.tsx",
      language: "tsx",
      content: [
        'import HTMLFormElement from "@/components/html-form-element";',
        "export default function Form() { return null; }",
      ].join("\n"),
    };

    const result = checkCrossFileImports([page]);

    expect(result.files.some((f) => f.path === "components/html-form-element.tsx")).toBe(false);
    const updated = result.files.find((f) => f.path === "app/form.tsx");
    expect(updated?.content ?? "").not.toContain("html-form-element");
  });
});
