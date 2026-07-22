import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildChatReadiness } from "@/lib/chat-readiness";
import { LaunchReadinessCard } from "./LaunchReadinessCard";

vi.mock("@/lib/builder/project-env-events", () => ({
  openDossiersPanel: vi.fn(),
}));

describe("LaunchReadinessCard", () => {
  it("visar separata grupper för Blocker och Advisory", () => {
    const readiness = buildChatReadiness({
      blockers: [
        {
          id: "version-failed",
          title: "Versionen underkändes av quality gate (typecheck/build).",
          severity: "blocker",
          category: "blocker",
          action: "versions",
        },
      ],
      warnings: [
        {
          id: "seo-missing-title",
          title: "SEO: title saknas.",
          severity: "warning",
          category: "advisory",
          action: "seo",
        },
      ],
      info: {
        versionId: "ver_1",
        lifecycleStatus: "failed",
        requiredEnvKeys: [],
        configuredEnvKeys: [],
        missingEnvKeys: [],
      },
    });

    const { container } = render(<LaunchReadinessCard readiness={readiness} />);

    expect(screen.getByText("Blockerar deploy")).toBeTruthy();
    expect(
      screen.getByText("Rekommendationer — blockerar inte"),
    ).toBeTruthy();
    expect(
      screen.getByText("Versionen underkändes av quality gate (typecheck/build)."),
    ).toBeTruthy();
    expect(screen.getByText("SEO: title saknas.")).toBeTruthy();
    expect(container.firstChild).toMatchSnapshot();
  });
});
