import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Source lock: scaffold-scores.mjs connects to the DB on load, so the query
// cannot be imported. The contract below is what the panel's rates rely on.
const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "scaffold-scores.mjs"),
  "utf8",
);

function filterFor(alias: string): string {
  // Tempered token: the captured FILTER body may not cross into another
  // `COUNT(*)`, otherwise an earlier FILTER's condition would satisfy it.
  const match = source.match(
    new RegExp(
      `COUNT\\(\\*\\) FILTER \\(((?:(?!COUNT\\(\\*\\))[\\s\\S])*?)\\)\\s+AS ${alias}\\b`,
    ),
  );
  expect(match, `FILTER for ${alias}`).not.toBeNull();
  return match![1];
}

describe("scaffold-scores.mjs rates", () => {
  it("räknar täljarna som delas med total på samma population som total", () => {
    // retryRate = retry_count / total, embeddingShare = embedding_count / total.
    // `total` exkluderar pending (preview_success IS NULL); täljarna måste göra
    // detsamma, annars kan en andel bli över 100 %.
    expect(filterFor("total")).toContain("preview_success IS NOT NULL");
    expect(filterFor("retry_count")).toContain("preview_success IS NOT NULL");
    expect(filterFor("embedding_count")).toContain("preview_success IS NOT NULL");
  });

  it("skickar DB-målet i JSON så panelen kan visa DEV/PROD", () => {
    expect(source).toMatch(/target: summarizeTarget\(/);
    expect(source).toMatch(/isProdLike:/);
  });
});
