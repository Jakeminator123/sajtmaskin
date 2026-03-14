import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  readAvailableDevLogSlugs,
  readDevLogEntries,
} from "./dev-log-reader";

const logDir = path.join(process.cwd(), "logs");
const docPath = path.join(logDir, "sajtmaskin-local-document.txt");
const originalDoc = fs.existsSync(docPath)
  ? fs.readFileSync(docPath, "utf8")
  : null;

afterEach(() => {
  if (originalDoc === null) {
    if (fs.existsSync(docPath)) {
      fs.unlinkSync(docPath);
    }
    return;
  }
  fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(docPath, originalDoc, "utf8");
});

describe("dev-log-reader", () => {
  it("parses pretty log blocks and preserves slug information", () => {
    fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(
      docPath,
      [
        "2026-03-14T15:00:00.000Z [in-progress] [slug:test-site]",
        JSON.stringify({ type: "site.start", message: "Build site", slug: "test-site" }, null, 2),
        "",
        "2026-03-14T15:00:05.000Z [latest] [slug:another-site]",
        JSON.stringify({ type: "site.done", message: "Done" }, null, 2),
        "",
      ].join("\n"),
      "utf8",
    );

    const entries = readDevLogEntries({ limit: 10 });
    expect(entries).toHaveLength(2);
    expect(entries[0].slug).toBe("another-site");
    expect(entries[1].slug).toBe("test-site");
    expect(entries[1].data.type).toBe("site.start");
  });

  it("filters entries by slug and reports available slugs", () => {
    fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(
      docPath,
      [
        "2026-03-14T15:00:00.000Z [in-progress] [slug:first-site]",
        JSON.stringify({ type: "site.start", message: "First" }, null, 2),
        "",
        "2026-03-14T15:00:05.000Z [latest] [slug:second-site]",
        JSON.stringify({ type: "site.done", message: "Second" }, null, 2),
        "",
      ].join("\n"),
      "utf8",
    );

    const filtered = readDevLogEntries({ slug: "first-site", limit: 10 });
    const slugs = readAvailableDevLogSlugs();

    expect(filtered).toHaveLength(1);
    expect(filtered[0].slug).toBe("first-site");
    expect(slugs).toEqual(["second-site", "first-site"]);
  });
});
