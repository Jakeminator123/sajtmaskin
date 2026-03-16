import { describe, expect, it } from "vitest";
import {
  readServiceItemsDraft,
  updateServiceItemsDraft,
} from "./services-editor";

describe("services-editor", () => {
  const content = [
    "const services = [",
    "  { title: 'Design', description: 'Beautiful websites', icon: Star },",
    "  { title: 'SEO', description: 'Better visibility', icon: Search },",
    "];",
    "",
    "export default function Page() {",
    "  return <main />;",
    "}",
  ].join("\n");

  it("reads repeated title/description items from page files", () => {
    expect(readServiceItemsDraft("src/app/page.tsx", content)).toEqual([
      { title: "Design", description: "Beautiful websites" },
      { title: "SEO", description: "Better visibility" },
    ]);
  });

  it("returns null when fewer than two items are found", () => {
    const single = "const services = [{ title: 'One', description: 'Only' }];";
    expect(readServiceItemsDraft("src/app/page.tsx", single)).toBeNull();
  });

  it("updates item titles and descriptions in place", () => {
    const updated = updateServiceItemsDraft(content, [
      { title: "Branding", description: "Sharper positioning" },
      { title: "Tracking", description: "Measure conversions" },
    ]);

    expect(updated).toContain("title: 'Branding'");
    expect(updated).toContain("description: 'Sharper positioning'");
    expect(updated).toContain("title: 'Tracking'");
    expect(updated).toContain("description: 'Measure conversions'");
  });
});
