// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { readRequestFormDataWithLimit, readRequestJsonWithLimit, readRequestTextWithLimit } from "./read-limited-body";

afterEach(() => vi.restoreAllMocks());

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

describe("readRequestFormDataWithLimit", () => {
  it("preserves binary files and Unicode metadata at the exact wire-byte limit", async () => {
    const fileBytes = new Uint8Array([0, 255, 195, 165, 0]);
    const form = new FormData();
    form.append("file", new File([fileBytes], "räka.bin", { type: "application/octet-stream" }));
    form.append("description", "Svenska 日本 😀");
    const encoded = new Request("https://example.test", { method: "POST", body: form });
    const bytes = await encoded.arrayBuffer();
    const request = new Request("https://example.test", { method: "POST", body: bytes, headers: encoded.headers });

    const result = await readRequestFormDataWithLimit(request, bytes.byteLength);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected bounded multipart data");
    const file = result.formData.get("file") as File;
    expect(file.name).toBe("räka.bin");
    expect(file.type).toBe("application/octet-stream");
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(fileBytes);
    expect(result.formData.get("description")).toBe("Svenska 日本 😀");
  });

  it.each([null, "1", "invalid"])("cancels an oversized stream before parsing with Content-Length %s", async (declaredLength) => {
    let producedChunks = 0;
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        producedChunks += 1;
        controller.enqueue(new Uint8Array(4));
        if (producedChunks === 100) controller.close();
      },
      cancel,
    });
    const headers = new Headers({ "content-type": "multipart/form-data; boundary=test" });
    if (declaredLength !== null) headers.set("content-length", declaredLength);
    const request = new Request("https://example.test", {
      method: "POST", body: stream, headers, duplex: "half",
    } as RequestInit & { duplex: "half" });
    const parse = vi.spyOn(Response.prototype, "formData");

    await expect(readRequestFormDataWithLimit(request, 10)).resolves.toEqual({ ok: false, reason: "too_large" });

    expect(cancel).toHaveBeenCalledOnce();
    expect(producedChunks).toBeLessThan(100);
    expect(stream.locked).toBe(false);
    expect(parse).not.toHaveBeenCalled();
  });

  it("rejects an oversized declared body without reading or parsing it", async () => {
    const request = {
      headers: new Headers({ "content-length": "101" }),
      get body(): never { throw new Error("body must not be read"); },
    } as unknown as Request;
    const parse = vi.spyOn(Response.prototype, "formData");

    await expect(readRequestFormDataWithLimit(request, 100)).resolves.toEqual({ ok: false, reason: "too_large" });
    expect(parse).not.toHaveBeenCalled();
  });

  it("does not fall back to an unbounded parser for malformed multipart data", async () => {
    const request = new Request("https://example.test", {
      method: "POST", headers: { "content-type": "multipart/form-data; boundary=test" }, body: "broken",
    });
    const unboundedParse = vi.spyOn(request, "formData");

    await expect(readRequestFormDataWithLimit(request, 100)).rejects.toThrow();
    expect(unboundedParse).not.toHaveBeenCalled();
  });
});
