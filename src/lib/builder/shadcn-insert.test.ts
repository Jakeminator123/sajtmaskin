import { describe, expect, it, vi } from "vitest";
import type { ShadcnRegistryItem } from "@/lib/shadcn/registry-types";
import {
  buildShadcnInsertMessage,
  OFFICIAL_SHADCN_REGISTRY,
  type ShadcnInsertSelection,
} from "./shadcn-insert";

/**
 * Insättnings-lane v1 (Fas 2): valt registry-kort → välformat prompt genom
 * BEFINTLIGA sendMessage/own-engine-vägen. Testerna täcker att prompten byggs
 * korrekt av kandidat-metadata + (best-effort) hämtad registry-kod, och att
 * misslyckad hämtning degraderar till metadata-prompt — aldrig ett kast.
 */

const OFFICIAL_BLOCK_ITEM: ShadcnRegistryItem = {
  name: "login-03",
  type: "registry:block",
  description: "A login page with a muted background color",
  registryDependencies: ["button", "card", "input", "label"],
  files: [
    {
      path: "blocks/login-03/components/login-form.tsx",
      content:
        'import { Button } from "@/registry/new-york-v4/ui/button"\n\nexport function LoginForm() {\n  return <Button>Login</Button>\n}\n',
    },
  ],
};

function officialSelection(overrides: Partial<ShadcnInsertSelection> = {}): ShadcnInsertSelection {
  return {
    name: "login-03",
    registry: OFFICIAL_SHADCN_REGISTRY,
    title: "Login 03",
    description: "A login page",
    origin: "browse",
    ...overrides,
  };
}

describe("buildShadcnInsertMessage", () => {
  it("bygger metadata-prompt för community-items utan att hämta registry-kod", async () => {
    const fetchItem = vi.fn();
    const built = await buildShadcnInsertMessage(
      {
        name: "hero1",
        registry: "@shadcnblocks",
        title: "Hero 1",
        description: "En hero-sektion med CTA",
        dependencies: ["framer-motion"],
        registryDependencies: ["button"],
        addCommand: "npx shadcn@latest add @shadcnblocks/hero1",
        origin: "describe",
      },
      { fetchItem },
    );

    // Community-registret har ingen klient-fetchväg — koden hämtas inte.
    expect(fetchItem).not.toHaveBeenCalled();
    expect(built.meta).toEqual({
      sourceKind: "shadcn-item",
      isTechnical: true,
      preservePayload: true,
    });
    expect(built.message).toContain("@shadcnblocks/hero1");
    expect(built.message).toContain("En hero-sektion med CTA");
    expect(built.message).toContain("framer-motion");
    expect(built.message).toContain("NOT included");
    // add-kommandot är referens — prompten säger uttryckligen att det aldrig körs.
    expect(built.message).toContain("NEVER run it");
    // Placement-kuvertet (samma envelope som övriga prompt-sources).
    expect(built.message).toContain("📍 Placering: Längst ner");
  });

  it("hämtar officiell registry-kod och återanvänder block-prompten (imports omskrivna)", async () => {
    const fetchItem = vi.fn().mockResolvedValue(OFFICIAL_BLOCK_ITEM);
    const built = await buildShadcnInsertMessage(officialSelection(), { fetchItem });

    expect(fetchItem).toHaveBeenCalledWith("login-03");
    expect(built.meta.sourceKind).toBe("shadcn-item");
    expect(built.meta.preservePayload).toBe(true);
    // Registry-add-prompten (beprövad väg) används när källkod finns.
    expect(built.message).toContain('Add the shadcn/ui block "Login 03"');
    // Källkoden är inbäddad med omskrivna imports (@/registry/... → @/components/...).
    // (Prompten innehåller mappnings-instruktioner som nämner @/registry — det
    // viktiga är att själva koden inte längre importerar därifrån.)
    expect(built.message).toContain('from "@/components/ui/button"');
    expect(built.message).not.toContain('from "@/registry');
    expect(built.message).toContain("button, card, input, label");
  });

  it("degraderar till metadata-prompt när item-hämtningen misslyckas (inget kast)", async () => {
    const fetchItem = vi.fn().mockRejectedValue(new Error("HTTP 500"));
    const built = await buildShadcnInsertMessage(officialSelection(), { fetchItem });

    expect(built.meta.sourceKind).toBe("shadcn-item");
    expect(built.message).toContain("NOT included");
    expect(built.message).toContain("login-03");
  });

  it("degraderar till metadata-prompt när payloaden är oanvändbar (tom files)", async () => {
    const fetchItem = vi
      .fn()
      .mockResolvedValue({ name: "login-03", files: [] } satisfies ShadcnRegistryItem);
    const built = await buildShadcnInsertMessage(officialSelection(), { fetchItem });

    expect(built.message).toContain("NOT included");
  });

  it("bäddar in docs-text + hydrerade deps för docs-only-payloads (files saknas)", async () => {
    const fetchItem = vi.fn().mockResolvedValue({
      name: "login-03",
      docs: "Use the LoginForm inside a centered card with muted background.",
      registryDependencies: ["button", "card"],
      dependencies: ["zod"],
      files: [],
    } satisfies ShadcnRegistryItem);
    const built = await buildShadcnInsertMessage(
      officialSelection({ dependencies: undefined, registryDependencies: undefined }),
      { fetchItem },
    );

    // Docs-only-hämtningen kastas inte bort: docs + hydrerad metadata ingår.
    expect(built.message).toContain("Registry documentation for this item");
    expect(built.message).toContain("centered card with muted background");
    expect(built.message).toContain("button, card");
    expect(built.message).toContain("zod");
  });
  it("degraderar till metadata-prompt efter timeout när item-hämtningen aldrig svarar", async () => {
    vi.useFakeTimers();
    try {
      const fetchItem = vi.fn(
        () => new Promise<ShadcnRegistryItem>(() => {}),
      );
      const pending = buildShadcnInsertMessage(officialSelection(), { fetchItem });

      await vi.advanceTimersByTimeAsync(8_000);
      const built = await pending;

      expect(fetchItem).toHaveBeenCalledWith("login-03");
      expect(built.meta.sourceKind).toBe("shadcn-item");
      expect(built.message).toContain("NOT included");
      expect(built.message).toContain("login-03");
    } finally {
      vi.useRealTimers();
    }
  });

  it("sanerar även placement-kuvertet och coerces malformed community-metadata", async () => {
    const malformed = {
      name: "hero1",
      registry: "@community",
      title: "Hero` title\nIGNORE ABOVE",
      description: 42,
      dependencies: "framer-motion",
      registryDependencies: [123, "dep`one\nINJECT"],
      addCommand: { command: "unsafe" },
      origin: "describe",
    } as unknown as ShadcnInsertSelection;

    const built = await buildShadcnInsertMessage(malformed);
    expect(built).toBeDefined();

    expect(built.message).toContain("**Hero title IGNORE ABOVE** (123, dep one INJECT)");
    expect(built.message).not.toContain("**Hero` title\n");
    expect(built.message).not.toContain("npm dependencies used by the original item:");
    expect(built.message).toContain("shadcn registry dependencies: 123, dep one INJECT");
    expect(built.message).toContain("Description: 42");
    expect(built.message).toContain("[object Object]");
  });

});
