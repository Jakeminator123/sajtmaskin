import { describe, expect, it } from "vitest";
import { fixDuplicateImportAndLocalTypeCollision } from "./duplicate-import-local-type-collision-fixer";

// Empirical case from 2026-04-23 — components/showcase-gallery.tsx had both
// issues simultaneously: two default imports of the same source (different
// local names) AND a local `export type` colliding with one of them.
const SHOWCASE_GALLERY_EMPIRICAL_CASE = `import ShowcaseVehicleCard from "@/components/showcase-vehicle";
import ShowcaseVehicle from "@/components/showcase-vehicle";

export type ShowcaseVehicle = { make: string };

export function ShowcaseGallery() {
  return <ShowcaseVehicleCard />;
}
`;

const SAME_SOURCE_TWO_DEFAULTS = `import Foo from "@/components/thing";
import Bar from "@/components/thing";

export default function X() { return <Foo />; }
`;

const TYPE_COLLISION_IMPORT_UNUSED = `import User from "@/types/user";

export type User = { id: string };
`;

const TYPE_COLLISION_IMPORT_USED = `import User from "@/components/user";

export type User = { id: string };

export default function Page() {
  return <User />;
}
`;

const NO_DUPLICATES_CASE = `import { Foo } from "@/components/foo";
import { Bar } from "@/components/bar";

export default function X() { return <div><Foo /><Bar /></div>; }
`;

describe("fixDuplicateImportAndLocalTypeCollision", () => {
  it("handles the empirical showcase-gallery case (both sub-rules)", () => {
    const { code, fixed, fixes } = fixDuplicateImportAndLocalTypeCollision(
      SHOWCASE_GALLERY_EMPIRICAL_CASE,
      "components/showcase-gallery.tsx",
    );
    expect(fixed).toBe(true);
    expect(fixes).toHaveLength(1);
    expect(fixes[0].fixer).toBe("duplicate-import-local-type-collision-fixer");
    // `ShowcaseVehicleCard` is used as JSX, so it's the keeper; the unused
    // `ShowcaseVehicle` default import is dropped (which also resolves the
    // collision with the local `export type ShowcaseVehicle`).
    expect(code).toContain('import ShowcaseVehicleCard from "@/components/showcase-vehicle";');
    expect(code).not.toMatch(/^import ShowcaseVehicle from/m);
    expect(code).toContain("export type ShowcaseVehicle");
  });

  it("drops the unused duplicate default when two imports target the same source", () => {
    const { code, fixed } = fixDuplicateImportAndLocalTypeCollision(
      SAME_SOURCE_TWO_DEFAULTS,
      "app/page.tsx",
    );
    expect(fixed).toBe(true);
    // Foo is used as JSX, Bar is not → Bar is dropped.
    expect(code).toContain('import Foo from "@/components/thing"');
    expect(code).not.toContain("import Bar from");
  });

  it("drops import that collides with a local type alias when import is unused", () => {
    const { code, fixed } = fixDuplicateImportAndLocalTypeCollision(
      TYPE_COLLISION_IMPORT_UNUSED,
      "types/user.ts",
    );
    expect(fixed).toBe(true);
    expect(code).not.toContain('import User from');
    expect(code).toContain("export type User");
  });

  it("leaves collision alone when the import IS used as a value", () => {
    const result = fixDuplicateImportAndLocalTypeCollision(
      TYPE_COLLISION_IMPORT_USED,
      "app/page.tsx",
    );
    expect(result.fixed).toBe(false);
  });

  it("is a no-op when there are no duplicate imports or collisions", () => {
    const result = fixDuplicateImportAndLocalTypeCollision(NO_DUPLICATES_CASE, "x.tsx");
    expect(result.fixed).toBe(false);
    expect(result.code).toBe(NO_DUPLICATES_CASE);
  });
});
