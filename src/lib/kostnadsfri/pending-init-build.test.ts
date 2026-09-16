import { afterEach, describe, expect, it } from "vitest";
import type { MiniWizardData } from "@/lib/kostnadsfri";
import {
  KOSTNADSFRI_PENDING_INIT_STORAGE_KEY,
  KOSTNADSFRI_PENDING_INIT_TTL_MS,
  clearPendingInitBuild,
  clearPendingInitBuildStorageForTests,
  persistPendingInitBuild,
  readPendingInitBuild,
} from "./pending-init-build";

function memoryPendingStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

const wizard: MiniWizardData = {
  companyName: "Zax 2.0 AB",
  industry: "health",
  website: "",
  location: "Kista",
  description: "Frisör",
  purposes: ["leads"],
  targetAudience: "",
  usp: "Kvällar",
  designVibe: "modern",
  paletteName: null,
  colorPrimary: null,
  colorSecondary: null,
  colorAccent: null,
};

afterEach(() => {
  clearPendingInitBuildStorageForTests();
});

describe("pending kostnadsfri init build", () => {
  it("round-trips wizard answers for the same slug", () => {
    persistPendingInitBuild({
      slug: "zax-2-0-ab",
      wizardData: wizard,
      followupAnswers: { usp: "Drop-in" },
      ready: true,
    });
    expect(readPendingInitBuild("zax-2-0-ab")?.wizardData.usp).toBe("Kvällar");
    expect(readPendingInitBuild("zax-2-0-ab")?.followupAnswers.usp).toBe("Drop-in");
    expect(readPendingInitBuild("zax-2-0-ab")?.ready).toBe(true);
    expect(readPendingInitBuild("other-campaign")).toBeNull();
  });

  it("expires after the TTL and ignores another invitation", () => {
    const now = 1_000_000;
    persistPendingInitBuild(
      { slug: "zax-2-0-ab", wizardData: wizard },
      undefined,
      now,
    );
    expect(
      readPendingInitBuild("zax-2-0-ab", undefined, now + KOSTNADSFRI_PENDING_INIT_TTL_MS + 1),
    ).toBeNull();
    persistPendingInitBuild({ slug: "zax-2-0-ab", wizardData: wizard });
    clearPendingInitBuild("other-campaign");
    expect(readPendingInitBuild("zax-2-0-ab")).not.toBeNull();
    clearPendingInitBuild("zax-2-0-ab");
    expect(readPendingInitBuild("zax-2-0-ab")).toBeNull();
  });

  it("removes an expired pending record instead of leaving it in storage", () => {
    const storage = memoryPendingStorage();
    const now = 1_000_000;
    persistPendingInitBuild({ slug: "zax-2-0-ab", wizardData: wizard }, storage, now);
    expect(storage.getItem(KOSTNADSFRI_PENDING_INIT_STORAGE_KEY)).toBeTruthy();

    expect(
      readPendingInitBuild(
        "other-campaign",
        storage,
        now + KOSTNADSFRI_PENDING_INIT_TTL_MS + 1,
      ),
    ).toBeNull();
    expect(storage.getItem(KOSTNADSFRI_PENDING_INIT_STORAGE_KEY)).toBeNull();
  });
});
