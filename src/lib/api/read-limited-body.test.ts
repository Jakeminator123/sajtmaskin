import { describe, expect, it } from "vitest";
import { readRequestJsonWithLimit, readRequestTextWithLimit } from "./read-limited-body";

describe("readRequestTextWithLimit", () => {
  it("reads a body up to the exact UTF-8 byte limit", async () => {
    const request = new Request("https://example.test", { method: "POST", body: "åäö" });

    await expect(readRequestTextWithLimit(request, 6)).resolves.toEqual({
      ok: true,
      text: "åäö",
    });
  });

  it("rejects a streamed body once its byte limit is exceeded", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("1234"));
        controller.enqueue(new TextEncoder().encode("56"));
        controller.close();
      },
    });
    const request = new Request("https://example.test", {
      method: "POST",
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    await expect(readRequestTextWithLimit(request, 5)).resolves.toEqual({
      ok: false,
      reason: "too_large",
    });
  });

  it("rejects an oversized declared length without reading the stream", async () => {
    const request = {
      headers: new Headers({ "content-length": "101" }),
      get body(): never {
        throw new Error("body must not be read");
      },
    } as unknown as Request;

    await expect(readRequestTextWithLimit(request, 100)).resolves.toEqual({
      ok: false,
      reason: "too_large",
    });
  });
});

describe("readRequestJsonWithLimit", () => {
  it("parses JSON within the byte limit", async () => {
    const request = new Request("https://example.test", { method: "POST", body: '{"ok":true}' });

    await expect(readRequestJsonWithLimit(request, 32)).resolves.toEqual({
      ok: true,
      value: { ok: true },
    });
  });

  it("distinguishes malformed JSON from an oversized body", async () => {
    const malformed = new Request("https://example.test", { method: "POST", body: "{" });
    await expect(readRequestJsonWithLimit(malformed, 32)).resolves.toEqual({
      ok: false,
      reason: "invalid_json",
    });

    const oversized = new Request("https://example.test", { method: "POST", body: "{}" });
    await expect(readRequestJsonWithLimit(oversized, 1)).resolves.toEqual({
      ok: false,
      reason: "too_large",
    });
  });
});
