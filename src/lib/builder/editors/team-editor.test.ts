import { describe, expect, it } from "vitest";
import {
  readTeamMembers,
  updateTeamMembersDraft,
  type TeamMemberDraft,
} from "./team-editor";

describe("team-editor", () => {
  describe("readTeamMembers", () => {
    it("reads name, role, bio from page files with object literal markup", () => {
      const content = [
        "const team = [",
        "  { name: 'Anna Andersson', role: 'VD', bio: 'Anna har 15 års erfarenhet.' },",
        "  { name: 'Erik Eriksson', role: 'CTO', bio: 'Erik leder vårt tekniska team.' },",
        "];",
      ].join("\n");
      expect(readTeamMembers("app/page.tsx", content)).toEqual([
        { name: "Anna Andersson", role: "VD", bio: "Anna har 15 års erfarenhet." },
        { name: "Erik Eriksson", role: "CTO", bio: "Erik leder vårt tekniska team." },
      ]);
    });

    it("reads name, role, bio from HTML markup with h3 and p tags", () => {
      const content = [
        '<section className="team px-6 py-24">',
        '  <div className="grid gap-6">',
        '    <div className="rounded-lg border p-6">',
        "      <h3>Anna Andersson</h3>",
        '      <p className="text-sm text-muted-foreground">VD</p>',
        "      <p>Anna har 15 års erfarenhet inom branschen.</p>",
        "    </div>",
        '    <div className="rounded-lg border p-6">',
        "      <h3>Erik Eriksson</h3>",
        '      <p className="text-sm text-muted-foreground">CTO</p>',
        "      <p>Erik leder vårt tekniska team.</p>",
        "    </div>",
        "  </div>",
        "</section>",
      ].join("\n");
      expect(readTeamMembers("app/page.tsx", content)).toEqual([
        { name: "Anna Andersson", role: "VD", bio: "Anna har 15 års erfarenhet inom branschen." },
        { name: "Erik Eriksson", role: "CTO", bio: "Erik leder vårt tekniska team." },
      ]);
    });

    it("returns null for non-page files", () => {
      const content = [
        "const team = [",
        "  { name: 'Anna', role: 'VD', bio: 'Bio text.' },",
        "  { name: 'Erik', role: 'CTO', bio: 'Bio text.' },",
        "];",
      ].join("\n");
      expect(readTeamMembers("components/team.tsx", content)).toBeNull();
    });

    it("returns null when markup without team sections", () => {
      const content = [
        "<div>",
        "  <h1>Welcome</h1>",
        "  <p>No team section here.</p>",
        "</div>",
      ].join("\n");
      expect(readTeamMembers("app/page.tsx", content)).toBeNull();
    });

    it("caps at 12 items", () => {
      const items = Array.from(
        { length: 14 },
        (_, i) => `  { name: 'N${i}', role: 'R${i}', bio: 'B${i}' },`,
      ).join("\n");
      const content = `const team = [\n${items}\n];`;
      const result = readTeamMembers("app/page.tsx", content);
      expect(result).toHaveLength(12);
    });
  });

  describe("updateTeamMembersDraft", () => {
    it("updates name, role, bio in place for object literal markup", () => {
      const content = [
        "const team = [",
        "  { name: 'Anna Andersson', role: 'VD', bio: 'Anna har 15 års erfarenhet.' },",
        "  { name: 'Erik Eriksson', role: 'CTO', bio: 'Erik leder vårt tekniska team.' },",
        "];",
      ].join("\n");
      const nextMembers: TeamMemberDraft[] = [
        { name: "Anna A.", role: "VD", bio: "Anna har 15 års erfarenhet inom branschen." },
        { name: "Erik Eriksson", role: "CTO", bio: "Erik leder vårt tekniska team med passion." },
      ];
      const updated = updateTeamMembersDraft(content, [], nextMembers);
      expect(updated).toContain("name: 'Anna A.'");
      expect(updated).toContain("bio: 'Anna har 15 års erfarenhet inom branschen.'");
      expect(updated).toContain("bio: 'Erik leder vårt tekniska team med passion.'");
    });

    it("updates name, role, bio in place for HTML markup", () => {
      const content = [
        '<section className="team">',
        "  <h3>Anna</h3>",
        '  <p className="text-sm">VD</p>',
        "  <p>Anna bio.</p>",
        "  <h3>Erik</h3>",
        '  <p className="text-sm">CTO</p>',
        "  <p>Erik bio.</p>",
        "</section>",
      ].join("\n");
      const nextMembers: TeamMemberDraft[] = [
        { name: "Anna Andersson", role: "VD", bio: "Anna har lång erfarenhet." },
        { name: "Erik Eriksson", role: "CTO", bio: "Erik leder tech." },
      ];
      const updated = updateTeamMembersDraft(content, [], nextMembers);
      expect(updated).toContain("Anna Andersson");
      expect(updated).toContain("Anna har lång erfarenhet.");
      expect(updated).toContain("Erik Eriksson");
      expect(updated).toContain("Erik leder tech.");
    });

    it("returns content unchanged when no edits", () => {
      const content = [
        "const team = [",
        "  { name: 'Anna', role: 'VD', bio: 'Bio.' },",
        "  { name: 'Erik', role: 'CTO', bio: 'Bio.' },",
        "];",
      ].join("\n");
      const nextMembers: TeamMemberDraft[] = [
        { name: "Anna", role: "VD", bio: "Bio." },
        { name: "Erik", role: "CTO", bio: "Bio." },
      ];
      expect(updateTeamMembersDraft(content, [], nextMembers)).toBe(content);
    });
  });
});
