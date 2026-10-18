import { describe, expect, it } from "vitest";
import { sanitizeKostnadsfriAuthReturnTo } from "@/lib/kostnadsfri/auth-return";
import { sanitizeAuthReturnTo } from "./auth-return";

describe("sanitizeAuthReturnTo", () => {
  const origin = "https://sajtmaskin.se";

  it("behåller kostnadsfri-kontraktet oförändrat", () => {
    expect(sanitizeAuthReturnTo("/kostnadsfri/demo-foretag-ab", origin)).toBe(
      "/kostnadsfri/demo-foretag-ab",
    );
  });

  it.each([
    "/kostnadsfri/demo-foretag-ab?foo=bar",
    "/kostnadsfri/demo-foretag-ab#fragment",
    "/kostnadsfri/demo-foretag-ab?foo=bar#fragment",
    "https://sajtmaskin.se/kostnadsfri/demo-foretag-ab?foo=bar#fragment",
  ])("normaliserar kostnadsfri-returer exakt som befintlig helper: %s", (returnTo) => {
    const existing = sanitizeKostnadsfriAuthReturnTo(returnTo, origin);

    expect(existing).toBe("/kostnadsfri/demo-foretag-ab");
    expect(sanitizeAuthReturnTo(returnTo, origin)).toBe(existing);
  });

  it.each([
    "https://evil.example/kostnadsfri/demo-foretag-ab?foo=bar#fragment",
    "/kostnadsfri/demo-foretag-ab/../../admin",
  ])("avvisar ogiltig kostnadsfri-retur likadant som befintlig helper: %s", (returnTo) => {
    const existing = sanitizeKostnadsfriAuthReturnTo(returnTo, origin);

    expect(existing).toBeNull();
    expect(sanitizeAuthReturnTo(returnTo, origin)).toBe(existing);
  });

  it.each(["pdf", "build"])("accepterar endast analys-resume %s", (resume) => {
    expect(sanitizeAuthReturnTo(`/analys?resume=${resume}`, origin)).toBe(
      `/analys?resume=${resume}`,
    );
  });

  it.each([
    "/analys",
    "/analys/",
    "/analys?resume=other",
    "/analys?resume=pdf&extra=1",
    "/analys?resume=pdf&resume=build",
    "/analys?resume=pdf#fragment",
    "/admin?resume=pdf",
    "/builder?resume=pdf",
    "//evil.example/analys?resume=pdf",
    "https://evil.example/analys?resume=pdf",
  ])("avvisar %s", (returnTo) => {
    expect(sanitizeAuthReturnTo(returnTo, origin)).toBeNull();
  });

  it("normaliserar kostnadsfri-query utan att låta payloaden överleva", () => {
    expect(
      sanitizeAuthReturnTo("/kostnadsfri/demo-foretag-ab?resume=pdf", origin),
    ).toBe("/kostnadsfri/demo-foretag-ab");
  });
});
