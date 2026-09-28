import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const recordKostnadsfriPixelHit = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/services/kostnadsfri", () => ({
  recordKostnadsfriPixelHit,
}));

import { createPixelToken } from "@/lib/kostnadsfri/pixel-token";
import { createUnsubscribeToken } from "@/lib/kostnadsfri/unsubscribe";
import { GET } from "./route";

const ENV = { KOSTNADSFRI_PASSWORD_SEED: "test-pixel-route-seed" };

const GIF_SIGNATURE = [0x47, 0x49, 0x46, 0x38]; // GIF8

async function get(url: string) {
  return GET(new NextRequest(url));
}

async function assertGif(res: Response) {
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("image/gif");
  expect(res.headers.get("cache-control")).toBe("no-store, private");
  const bytes = new Uint8Array(await res.arrayBuffer());
  expect([...bytes.slice(0, 4)]).toEqual(GIF_SIGNATURE);
}

beforeEach(() => {
  process.env.KOSTNADSFRI_PASSWORD_SEED = ENV.KOSTNADSFRI_PASSWORD_SEED;
  recordKostnadsfriPixelHit.mockResolvedValue({ counted: true });
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.KOSTNADSFRI_PASSWORD_SEED;
});

describe("GET /api/kostnadsfri/pixel.gif", () => {
  it("counts a valid token with kind=rent", async () => {
    const token = createPixelToken({ email: "ada@acme.se", slug: "acme-ab" }, ENV);
    const res = await get(
      `http://localhost/api/kostnadsfri/pixel.gif?token=${encodeURIComponent(token!)}&kind=rent`,
    );
    await assertGif(res);
    expect(recordKostnadsfriPixelHit).toHaveBeenCalledWith({
      email: "ada@acme.se",
      slug: "acme-ab",
      kind: "rent",
    });
  });

  it("returns a GIF without counting when the token is missing or forged", async () => {
    await assertGif(await get("http://localhost/api/kostnadsfri/pixel.gif?kind=rent"));
    await assertGif(
      await get("http://localhost/api/kostnadsfri/pixel.gif?token=not-a-token&kind=animated"),
    );
    expect(recordKostnadsfriPixelHit).not.toHaveBeenCalled();
  });

  it("returns a GIF without counting when kind is missing or unknown", async () => {
    const token = createPixelToken({ email: "ada@acme.se", slug: "acme-ab" }, ENV);
    await assertGif(
      await get(`http://localhost/api/kostnadsfri/pixel.gif?token=${encodeURIComponent(token!)}`),
    );
    await assertGif(
      await get(
        `http://localhost/api/kostnadsfri/pixel.gif?token=${encodeURIComponent(token!)}&kind=html`,
      ),
    );
    await assertGif(
      await get(
        `http://localhost/api/kostnadsfri/pixel.gif?token=${encodeURIComponent(token!)}&kind=standardmail`,
      ),
    );
    expect(recordKostnadsfriPixelHit).not.toHaveBeenCalled();
  });

  it("does not count an unsubscribe token as a pixel hit", async () => {
    const token = createUnsubscribeToken({ email: "ada@acme.se", slug: "acme-ab" }, ENV);
    await assertGif(
      await get(
        `http://localhost/api/kostnadsfri/pixel.gif?token=${encodeURIComponent(token!)}&kind=rent`,
      ),
    );
    expect(recordKostnadsfriPixelHit).not.toHaveBeenCalled();
  });

  it("still returns a GIF when the database write fails", async () => {
    recordKostnadsfriPixelHit.mockRejectedValueOnce(new Error("db down"));
    const token = createPixelToken({ email: "ada@acme.se", slug: "acme-ab" }, ENV);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    await assertGif(
      await get(
        `http://localhost/api/kostnadsfri/pixel.gif?token=${encodeURIComponent(token!)}&kind=animated`,
      ),
    );
    consoleError.mockRestore();
  });
});
