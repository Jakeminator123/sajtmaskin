import { describe, expect, it } from "vitest";
import scaffoldEmbeddings from "./scaffold-embeddings.json";
import { getAllScaffolds } from "./registry";
import type { ScaffoldId } from "./types";

describe("scaffold-embeddings.json", () => {
  it("has exactly one embedding per registered scaffold id", () => {
    const registered = new Set(getAllScaffolds().map((s) => s.id));
    const embedded = new Set(
      scaffoldEmbeddings.embeddings.map((e: { id: string }) => e.id),
    );
    expect(embedded.size).toBe(registered.size);
    for (const id of registered) {
      expect(embedded.has(id), `missing embedding for ${id}`).toBe(true);
    }
    for (const id of embedded) {
      expect(registered.has(id as ScaffoldId), `orphan embedding id ${id}`).toBe(true);
    }
  });
});
