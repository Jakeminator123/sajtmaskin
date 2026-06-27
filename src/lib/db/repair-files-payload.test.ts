import { describe, expect, it } from "vitest";
import {
  REPAIRED_FILES_ENVELOPE_VERSION,
  decodeRepairedFilesPayload,
  encodeRepairedFilesEnvelope,
  hashFilesJson,
} from "./repair-files-payload";

const BASE_A = '[{"path":"app/page.tsx","content":"A"}]';
const BASE_B = '[{"path":"app/page.tsx","content":"B"}]';
const REPAIRED = '[{"path":"app/page.tsx","content":"A-fixed"}]';

describe("hashFilesJson", () => {
  it("is deterministic for the same input and differs for different input", () => {
    expect(hashFilesJson(BASE_A)).toBe(hashFilesJson(BASE_A));
    expect(hashFilesJson(BASE_A)).not.toBe(hashFilesJson(BASE_B));
    // SHA-256 hex.
    expect(hashFilesJson(BASE_A)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("encodeRepairedFilesEnvelope", () => {
  it("wraps the repaired files with the base hash", () => {
    const raw = encodeRepairedFilesEnvelope({ repairedFilesJson: REPAIRED, baseFilesJson: BASE_A });
    const env = JSON.parse(raw);
    expect(env.v).toBe(REPAIRED_FILES_ENVELOPE_VERSION);
    expect(env.baseFilesHash).toBe(hashFilesJson(BASE_A));
    expect(env.files).toEqual(JSON.parse(REPAIRED));
  });

  it("throws when the repaired payload is not a JSON array", () => {
    expect(() =>
      encodeRepairedFilesEnvelope({ repairedFilesJson: '{"not":"an array"}', baseFilesJson: BASE_A }),
    ).toThrow();
  });
});

describe("decodeRepairedFilesPayload", () => {
  it("decodes an envelope and exposes the promotable files JSON + base hash", () => {
    const raw = encodeRepairedFilesEnvelope({ repairedFilesJson: REPAIRED, baseFilesJson: BASE_A });
    const decoded = decodeRepairedFilesPayload(raw);
    expect(decoded).not.toBeNull();
    expect(decoded?.kind).toBe("envelope");
    if (decoded?.kind === "envelope") {
      expect(decoded.baseFilesHash).toBe(hashFilesJson(BASE_A));
      // The promotable files JSON round-trips to the original repaired files.
      expect(JSON.parse(decoded.filesJson)).toEqual(JSON.parse(REPAIRED));
    }
  });

  it("treats a plain array (pre-envelope row) as legacy and preserves the raw JSON", () => {
    const decoded = decodeRepairedFilesPayload(REPAIRED);
    expect(decoded?.kind).toBe("legacy");
    if (decoded?.kind === "legacy") {
      expect(decoded.filesJson).toBe(REPAIRED);
    }
  });

  it("returns null for empty / non-JSON / unknown-shape payloads", () => {
    expect(decodeRepairedFilesPayload(null)).toBeNull();
    expect(decodeRepairedFilesPayload("")).toBeNull();
    expect(decodeRepairedFilesPayload("   ")).toBeNull();
    expect(decodeRepairedFilesPayload("not json")).toBeNull();
    expect(decodeRepairedFilesPayload('{"v":1}')).toBeNull(); // missing baseFilesHash + files
    expect(decodeRepairedFilesPayload('{"v":99,"baseFilesHash":"x","files":[]}')).toBeNull();
  });
});
