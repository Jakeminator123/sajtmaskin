import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PreviewPanelAddPanel } from "./PreviewPanelAddPanel";
import {
  buildShadcnInsertMessage,
  type ShadcnInsertSelection,
} from "@/lib/builder/shadcn-insert";
import type { SendMessageOutcome } from "@/lib/hooks/chat/types";
import type { ComponentCategory } from "@/lib/shadcn/registry-service";

// Mocka registry-fetcharna (används av "Bläddra"-fliken). Övriga rena
// funktioner/konstanter behålls äkta.
const { getBlocksByCategory, getComponentsByCategory } = vi.hoisted(() => ({
  getBlocksByCategory: vi.fn(),
  getComponentsByCategory: vi.fn(),
}));

vi.mock("@/lib/shadcn/registry-service", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/shadcn/registry-service")>();
  return { ...actual, getBlocksByCategory, getComponentsByCategory };
});

const BLOCK_CATEGORIES: ComponentCategory[] = [
  {
    id: "authentication",
    label: "Authentication",
    labelSv: "Inloggning",
    icon: "🔐",
    items: [
      {
        name: "login-01",
        title: "Login 01",
        description: "Enkelt inloggningsformulär",
        category: "authentication",
        type: "block",
        lightImageUrl: "https://ui.example/login-01-light.png",
      },
    ],
  },
];

const DESCRIBE_FLAG = "NEXT_PUBLIC_SAJTMASKIN_SHADCN_DESCRIBE";
const ORIGINAL_DESCRIBE_FLAG = process.env[DESCRIBE_FLAG];
const originalFetch = global.fetch;

