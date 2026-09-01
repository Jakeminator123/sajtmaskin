import { describe, expect, it, vi } from "vitest";

import {
  managedVenvPython,
  pythonCandidates,
  resolvePython,
  systemPythonCandidates,
} from "./python-runtime.mjs";
import { requirementsFingerprint } from "./ensure-backoffice-python.mjs";

describe("portable Python runtime", () => {
  it("prefers the repository venv when it exists", () => {
    const root = "/repo";
    const candidates = pythonCandidates({
      root,
      platform: "linux",
      forced: "",
      pathExists: (path) => path === managedVenvPython(root, "linux"),
    });
    expect(candidates[0]).toEqual({ command: "/repo/.venv/bin/python", args: [] });
  });

  it("resolves the Windows venv path from the requested platform, not the host", () => {
    const root = "C:\\repo";
    const candidates = pythonCandidates({
      root,
      platform: "win32",
      forced: "",
      pathExists: (path) => path === managedVenvPython(root, "win32"),
    });
    expect(candidates[0]).toEqual({
      command: "C:\\repo\\.venv\\Scripts\\python.exe",
      args: [],
    });
  });

  it("honors an explicit interpreter without falling through", () => {
    expect(
      pythonCandidates({ root: "/repo", platform: "win32", forced: "C:\\Python\\python.exe" }),
    ).toEqual([{ command: "C:\\Python\\python.exe", args: [] }]);
  });

  it("includes py launcher fallbacks only on Windows", () => {
    expect(systemPythonCandidates("linux").map((item) => item.command)).toEqual([
      "python3",
      "python",
    ]);
    expect(systemPythonCandidates("win32").map((item) => item.command)).toContain("py");
  });

  it("selects the first interpreter whose probe succeeds", () => {
    const spawnCommand = vi
      .fn()
      .mockReturnValueOnce({ status: 1 })
      .mockReturnValueOnce({ status: 0 });
    const selected = resolvePython({
      root: "/repo",
      platform: "linux",
      forced: "",
      includeManaged: false,
      pathExists: () => false,
      spawnCommand,
    });
    expect(selected?.command).toBe("python");
  });

  it("fingerprints the declared requirements deterministically", () => {
    expect(requirementsFingerprint("streamlit==1\n")).toBe(
      requirementsFingerprint("streamlit==1\n"),
    );
    expect(requirementsFingerprint("streamlit==1\n")).not.toBe(
      requirementsFingerprint("streamlit==2\n"),
    );
  });
});
