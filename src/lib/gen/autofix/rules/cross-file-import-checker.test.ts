import { describe, expect, it } from "vitest";
import { checkCrossFileImports } from "./cross-file-import-checker";
import { runProjectSanityChecks } from "@/lib/gen/validation/project-sanity";
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

  it("materializes a real icon helper for hallucinated @/components/icon imports", () => {
    const statsCard: CodeFile = {
      path: "components/stats-card.tsx",
      language: "tsx",
      content: [
        'import { Icon } from "@/components/icon";',
        "",
        "export function StatsCard() {",
        '  return <div><Icon name="calendar" className="size-4" /> Bookings</div>;',
        "}",
      ].join("\n"),
    };

    const result = checkCrossFileImports([statsCard]);
    const helper = result.files.find((f) => f.path === "components/icon.tsx");

    expect(helper).toBeDefined();
    expect(helper?.content).toContain("export function Icon");
    expect(helper?.content).toContain("lucide-react");
    expect(helper?.content).not.toContain("autofix-stub");
    expect(helper?.content).not.toContain("return null");
    const sanity = runProjectSanityChecks(result.files, {
      scaffoldBaselineCoversPackageJson: true,
    });
    expect(
      sanity.issues.filter((issue) => issue.message.includes("@/components/icon")),
    ).toEqual([]);
  });

  it("materializes a real date helper for hallucinated @/components/date imports", () => {
    const bookingFlow: CodeFile = {
      path: "components/booking-flow.tsx",
      language: "tsx",
      content: [
        'import { DatePicker } from "@/components/date";',
        "",
        "export function BookingFlow() {",
        '  return <DatePicker value="2026-04-27" className="text-sm" />;',
        "}",
      ].join("\n"),
    };

    const result = checkCrossFileImports([bookingFlow]);
    const helper = result.files.find((f) => f.path === "components/date.tsx");

    expect(helper).toBeDefined();
    expect(helper?.content).toContain("export function DateDisplay");
    expect(helper?.content).toContain("export function DatePicker");
    expect(helper?.content).not.toContain("autofix-stub");
    expect(helper?.content).not.toContain("return null");
    const sanity = runProjectSanityChecks(result.files, {
      scaffoldBaselineCoversPackageJson: true,
    });
    expect(
      sanity.issues.filter((issue) => issue.message.includes("@/components/date")),
    ).toEqual([]);
  });

  it("does not stub runtime-provided hooks like @/lib/hooks/use-mobile", () => {
    const sidebar: CodeFile = {
      path: "components/ui/sidebar.tsx",
      language: "tsx",
      content: [
        '"use client";',
        'import { useIsMobile } from "@/lib/hooks/use-mobile";',
        "",
        "export function Sidebar() {",
        "  const mobile = useIsMobile();",
        "  return <aside data-mobile={mobile} />;",
        "}",
      ].join("\n"),
    };

    const result = checkCrossFileImports([sidebar]);

    expect(result.files.some((f) => f.path === "lib/hooks/use-mobile.tsx")).toBe(false);
    expect(result.fixes.some((f) => f.missingImport === "@/lib/hooks/use-mobile")).toBe(false);
    const sanity = runProjectSanityChecks(result.files, {
      scaffoldBaselineCoversPackageJson: true,
    });
    expect(
      sanity.issues.filter((issue) => issue.message.includes("@/lib/hooks/use-mobile")),
    ).toEqual([]);
  });

  it("rewires @/components/three-canvas to @/components/three-canvas-shell when the shell file exists", () => {
    const overlay: CodeFile = {
      path: "components/flying-drum-overlay.tsx",
      language: "tsx",
      content: [
        '"use client";',
        'import { ThreeCanvasShell } from "@/components/three-canvas";',
        "",
        "export function FlyingDrumOverlay() {",
        "  return <ThreeCanvasShell decorative className=\"size-full\" />;",
        "}",
      ].join("\n"),
    };
    const shell: CodeFile = {
      path: "components/three-canvas-shell.tsx",
      language: "tsx",
      content: [
        '"use client";',
        "export function ThreeCanvasShell(props: { children?: unknown }) {",
        "  return null;",
        "}",
      ].join("\n"),
    };

    const result = checkCrossFileImports([overlay, shell]);

    const updatedOverlay = result.files.find(
      (f) => f.path === "components/flying-drum-overlay.tsx",
    );
    expect(updatedOverlay?.content).toContain('"@/components/three-canvas-shell"');
    expect(updatedOverlay?.content).not.toContain('"@/components/three-canvas"');
    expect(result.files.some((f) => f.path === "components/three-canvas.tsx")).toBe(false);
    const rewireFix = result.fixes.find(
      (f) => f.missingImport === "@/components/three-canvas",
    );
    expect(rewireFix).toBeDefined();
    expect(rewireFix?.rewireTarget).toBe("components/three-canvas-shell");
  });

  it("falls back to stub when no fuzzy sibling exists", () => {
    const page: CodeFile = {
      path: "app/page.tsx",
      language: "tsx",
      content: [
        'import { TotallyMadeUpThing } from "@/components/totally-made-up-thing";',
        "export default function Page() { return null; }",
      ].join("\n"),
    };

    const result = checkCrossFileImports([page]);

    const stub = result.files.find(
      (f) => f.path === "components/totally-made-up-thing.tsx",
    );
    expect(stub).toBeDefined();
    expect(stub?.content).toContain("autofix-stub");
    const fix = result.fixes.find(
      (f) => f.missingImport === "@/components/totally-made-up-thing",
    );
    expect(fix?.rewireTarget).toBeUndefined();
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