describe("PreviewPanelAddPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env[DESCRIBE_FLAG];
    getBlocksByCategory.mockResolvedValue(BLOCK_CATEGORIES);
    getComponentsByCategory.mockResolvedValue([]);
  });

  afterEach(() => {
    if (typeof ORIGINAL_DESCRIBE_FLAG === "undefined") {
      delete process.env[DESCRIBE_FLAG];
    } else {
      process.env[DESCRIBE_FLAG] = ORIGINAL_DESCRIBE_FLAG;
    }
    global.fetch = originalFetch;
  });

  it("defaults to the Block tab with curated shadcnblocks (no official registry fetch)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        namespace: "@shadcnblocks",
        total: 1,
        categories: [],
        items: [
          {
            name: "hero1",
            type: "registry:block",
            title: "Hero 1 - Split hero",
            description: "A two-column hero",
            category: "hero",
          },
        ],
        nextCursor: null,
      }),
    }) as unknown as typeof fetch;

    render(<PreviewPanelAddPanel />);

    expect(screen.getByText("Lägg till i sajten")).toBeTruthy();
    await waitFor(() => screen.getByText(/Hero 1/i));
    // Lokala JSX-snippets syns inte längre i Add-panelens Block-flik
    expect(screen.queryByText("Enkel hero")).toBeNull();
    // Bläddra har inte hämtat officiellt index förrän fliken öppnas
    expect(getBlocksByCategory).not.toHaveBeenCalled();
  });

  it("switches to the Bläddra gallery and fetches registry data", async () => {
    render(<PreviewPanelAddPanel />);

    fireEvent.click(screen.getByRole("tab", { name: /Bläddra/ }));

    expect(screen.getByRole("button", { name: /Öppna galleri/i })).toBeTruthy();
    expect(screen.queryByText("Login 01")).toBeNull();
    expect(getBlocksByCategory).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Öppna galleri/i }));
    await waitFor(() => screen.getByText("Login 01"));
    expect(getBlocksByCategory).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("stänger Bläddra-overlayn med Escape utan sidoeffekter", async () => {
    render(<PreviewPanelAddPanel />);
    fireEvent.click(screen.getByRole("tab", { name: /Bläddra/ }));
    fireEvent.click(screen.getByRole("button", { name: /Öppna galleri/i }));
    await waitFor(() => screen.getByRole("dialog"));

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(screen.queryByText("Login 01")).toBeNull();
    expect(screen.getByRole("button", { name: /Öppna galleri/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Bläddra/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("Lägg till stänger overlayn innan placeringsläget startar", async () => {
    const onInsertShadcnItem = vi.fn().mockResolvedValue({
      status: "started",
      via: "stream",
    } satisfies SendMessageOutcome);
    const onPickPlacement = vi.fn().mockImplementation(async () => {
      expect(screen.queryByRole("dialog")).toBeNull();
      return {
        placement: "after-hero",
        placementLabel: "Efter Hero",
        anchorSectionLabel: "Hero",
      };
    });

    render(
      <PreviewPanelAddPanel
        onInsertShadcnItem={onInsertShadcnItem}
        onPickPlacement={onPickPlacement}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: /Bläddra/ }));
    fireEvent.click(screen.getByRole("button", { name: /Öppna galleri/i }));
    await waitFor(() => screen.getByText("Login 01"));
    fireEvent.click(screen.getByText("Login 01"));
    fireEvent.click(screen.getByRole("button", { name: /Lägg till i sajten/i }));

    await waitFor(() => expect(onPickPlacement).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(onInsertShadcnItem).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "login-01",
          registry: "@shadcn",
          origin: "browse",
          placement: "after-hero",
          placementLabel: "Efter Hero",
          anchorSectionLabel: "Hero",
        }),
      ),
    );
  });

  it("shows the Beskriv 'kommer snart' placeholder when the describe flag is off", () => {
    render(<PreviewPanelAddPanel />);

    fireEvent.click(screen.getByRole("tab", { name: /Beskriv/ }));

    expect(screen.getByText(/kommer snart/i)).toBeTruthy();
  });

  it("renders the functional Beskriv tab when the describe flag is on", async () => {
    process.env[DESCRIBE_FLAG] = "1";
    render(<PreviewPanelAddPanel onInsertShadcnItem={vi.fn()} />);

    fireEvent.click(screen.getByRole("tab", { name: /Beskriv/ }));

    await waitFor(() => screen.getByLabelText("Beskriv vad du vill lägga till"));
    expect(screen.queryByText(/kommer snart/i)).toBeNull();
  });

  it("Beskriv-kortval → sendMessage anropas med promptSourceMeta shadcn-item (lane v1)", async () => {
    process.env[DESCRIBE_FLAG] = "1";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            name: "hero1",
            registry: "@shadcnblocks",
            title: "Hero 1",
            description: "Hero-sektion med CTA",
            addCommand: "npx shadcn@latest add @shadcnblocks/hero1",
          },
        ],
      }),
    }) as unknown as typeof fetch;

    // Samma wiring som BuilderShellContent.handleShadcnItemInsert: valet byggs
    // till prompt via shadcn-insert och skickas genom sendMessage-vägen.
    const sendMessage = vi
      .fn()
      .mockResolvedValue({ status: "started", via: "stream" } satisfies SendMessageOutcome);
    const onInsertShadcnItem = async (selection: ShadcnInsertSelection) => {
      const built = await buildShadcnInsertMessage(selection);
      return (await sendMessage(built.message, {
        promptSourceMeta: built.meta,
      })) as SendMessageOutcome;
    };

    render(<PreviewPanelAddPanel onInsertShadcnItem={onInsertShadcnItem} />);
    fireEvent.click(screen.getByRole("tab", { name: /Beskriv/ }));
    await waitFor(() => screen.getByLabelText("Beskriv vad du vill lägga till"));

    fireEvent.change(screen.getByLabelText("Beskriv vad du vill lägga till"), {
      target: { value: "en hero med tydlig CTA" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Hitta block/i }));
    await waitFor(() => screen.getByText("Hero 1"));

    fireEvent.click(screen.getByRole("button", { name: /Lägg till i sajten/i }));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    const [message, options] = sendMessage.mock.calls[0];
    expect(options.promptSourceMeta).toEqual({
      sourceKind: "shadcn-item",
      isTechnical: true,
      preservePayload: true,
    });
    expect(message).toContain("@shadcnblocks/hero1");
    expect(message).toContain("Hero-sektion med CTA");
  });
});
