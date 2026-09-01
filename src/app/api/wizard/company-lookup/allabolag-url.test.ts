import { describe, expect, it } from "vitest";
import { resolveAllabolagCompanyUrl } from "./allabolag-url";

describe("resolveAllabolagCompanyUrl", () => {
  it("accepts relative allabolag company links", () => {
    const url = resolveAllabolagCompanyUrl("/foretag/acme-ab/5560000000");
    expect(url?.hostname).toBe("www.allabolag.se");
    expect(url?.pathname).toContain("/foretag/");
    expect(url?.protocol).toBe("https:");
  });

  it("accepts absolute allabolag hosts", () => {
    expect(
      resolveAllabolagCompanyUrl("https://allabolag.se/foretag/acme-ab/5560000000")?.hostname,
    ).toBe("allabolag.se");
  });

  it("rejects substring spoofs and foreign hosts", () => {
    expect(
      resolveAllabolagCompanyUrl("https://evil.example/allabolag.se/foretag/acme"),
    ).toBeNull();
    expect(resolveAllabolagCompanyUrl("https://not-allabolag.se/foretag/acme")).toBeNull();
    expect(resolveAllabolagCompanyUrl("http://169.254.169.254/foretag/x")).toBeNull();
  });
});
