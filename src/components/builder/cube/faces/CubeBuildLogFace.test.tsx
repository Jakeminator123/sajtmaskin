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

  it("does not take a plain answer for a build, but does take a build that has just started", () => {
    const built = [assistant("a1")];
    const asked = [
      ...built,
      { id: "u2", role: "user", content: "Byt färg" } as ChatMessage,
      assistant("a2", { content: "Vilken färg vill du ha på knappen?" }),
    ];
    // A counter-question carries neither steps nor files: the build before it is still the latest.
    expect(selectLatestBuild(asked)?.content).toContain("components/hero.tsx");
    expect(selectLatestBuild([assistant("a0", { content: "Vad heter företaget?" })])).toBeNull();

    const started = [...asked, assistant("a3", { content: "", isStreaming: true })];
    expect(selectLatestBuild(started)).toMatchObject({ isStreaming: true, content: "" });
  });
});

describe("CubeBuildLogFace", () => {
  it("explains itself before the first build", () => {
    render(<CubeBuildLogFace messages={[]} isStreaming={false} />);
    expect(screen.getByText(/Här visas vad byggmotorn gör/)).toBeTruthy();
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
