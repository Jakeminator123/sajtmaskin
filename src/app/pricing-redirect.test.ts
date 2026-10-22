import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("marketing /pricing redirect", () => {
  it("sends /pricing to /priser permanently", async () => {
    const redirects = await nextConfig.redirects?.();
    expect(redirects).toEqual(
      expect.arrayContaining([
        {
          source: "/pricing",
          destination: "/priser",
          permanent: true,
        },
      ]),
    );
  });
});
