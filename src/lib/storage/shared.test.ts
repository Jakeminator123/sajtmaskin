import { describe, expect, it } from "vitest";
import { decodeStoragePathname, encodeStoragePathname } from "./shared";

describe("storage pathname encoding", () => {
  it("round-trips encoded path segments", () => {
    const encoded = encodeStoragePathname("folder/min fil.png");

    expect(decodeStoragePathname(encoded)).toBe("folder/min fil.png");
  });

  it("throws a clear error for malformed percent-encoding", () => {
    expect(() => decodeStoragePathname("folder/%")).toThrow(
      "Invalid encoded storage pathname: folder/%",
    );
  });
});
