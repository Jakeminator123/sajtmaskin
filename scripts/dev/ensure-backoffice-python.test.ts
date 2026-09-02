import { describe, expect, it } from "vitest";

import { planBackofficePythonBootstrap } from "./ensure-backoffice-python.mjs";

describe("planBackofficePythonBootstrap", () => {
  it("installs requirements when pip already works", () => {
    expect(
      planBackofficePythonBootstrap({ pipAvailable: true, aptAvailable: false }),
    ).toEqual({ action: "install-requirements" });
  });

  it("bootstraps pip via apt when the module is missing", () => {
    expect(
      planBackofficePythonBootstrap({ pipAvailable: false, aptAvailable: true }),
    ).toEqual({ action: "bootstrap-apt-then-install" });
  });

  it("skips instead of failing the environment install when neither pip nor apt exists", () => {
    expect(
      planBackofficePythonBootstrap({ pipAvailable: false, aptAvailable: false }),
    ).toEqual({
      action: "skip",
      reason: "python3 -m pip missing and apt-get is not available",
    });
  });
});
