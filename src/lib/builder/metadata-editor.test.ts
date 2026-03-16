import { describe, expect, it } from "vitest";
import {
  readStaticMetadataDraft,
  updateStaticMetadataDraft,
} from "./metadata-editor";

describe("metadata-editor", () => {
  it("reads top-level metadata title and description from layout files", () => {
    const content = [
      "export const metadata = {",
      "  title: 'My title',",
      "  description: \"My description\",",
      "  openGraph: {",
      "    title: 'Nested title',",
      "  },",
      "};",
    ].join("\n");

    expect(readStaticMetadataDraft("src/app/layout.tsx", content)).toEqual({
      title: "My title",
      description: "My description",
    });
  });

  it("returns null when the file is not a static metadata layout", () => {
    expect(readStaticMetadataDraft("src/app/page.tsx", "export default function Page() {}")).toBeNull();
    expect(readStaticMetadataDraft("src/app/layout.tsx", "export async function generateMetadata() {}")).toBeNull();
  });

  it("updates existing title and inserts missing description", () => {
    const content = [
      "export const metadata = {",
      "  title: 'Old title',",
      "  openGraph: {",
      "    title: 'Nested title',",
      "  },",
      "};",
    ].join("\n");

    const updated = updateStaticMetadataDraft(content, {
      title: "New title",
      description: "Fresh description",
    });

    expect(updated).toContain('title: "New title"');
    expect(updated).toContain('description: "Fresh description"');
    expect(updated).toContain("openGraph");
    expect(readStaticMetadataDraft("src/app/layout.tsx", updated)).toEqual({
      title: "New title",
      description: "Fresh description",
    });
  });
});
