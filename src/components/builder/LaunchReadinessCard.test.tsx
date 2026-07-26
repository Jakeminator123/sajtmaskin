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
          title: "Koden går inte att bygga än — vi försöker reparera.",
          severity: "blocker",
          category: "blocker",
          action: "versions",
        },
      ],
      warnings: [
        {
          id: "seo-missing-title",
          title: "Sidans titel saknas.",
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

    expect(screen.getByText("Blockerar publicering")).toBeTruthy();
    expect(
      screen.getByText("Rekommendationer — blockerar inte"),
    ).toBeTruthy();
    expect(
      screen.getByText("Koden går inte att bygga än — vi försöker reparera."),
    ).toBeTruthy();
    expect(screen.getByText("Sidans titel saknas.")).toBeTruthy();
    expect(container.firstChild).toMatchSnapshot();
  });

  it("döljer kortet helt när status är ready (B2)", () => {
    const readiness = buildChatReadiness({
      info: {
        versionId: "ver_1",
        lifecycleStatus: "passed",
        requiredEnvKeys: [],
        configuredEnvKeys: [],
        missingEnvKeys: [],
      },
    });

    const { container } = render(<LaunchReadinessCard readiness={readiness} />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByText("Lansering")).toBeNull();
  });
});
