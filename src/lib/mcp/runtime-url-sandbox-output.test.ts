import { describe, expect, it } from "vitest";
import {
  combineSandboxCommandStreams,
  getSandboxCommandTextOutput,
  sandboxCommandOutputToString,
} from "./runtime-url";

describe("sandboxCommandOutputToString", () => {
  it("returns strings unchanged", () => {
    expect(sandboxCommandOutputToString("hello")).toBe("hello");
  });

  it("decodes Buffers as utf8", () => {
    expect(sandboxCommandOutputToString(Buffer.from("npm ERR!", "utf8"))).toBe("npm ERR!");
  });

  it("decodes Uint8Array (UTF-8)", () => {
    expect(sandboxCommandOutputToString(new Uint8Array([0xc3, 0xa5]))).toBe("å");
  });

  it("combines stdout and stderr", () => {
    const combined = combineSandboxCommandStreams({
      stdout: Buffer.from("out\n"),
      stderr: Buffer.from("err"),
    });
    expect(combined).toContain("out");
    expect(combined).toContain("err");
  });
});

describe("getSandboxCommandTextOutput", () => {
  it("uses async output('both') when present", async () => {
    const text = await getSandboxCommandTextOutput({
      output: async () => "tsc error TS2304\n",
    });
    expect(text).toContain("TS2304");
  });

  it("falls back to stdout/stderr buffers", async () => {
    const text = await getSandboxCommandTextOutput({
      stdout: Buffer.from("ok"),
      stderr: Buffer.from("warn"),
    });
    expect(text).toContain("ok");
    expect(text).toContain("warn");
  });
});
