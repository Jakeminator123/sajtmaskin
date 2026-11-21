import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useAuthStore } from "@/lib/auth/auth-store";
import type { ChatMessage } from "@/lib/builder/types";
import { CubeBuildLogFace, selectLatestBuild } from "./CubeBuildLogFace";

const CODE = [
  "Jag har byggt startsidan.",
  "",
  '```tsx file="app/page.tsx"',
  "export default function Page() { return null; }",
  "```",
  "",
  '```tsx file="components/hero.tsx"',
  "export function Hero() { return null; }",
  "```",
].join("\n");

function toolPart(type: string, steps: string[], state = "output-available") {
  return { type, toolCallId: `${type}-1`, state, output: { steps } };
}

function assistant(id: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  return { id, role: "assistant", content: CODE, ...extra } as ChatMessage;
}

// A counter-question as the stream really writes it: model info and the
// generation step come first on every reply, then the question itself.
const counterQuestion = (id: string) =>
  assistant(id, {
    content: "Vilken färg vill du ha på knappen?",
    uiParts: [
      toolPart("tool:model-info", ["Körmodell: gpt-6.1-sol"]),
      toolPart("tool:engine-generation", ["Genererar"]),
      {
        type: "tool:awaiting-input",
        toolName: "Klargörande fråga",
        toolCallId: `ask-${id}`,
        state: "input-available",
        output: { question: "Vilken färg?", options: ["Blå", "Grön"], awaitingInput: true },
      },
    ] as never,
  });

function setAdmin(isAdmin: boolean) {
  useAuthStore.setState({ user: isAdmin ? ({ isAdmin: true } as never) : null });
}

afterEach(() => {
  useAuthStore.setState({ user: null });
});

describe("selectLatestBuild", () => {
  it("picks the latest assistant message that carries build data", () => {
    const messages = [
      assistant("a1", { content: "Första bygget.\n\n```tsx file=\"app/page.tsx\"\nexport default null;\n```" }),
      { id: "u1", role: "user", content: "Gör rubriken större" } as ChatMessage,
      assistant("a2"),
    ];
    const latest = selectLatestBuild(messages);
    expect(latest?.content).toContain("components/hero.tsx");
    expect(selectLatestBuild([{ id: "u1", role: "user", content: "Hej" } as ChatMessage])).toBeNull();
    expect(selectLatestBuild([])).toBeNull();
  });

  it("does not take a counter-question for a build: the build before it is still the latest", () => {
    const asked = [
      assistant("a1"),
      { id: "u2", role: "user", content: "Byt färg" } as ChatMessage,
      counterQuestion("a2"),
    ];
    expect(selectLatestBuild(asked)?.content).toContain("components/hero.tsx");
    expect(selectLatestBuild([counterQuestion("a0")])).toBeNull();
  });

  it("takes a build that has just started, and a build whose step failed before any file", () => {
    const started = [assistant("a1"), assistant("a2", { content: "", isStreaming: true })];
    expect(selectLatestBuild(started)).toMatchObject({ isStreaming: true, content: "" });

    const failed = assistant("a3", {
      content: "Bygget avbröts.",
      uiParts: [
        toolPart("tool:model-info", ["Körmodell: gpt-6.1-sol"]),
        toolPart("tool:engine-generation", ["Leverantören svarade inte"], "output-error"),
      ] as never,
    });
    expect(selectLatestBuild([assistant("a1"), failed])?.content).toBe("Bygget avbröts.");
  });
});

describe("CubeBuildLogFace", () => {
  it("explains itself before the first build", () => {
    render(<CubeBuildLogFace messages={[]} isStreaming={false} />);
    expect(screen.getByText(/Här visas vad byggmotorn gör/)).toBeTruthy();
  });

  it("keeps showing the last build, not «klart, 0 filer», after a counter-question", () => {
    setAdmin(false);
    const messages = [
      assistant("a1"),
      { id: "u2", role: "user", content: "Byt färg" } as ChatMessage,
      counterQuestion("a2"),
    ];
    render(<CubeBuildLogFace messages={messages} isStreaming={false} />);
    expect(screen.getByRole("status").textContent).toContain("2 filer i svaret");
    expect(screen.getByText("components/hero.tsx")).toBeTruthy();
    expect(screen.queryByText("Det senaste svaret innehöll inga filer.")).toBeNull();
  });

  it("shows status and files to everyone, and keeps the work log for admins", () => {
    const messages = [
      assistant("a1", {
        uiParts: [
          toolPart("tool:model-info", ["Körmodell: gpt-6.1-sol", "Byggprofil: Låg"]),
          toolPart("tool:engine-start", ["Startar own-engine-strömmen"]),
        ] as never,
      }),
    ];

    setAdmin(false);
    const customer = render(<CubeBuildLogFace messages={messages} isStreaming={false} />);
    expect(screen.getByRole("status").textContent).toContain("Senaste bygget är klart");
    expect(screen.getByRole("status").textContent).toContain("2 filer i svaret");
    expect(screen.getByText("app/page.tsx")).toBeTruthy();
    expect(screen.getByText("components/hero.tsx")).toBeTruthy();
    // Modellnamn och profiler är interna: aldrig för kunden.
    expect(screen.queryByRole("region", { name: "Arbetslogg" })).toBeNull();
    expect(screen.queryByText("Körmodell")).toBeNull();
    expect(screen.queryByText("gpt-6.1-sol")).toBeNull();
    customer.unmount();

    setAdmin(true);
    render(<CubeBuildLogFace messages={messages} isStreaming={false} />);
    const log = screen.getByRole("region", { name: "Arbetslogg" });
    expect(within(log).getByText("Körmodell").tagName).toBe("DT");
    expect(within(log).getByText("gpt-6.1-sol").tagName).toBe("DD");
    expect(within(log).getByText("Startar own-engine-strömmen")).toBeTruthy();
  });

  it("says that a build is running while the stream is open", () => {
    render(<CubeBuildLogFace messages={[assistant("a1", { isStreaming: true })]} isStreaming />);
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("hittills");
    expect(status.textContent).not.toContain("är klart");
  });
});
