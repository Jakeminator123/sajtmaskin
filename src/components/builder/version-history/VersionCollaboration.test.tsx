/**
 * Smoke test for VersionCollaboration render (U#10).
 *
 * U#10 (optimistic-conflict guard) is filed as a BLOCKER: a real guard
 * needs an approval version/etag contract across the API route + the
 * collaboration service (+ DB), which is out of this PR's 3-component
 * scope. This test only pins that the component renders comments and
 * approval state from the GET endpoints so the BLOCKER row does not
 * silently regress the existing render.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VersionCollaboration } from "./VersionCollaboration";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("VersionCollaboration", () => {
  it("renders comments and approval status from the GET endpoints", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/comments")) {
        return json({
          comments: [
            {
              id: "c1",
              authorName: "Test",
              content: "Hej",
              resolved: false,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
        });
      }
      if (url.includes("/approval")) {
        return json({
          approval: {
            id: "a1",
            status: "approved",
            comment: null,
            approverName: "Granskare",
            createdAt: new Date().toISOString(),
          },
        });
      }
      return json({});
    }) as unknown as typeof fetch;

    render(<VersionCollaboration chatId="chat_1" versionId="ver_1" />);

    await waitFor(() => {
      expect(screen.getByText(/Kommentarer \(1\)/i)).toBeTruthy();
    });
    expect(screen.getByText(/Godkänd/i)).toBeTruthy();
  });
});
