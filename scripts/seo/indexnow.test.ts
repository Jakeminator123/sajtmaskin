import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  INDEXNOW_KEY,
  INDEXNOW_KEY_URL,
  sitemapUrls,
  submitIndexNow,
} from "./indexnow.mjs";

const SITEMAP = `<urlset><url><loc>https://sajtmaskin.se</loc></url><url><loc>https://sajtmaskin.se/priser</loc></url><url><loc>https://sajtmaskin.se/priser</loc></url><url><loc>https://annan.example/x</loc></url></urlset>`;

function fakeFetch(overrides: Record<string, Response> = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (overrides[url]) return overrides[url];
    if (url.endsWith("/sitemap.xml")) return new Response(SITEMAP);
    if (url === INDEXNOW_KEY_URL) return new Response(`${INDEXNOW_KEY}\n`);
    return new Response(null, { status: 202 });
  };
  return { calls, fetcher: fetcher as typeof fetch };
}

describe("indexnow", () => {
  it("serves the key file that the script points search engines to", () => {
    const file = readFileSync(resolve(process.cwd(), `public/${INDEXNOW_KEY}.txt`), "utf8");
    expect(file.trim()).toBe(INDEXNOW_KEY);
    expect(INDEXNOW_KEY).toMatch(/^[a-f0-9]{32}$/);
  });

  it("takes each production address once and skips other hosts", () => {
    expect(sitemapUrls(SITEMAP)).toEqual(["https://sajtmaskin.se", "https://sajtmaskin.se/priser"]);
    expect(sitemapUrls("<urlset></urlset>")).toEqual([]);
  });

  it("posts the sitemap addresses with key and key location", async () => {
    const { calls, fetcher } = fakeFetch();
    const result = await submitIndexNow({ fetcher, log: () => {} });
    expect(result.submitted).toBe(2);
    const post = calls.find((call) => call.init?.method === "POST");
    expect(post?.url).toBe("https://api.indexnow.org/indexnow");
    // Field names are spelled out here because IndexNow rejects any other spelling.
    expect(JSON.parse(String(post?.init?.body))).toEqual({
      host: "sajtmaskin.se",
      key: "ea26d3db1b0e560f960e899258a2589d",
      keyLocation: "https://sajtmaskin.se/ea26d3db1b0e560f960e899258a2589d.txt",
      urlList: ["https://sajtmaskin.se", "https://sajtmaskin.se/priser"],
    });
    expect(new Headers(post?.init?.headers).get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
  });

  it("sends nothing on a dry run or before the key file is live", async () => {
    const dry = fakeFetch();
    await submitIndexNow({ dryRun: true, fetcher: dry.fetcher, log: () => {} });
    expect(dry.calls.some((call) => call.init?.method === "POST")).toBe(false);

    const missing = fakeFetch({ [INDEXNOW_KEY_URL]: new Response("Not found", { status: 404 }) });
    await expect(submitIndexNow({ fetcher: missing.fetcher, log: () => {} })).rejects.toThrow(
      /Nyckelfilen/,
    );
    expect(missing.calls.some((call) => call.init?.method === "POST")).toBe(false);
  });

  it("fails loudly when the search engine rejects the list", async () => {
    const rejected = fakeFetch({
      "https://api.indexnow.org/indexnow": new Response(null, { status: 403 }),
    });
    await expect(submitIndexNow({ fetcher: rejected.fetcher, log: () => {} })).rejects.toThrow(
      /403/,
    );
  });
});
