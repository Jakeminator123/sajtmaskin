import { describe, expect, it, vi } from "vitest";

// `resolve-file-context` drar in db-klienten, som kräver POSTGRES_URL vid import.
vi.mock("./resolve-file-context", () => ({ resolveFileContext: vi.fn() }));

import { buildOpenClawContextBlock } from "./server-context";

const recentMessages = [
  { role: "user", content: "[Första briefen] Bygg en sajt för Zax Frisör i Kista" },
  { role: "assistant", content: "Klart. [genererade 3 filer: app/page.tsx, …]" },
  { role: "user", content: "Gör headern mörkare" },
];

describe("buildOpenClawContextBlock — builderns historik", () => {
  it("märker raderna som användarens samtal med byggmotorn i buildern", () => {
    const block = buildOpenClawContextBlock({ page: "builder", recentMessages });

    expect(block).toContain("mellan användaren och byggmotorn (byggmotorns svar är inte dina)");
    expect(block).toContain("  användaren: [Första briefen] Bygg en sajt för Zax Frisör i Kista");
    expect(block).toContain("  byggmotorn: Klart. [genererade 3 filer: app/page.tsx, …]");
    expect(block).not.toContain("  assistant: ");
  });

  it("behåller de råa rollerna utanför buildern", () => {
    const block = buildOpenClawContextBlock({ page: "landing", recentMessages });

    expect(block).toContain("Senaste meddelanden i buildern:");
    expect(block).toContain("  assistant: Klart.");
  });
});
