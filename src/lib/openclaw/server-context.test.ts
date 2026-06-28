import { describe, it, expect, vi, beforeEach } from "vitest";

// resolveFileContext fetches generated files via version-manager. Mock it so the
// test can assert WHETHER files are fetched (i.e. whether the ownership gate let
// the read through) without a DB.
const getVersionFiles = vi.fn(async () => [
  { path: "app/page.tsx", content: "export default function Page(){return null;}", language: "tsx" },
]);
const getLatestVersionFiles = vi.fn(async () => [
  { path: "app/page.tsx", content: "export default function Page(){return null;}", language: "tsx" },
]);
vi.mock("@/lib/gen/version-manager", () => ({
  getVersionFiles: (...args: unknown[]) => getVersionFiles(...(args as [])),
  getLatestVersionFiles: (...args: unknown[]) => getLatestVersionFiles(...(args as [])),
}));

import {
  buildOpenClawContextSystemMessage,
  type OpenClawOwnershipVerifier,
} from "./server-context";

const debugContext = {
  page: "builder",
  chatId: "forged-or-owned-chat",
  activeVersionId: "forged-or-owned-version",
};
const reviewMessages = [{ role: "user", content: "granska koden i projektet" }];

beforeEach(() => {
  getVersionFiles.mockClear();
  getLatestVersionFiles.mockClear();
});

describe("buildOpenClawContextSystemMessage ownership gate (Codex P1)", () => {
  it("does NOT fetch generated files when no verifier is provided (fail closed)", async () => {
    const { content } = await buildOpenClawContextSystemMessage({
      messages: reviewMessages,
      context: debugContext,
      debug: true,
    });
    expect(content).not.toContain("[GENERERADE FILER");
    expect(content).not.toContain("[FILMANIFEST");
    expect(getVersionFiles).not.toHaveBeenCalled();
    expect(getLatestVersionFiles).not.toHaveBeenCalled();
  });

  it("does NOT fetch generated files for a forged/unowned id", async () => {
    const verifyOwnership: OpenClawOwnershipVerifier = vi.fn(async () => null);
    const { content } = await buildOpenClawContextSystemMessage({
      messages: reviewMessages,
      context: debugContext,
      debug: true,
      verifyOwnership,
    });
    expect(verifyOwnership).toHaveBeenCalledWith(
      "forged-or-owned-chat",
      "forged-or-owned-version",
    );
    expect(content).not.toContain("[GENERERADE FILER");
    expect(content).not.toContain("[FILMANIFEST");
    expect(getVersionFiles).not.toHaveBeenCalled();
  });

  it("fetches generated files only for the ownership-verified ids", async () => {
    const verifyOwnership: OpenClawOwnershipVerifier = vi.fn(async () => ({
      chatId: "owned-chat",
      versionId: "owned-version",
    }));
    const { content } = await buildOpenClawContextSystemMessage({
      messages: reviewMessages,
      context: debugContext,
      debug: true,
      verifyOwnership,
    });
    expect(content).toContain("[GENERERADE FILER");
    expect(content).toContain("app/page.tsx");
    // Read uses the VERIFIED version id, not the client-supplied one.
    expect(getVersionFiles).toHaveBeenCalledWith("owned-version");
  });
});
