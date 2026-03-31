import { describe, expect, it } from "vitest";
import {
  readStatItemsDraft,
  updateStatItemsDraft,
  type StatItemDraft,
} from "./stats-editor";

describe("stats-editor", () => {
  describe("readStatItemsDraft", () => {
    it("reads label/value pairs from page files", () => {
      const content = [
        "const stats = [",
        "  { label: 'MRR', value: '$84k' },",
        "  { label: 'Activation', value: '68%' },",
        "];",
      ].join("\n");
      expect(readStatItemsDraft("app/page.tsx", content)).toEqual([
        { label: "MRR", value: "$84k" },
        { label: "Activation", value: "68%" },
      ]);
    });

    it("returns null for non-page files", () => {
      const content = [
        "const stats = [",
        "  { label: 'MRR', value: '$84k' },",
        "  { label: 'Activation', value: '68%' },",
        "];",
      ].join("\n");
      expect(readStatItemsDraft("components/stats.tsx", content)).toBeNull();
    });

    it("returns null when fewer than two items", () => {
      const content = [
        "const stats = [",
        "  { label: 'MRR', value: '$84k' },",
        "];",
      ].join("\n");
      expect(readStatItemsDraft("app/page.tsx", content)).toBeNull();
    });

    it("caps at 8 items", () => {
      const items = Array.from({ length: 10 }, (_, i) =>
        `  { label: 'L${i}', value: 'V${i}' },`,
      ).join("\n");
      const content = `const stats = [\n${items}\n];`;
      const result = readStatItemsDraft("app/page.tsx", content);
      expect(result).toHaveLength(8);
    });
  });

  describe("updateStatItemsDraft", () => {
    it("updates label and value in place", () => {
      const content = [
        "const stats = [",
        "  { label: 'MRR', value: '$84k' },",
        "  { label: 'Activation', value: '68%' },",
        "];",
      ].join("\n");
      const nextItems: StatItemDraft[] = [
        { label: "Revenue", value: "$92k" },
        { label: "Signup conversion", value: "71%" },
      ];
      const updated = updateStatItemsDraft(content, nextItems);
      expect(updated).toContain("label: 'Revenue'");
      expect(updated).toContain("value: '$92k'");
      expect(updated).toContain("label: 'Signup conversion'");
      expect(updated).toContain("value: '71%'");
    });

    it("returns content unchanged when no edits", () => {
      const content = [
        "const stats = [",
        "  { label: 'MRR', value: '$84k' },",
        "  { label: 'Activation', value: '68%' },",
        "];",
      ].join("\n");
      const nextItems: StatItemDraft[] = [
        { label: "MRR", value: "$84k" },
        { label: "Activation", value: "68%" },
      ];
      expect(updateStatItemsDraft(content, nextItems)).toBe(content);
    });
  });
});
