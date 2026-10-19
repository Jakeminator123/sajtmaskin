// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getCurrentUser = vi.hoisted(() => vi.fn());
const getSessionIdFromRequest = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth", () => ({
  getCurrentUser,
}));

vi.mock("@/lib/auth/session", () => ({
  getSessionIdFromRequest,
}));

vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

const { POST } = await import("./route");

const savedOpenAiKey = process.env.OPENAI_API_KEY;
const SECRET = "SHOULD-NOT-LEAK";

type FetchMock = ReturnType<typeof vi.fn>;

let fetchMock: FetchMock;

function restoreOpenAiKey(): void {
  if (savedOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = savedOpenAiKey;
}

async function readBody(body: BodyInit | null | undefined): Promise<string> {
  if (body == null) return "";
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (typeof FormData !== "undefined" && body instanceof FormData) return new Response(body).text();
  if (typeof Blob !== "undefined" && body instanceof Blob) return body.text();
  if (body instanceof ArrayBuffer) return new TextDecoder().decode(body);
  if (ArrayBuffer.isView(body)) return new TextDecoder().decode(body);
  return new Response(body).text();
}

async function readOutbound(input: RequestInfo | URL, init?: RequestInit) {
  if (typeof Request !== "undefined" && input instanceof Request) {
    const headers = new Headers(input.headers);
    if (init?.headers) new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    return {
      url: input.url,
      headers,
      signal: init?.signal ?? input.signal,
      rawBody: await readBody(init?.body ?? (await input.clone().text())),
    };
  }
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : String(input);
  return {
    url,
    headers: new Headers(init?.headers),
    signal: init?.signal,
    rawBody: await readBody(init?.body),
  };
}

function jsonResult(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function multipartFieldNames(raw: string): string[] {
  return [...raw.matchAll(/name="([^"]*)"/g)].map((match) => match[1] ?? "");
}

function multipartFieldValue(raw: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(
    `name="${escaped}"[^\\r\\n]*\\r?\\n(?:Content-[^\\r\\n]*\\r?\\n)*\\r?\\n([^\\r\\n]*)`,
  ).exec(raw);
  return match?.[1];
}

function languageFieldName(names: string[]): string | undefined {
  return names.find(
    (name) => name === "languages" || name === "languages[]" || /^languages\[\d+\]$/.test(name),
  );
}

function expectGptTranscribeBody(raw: string, language: "sv" | "en"): void {
  expect(raw.length).toBeGreaterThan(0);
  expect(raw.toLowerCase()).toContain("form-data");
  expect(raw).not.toContain("whisper-1");
  const names = multipartFieldNames(raw);
  expect(names).not.toContain("language");
  expect(multipartFieldValue(raw, "model")).toBe("gpt-transcribe");
  expect(multipartFieldValue(raw, "response_format")).toBe("json");
  const languageName = languageFieldName(names);
  expect(languageName).toBeTruthy();
  const value = multipartFieldValue(raw, languageName ?? "");
  expect(value === language || value === JSON.stringify([language])).toBe(true);
}

function audioRequest(options?: {
  language?: string;
  type?: string;
  name?: string;
  signal?: AbortSignal;
  omitFile?: boolean;
}): NextRequest {
  const form = new FormData();
  if (!options?.omitFile) {
    form.set(
      "audio",
      new File([Uint8Array.from([1, 2, 3, 4])], options?.name ?? "recording.webm", {
        type: options?.type ?? "audio/webm",
      }),
    );
  }
  if (options?.language !== undefined) form.set("language", options.language);
  return new NextRequest("http://localhost/api/transcribe", {
    method: "POST",
    body: form,
    signal: options?.signal,
  });
}

describe("POST /api/transcribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue(null);
    getSessionIdFromRequest.mockReturnValue(null);
    process.env.OPENAI_API_KEY = "test-key";
    fetchMock = vi.fn(async () => {
      throw new Error("unexpected network");
    });
    Object.assign(fetchMock, { Response });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    restoreOpenAiKey();
  });

  it("requires an authenticated user or existing guest session before transcription", async () => {
    const res = await POST(audioRequest());

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ success: false, error: "Unauthorized" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 503 when transcription is not configured", async () => {
    getCurrentUser.mockResolvedValue({ id: "user_1" });
    delete process.env.OPENAI_API_KEY;

    const res = await POST(audioRequest());

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      success: false,
      error: "Transkribering ej konfigurerad. OPENAI_API_KEY saknas.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats a blank API key as missing configuration", async () => {
    getCurrentUser.mockResolvedValue({ id: "user_1" });
    process.env.OPENAI_API_KEY = "   ";

    const res = await POST(audioRequest());

    expect(res.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("transcribes a guest session with default Swedish and a real multipart body", async () => {
    getSessionIdFromRequest.mockReturnValue("guest-session");
    let outbound: Awaited<ReturnType<typeof readOutbound>> | undefined;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      outbound = await readOutbound(input, init);
      return jsonResult({ text: "  Hej från gäst  " });
    });

    const res = await POST(audioRequest());

    if (!outbound) throw new Error("missing outbound request");
    expect(outbound.url).toMatch(/\/v1\/audio\/transcriptions$/);
    expect(outbound.url).not.toContain("language=");
    expect(outbound.headers.get("authorization")).toBe("Bearer test-key");
    expectGptTranscribeBody(outbound.rawBody, "sv");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, transcript: "Hej från gäst" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends English as languages and trims JSON text", async () => {
    getCurrentUser.mockResolvedValue({ id: "user_1" });
    let outbound: Awaited<ReturnType<typeof readOutbound>> | undefined;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      outbound = await readOutbound(input, init);
      return jsonResult({ text: "  Hello  " });
    });

    const res = await POST(audioRequest({ language: "en" }));

    if (!outbound) throw new Error("missing outbound request");
    expect(outbound.headers.get("authorization")).toBe("Bearer test-key");
    expect(outbound.signal).toBeTruthy();
    expectGptTranscribeBody(outbound.rawBody, "en");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, transcript: "Hello" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns the empty-speech warning when JSON text is blank", async () => {
    getCurrentUser.mockResolvedValue({ id: "user_1" });
    fetchMock.mockImplementation(async () => jsonResult({ text: "  \n\t " }));

    const res = await POST(audioRequest({ language: "sv" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      transcript: "",
      warning: "Inget tal upptäcktes i inspelningen.",
    });
  });

  it("maps provider 401 to the Swedish key error without leaking the body", async () => {
    getCurrentUser.mockResolvedValue({ id: "user_1" });
    fetchMock.mockImplementation(async () =>
      jsonResult(
        { error: { message: `invalid_api_key ${SECRET}`, code: "invalid_api_key" } },
        401,
      ),
    );

    const res = await POST(audioRequest());

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      success: false,
      error: "Ogiltig API-nyckel för transkribering.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps provider 429 to the Swedish rate-limit error", async () => {
    getCurrentUser.mockResolvedValue({ id: "user_1" });
    fetchMock.mockImplementation(async () =>
      jsonResult({ error: { message: `rate_limit ${SECRET}`, code: "rate_limit_exceeded" } }, 429),
    );

    const res = await POST(audioRequest());

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      success: false,
      error: "För många förfrågningar. Vänta en stund och försök igen.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("hides provider failures and does not retry", async () => {
    getCurrentUser.mockResolvedValue({ id: "user_1" });
    fetchMock.mockImplementation(async () =>
      jsonResult({ error: { message: `${SECRET} upstream exploded` } }, 500),
    );

    const res = await POST(audioRequest());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({
      success: false,
      error: "Kunde inte transkribera ljud. Försök igen.",
    });
    expect(JSON.stringify(body)).not.toContain(SECRET);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["fr", "EN", "sv-SE"])("rejects %s before calling the provider", async (language) => {
    getCurrentUser.mockResolvedValue({ id: "user_1" });

    const res = await POST(audioRequest({ language }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      success: false,
      error: "Ogiltigt språk. Stöds: sv, en.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a missing audio file", async () => {
    getCurrentUser.mockResolvedValue({ id: "user_1" });

    const res = await POST(audioRequest({ omitFile: true, language: "sv" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: "No audio file provided" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects formats outside the allowlist", async () => {
    getCurrentUser.mockResolvedValue({ id: "user_1" });

    const res = await POST(audioRequest({ type: "text/plain", name: "notes.txt" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toContain("Unsupported audio format");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects files over 25MB before calling the provider", async () => {
    getCurrentUser.mockResolvedValue({ id: "user_1" });
    class OversizedAudioFile extends File {
      override get size(): number {
        return 25 * 1024 * 1024 + 1;
      }
    }
    const audio = new OversizedAudioFile([Uint8Array.from([1])], "recording.webm", {
      type: "audio/webm",
    });
    const form = new FormData();
    vi.spyOn(form, "get").mockImplementation((name: string) => {
      if (name === "audio") return audio;
      if (name === "language") return "sv";
      return null;
    });
    const req = new NextRequest("http://localhost/api/transcribe", {
      method: "POST",
      body: form,
    });
    vi.spyOn(req, "formData").mockResolvedValue(form);

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      success: false,
      error: "Audio file too large (max 25MB)",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not call the provider when the request is already aborted", async () => {
    getCurrentUser.mockResolvedValue({ id: "user_1" });
    const controller = new AbortController();
    controller.abort();

    const res = await POST(audioRequest({ signal: controller.signal }));

    expect(res.status).toBe(499);
    expect(await res.json()).toEqual({ success: false, error: "Förfrågan avbröts." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("turns an aborted provider call into 499 without leaking the error", async () => {
    getCurrentUser.mockResolvedValue({ id: "user_1" });
    const controller = new AbortController();
    let signalLinked = false;
    let rawBody = "";
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const outbound = await readOutbound(input, init);
      rawBody = outbound.rawBody;
      const signal = outbound.signal;
      const wasAborted = signal?.aborted === true;
      controller.abort();
      signalLinked = signal != null && !wasAborted && signal.aborted === true;
      const error = new Error(`${SECRET} aborted`);
      error.name = "APIUserAbortError";
      throw error;
    });

    const res = await POST(audioRequest({ signal: controller.signal }));
    const body = await res.json();

    expect(signalLinked).toBe(true);
    expectGptTranscribeBody(rawBody, "sv");
    expect(res.status).toBe(499);
    expect(body).toEqual({ success: false, error: "Förfrågan avbröts." });
    expect(JSON.stringify(body)).not.toContain(SECRET);
  });
});
