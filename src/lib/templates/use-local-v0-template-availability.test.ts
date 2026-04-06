import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetLocalV0TemplateAvailabilityCacheForTests,
  useLocalV0TemplateAvailability,
} from "./use-local-v0-template-availability";

describe("useLocalV0TemplateAvailability", () => {
  beforeEach(() => {
    resetLocalV0TemplateAvailabilityCacheForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not refetch endlessly when rerendered with the same ids", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: true,
          availableIds: ["tmpl_1"],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(
      ({ ids }: { ids: string[] }) => useLocalV0TemplateAvailability(ids),
      {
        initialProps: { ids: ["tmpl_1", "tmpl_2"] },
      },
    );

    await waitFor(() => {
      expect(result.current.has("tmpl_1")).toBe(true);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    rerender({ ids: ["tmpl_1", "tmpl_2"] });

    await waitFor(() => {
      expect(result.current.has("tmpl_1")).toBe(true);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
