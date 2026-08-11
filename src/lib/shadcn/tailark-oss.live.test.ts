/**
 * Live smoke: prove the wired `@tailark-oss` URL template can actually reach
 * Tailark's public OSS registry and hydrate Mist items with file content.
 *
 * This is intentionally a real HTTP check — the whole point of the Tailark OSS
 * switch is that gated `tailark.com` returned 401 and silently yielded null.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const COMPONENTS_JSON = JSON.parse(
  readFileSync(path.join(process.cwd(), "components.json"), "utf8"),
) as { registries?: Record<string, string> };

const SEED = JSON.parse(
  readFileSync(path.join(process.cwd(), "config", "community-registries.json"), "utf8"),
) as Array<{
  namespace: string;
  sectionMappings?: Record<string, string[]>;
}>;

const FETCH_MS = 8_000;

describe("tailark-oss live connectivity", () => {
  it(
    "reaches seeded Mist items over the configured Radix OSS URL",
    async () => {
      const urlTemplate = COMPONENTS_JSON.registries?.["@tailark-oss"];
      expect(urlTemplate).toBe("https://oss.tailark.com/r/radix/{name}.json");

      const seed = SEED.find((entry) => entry.namespace === "@tailark-oss");
      expect(seed?.sectionMappings).toBeTruthy();

      // One item per major section — enough to catch host/path/auth/name drift.
      const samples = [
        seed!.sectionMappings!.hero[0],
        seed!.sectionMappings!.pricing[0],
        seed!.sectionMappings!.stats[2],
        seed!.sectionMappings!.contact[0],
        seed!.sectionMappings!.features[0],
      ];

      for (const name of samples) {
        const url = urlTemplate!.replace("{name}", encodeURIComponent(name));
        const response = await fetch(url, {
          signal: AbortSignal.timeout(FETCH_MS),
          headers: { Accept: "application/json" },
        });
        expect(response.status, `${name} → ${url}`).toBe(200);

        const item = (await response.json()) as {
          name?: string;
          files?: Array<{ content?: string }>;
        };
        expect(item.name, name).toBe(name);
        expect(
          Array.isArray(item.files) && item.files.some((file) => Boolean(file.content)),
          `${name} must include file content`,
        ).toBe(true);
      }
    },
    45_000,
  );

  it(
    "does not treat the gated Quartz host as reachable without auth",
    async () => {
      // Regression guard: if someone points us back at tailark.com, this fails
      // for the same reason production silently skipped Tailark before.
      const response = await fetch("https://tailark.com/r/hero-section-1.json", {
        signal: AbortSignal.timeout(FETCH_MS),
        headers: { Accept: "application/json" },
      });
      expect(response.status).toBe(401);
    },
    15_000,
  );
});
