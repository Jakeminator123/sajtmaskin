import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PreviewPanel } from "./PreviewPanel";

vi.mock("@/lib/hooks/useIntegrationStatus", () => ({
  useIntegrationStatus: () => ({
    integrationStatus: null,
    integrationError: null,
  }),
}));

vi.mock("@/lib/hooks/useInspectorWorkerStatus", () => ({
  useInspectorWorkerStatus: () => ({
    inspectorWorkerStatus: "idle",
    inspectorWorkerMessage: null,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

function renderPreviewPanel() {
  return render(
    <PreviewPanel
      chatId="chat_1"
      versionId="ver_1"
      demoUrl="https://preview.example/ver_1"
      onNavigatePreviewUrl={vi.fn()}
    />,
  );
}

describe("PreviewPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the footer editor and not the nav editor for footer link files", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/v0/chats/chat_1/files?versionId=ver_1")) {
          return new Response(
            JSON.stringify({
              files: [
                {
                  name: "components/site-footer.tsx",
                  content: [
                    "const footerLinks = {",
                    "  Tjänster: [",
                    "    { label: 'Webbdesign', href: '#' },",
                    "    { label: 'SEO', href: '#' },",
                    "  ],",
                    "  Företaget: [",
                    "    { label: 'Om oss', href: '#' },",
                    "    { label: 'Kontakt', href: '#' },",
                    "  ],",
                    "};",
                    "export function SiteFooter() { return null; }",
                  ].join("\n"),
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    renderPreviewPanel();
    fireEvent.click(screen.getByRole("button", { name: /Kodvy/i }));

    await waitFor(() => {
      expect(screen.getByText("Footereditor")).toBeTruthy();
    });

    expect(screen.queryByText("Navigationeditor")).toBeNull();
    expect(screen.getByDisplayValue("Tjänster")).toBeTruthy();
    expect(screen.getByDisplayValue("Webbdesign")).toBeTruthy();
  });

  it("shows the blog post editor for blog post arrays in code view", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/v0/chats/chat_1/files?versionId=ver_1")) {
          return new Response(
            JSON.stringify({
              files: [
                {
                  name: "app/blog/page.tsx",
                  content: [
                    "const posts = [",
                    "  { slug: 'post-1', title: 'Post ett', excerpt: 'Kort sammanfattning ett.', date: '2026-03-10', author: 'Alex', category: 'Guide' },",
                    "  { slug: 'post-2', title: 'Post två', excerpt: 'Kort sammanfattning två.', date: '2026-03-09', author: 'Alex', category: 'Nyheter' },",
                    "];",
                    "export default function BlogPage() { return null; }",
                  ].join("\n"),
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    renderPreviewPanel();
    fireEvent.click(screen.getByRole("button", { name: /Kodvy/i }));

    await waitFor(() => {
      expect(screen.getByText("Inläggseditor")).toBeTruthy();
    });

    expect(screen.getByDisplayValue("Post ett")).toBeTruthy();
    expect(screen.getByDisplayValue("Kort sammanfattning ett.")).toBeTruthy();
  });
});
