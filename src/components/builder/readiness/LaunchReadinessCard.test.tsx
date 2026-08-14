import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildChatReadiness } from "@/lib/chat-readiness";
import { LaunchReadinessCard } from "./LaunchReadinessCard";

vi.mock("@/lib/builder/project-env-events", () => ({
  openDossiersPanel: vi.fn(),
}));

const emptyInfo = {
  versionId: "ver_1",
  requiredEnvKeys: [],
  configuredEnvKeys: [],
  missingEnvKeys: [],
};

describe("LaunchReadinessCard", () => {
  it("visar separata grupper för Blocker och Advisory när raden fälls ut", () => {
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
      info: { ...emptyInfo, lifecycleStatus: "failed" },
    });

    render(<LaunchReadinessCard readiness={readiness} hasAnyVersion />);

    // Del F2: default är kollapsad — detaljerna syns först efter "Visa".
    expect(screen.queryByText("Blockerar publicering")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Publiceringsstatus" }));

    expect(screen.getByText("Blockerar publicering")).toBeTruthy();
    expect(screen.getByText("Rekommendationer — blockerar inte")).toBeTruthy();
    expect(
      screen.getByText("Koden går inte att bygga än — vi försöker reparera."),
    ).toBeTruthy();
    expect(screen.getByText("Sidans titel saknas.")).toBeTruthy();
  });

  it("döljer kortet helt när status är ready (B2)", () => {
    const readiness = buildChatReadiness({
      info: { ...emptyInfo, lifecycleStatus: "passed" },
    });

    const { container } = render(<LaunchReadinessCard readiness={readiness} />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByText("Lansering")).toBeNull();
  });

  it("döljer kortet helt när no-version är ensam OCH ingen version finns (F1, tomt projekt)", () => {
    const readiness = buildChatReadiness({
      blockers: [
        {
          id: "no-version",
          title: "Ingen version är vald.",
          severity: "blocker",
          category: "blocker",
          action: "versions",
        },
      ],
      info: { ...emptyInfo, versionId: null },
    });

    const { container } = render(
      <LaunchReadinessCard readiness={readiness} hasAnyVersion={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("behåller kortet som kollapsad rad när no-version är ensam MEN versioner finns (F1, handlingsbart)", () => {
    // Skyddar mot förenklingen "dölj alltid vid no-version": här FINNS versioner
    // (t.ex. medan SWR:en laddar en chat med latestVersion), så "välj en i listan"
    // är en konkret åtgärd som inte får gömmas.
    const readiness = buildChatReadiness({
      blockers: [
        {
          id: "no-version",
          title: "Ingen version är vald.",
          severity: "blocker",
          category: "blocker",
          action: "versions",
        },
      ],
      info: { ...emptyInfo, versionId: null },
    });

    render(<LaunchReadinessCard readiness={readiness} hasAnyVersion />);

    // Kollapsad rad renderas: badgen bär signalen ("1 spärr"), men detaljerna
    // är dolda tills användaren fäller ut.
    expect(screen.getByText("1 spärr")).toBeTruthy();
    expect(screen.queryByText("Ingen version är vald.")).toBeNull();
  });

  it("växlar mellan kollapsat och expanderat för ett flerspärrsfall", () => {
    const readiness = buildChatReadiness({
      blockers: [
        {
          id: "version-failed",
          title: "Koden går inte att bygga än — vi försöker reparera.",
          severity: "blocker",
          category: "blocker",
          action: "versions",
        },
        {
          id: "release-gate-not-green",
          title: "Kontrollen har inte godkänt versionen.",
          severity: "blocker",
          category: "blocker",
          action: "versions",
        },
      ],
      info: { ...emptyInfo, lifecycleStatus: "failed" },
    });

    render(<LaunchReadinessCard readiness={readiness} hasAnyVersion />);

    // Kollapsat: badge "2 spärrar", inga detaljer.
    expect(screen.getByText("2 spärrar")).toBeTruthy();
    expect(screen.queryByText("Koden går inte att bygga än — vi försöker reparera.")).toBeNull();

    const toggle = screen.getByRole("button", { name: "Publiceringsstatus" });
    fireEvent.click(toggle);
    expect(
      screen.getByText("Koden går inte att bygga än — vi försöker reparera."),
    ).toBeTruthy();
    expect(screen.getByText("Kontrollen har inte godkänt versionen.")).toBeTruthy();

    fireEvent.click(toggle);
    expect(screen.queryByText("Koden går inte att bygga än — vi försöker reparera.")).toBeNull();
  });

  it("visar Product Postcheck-fynd i den befintliga rekommendationsytan", () => {
    const readiness = buildChatReadiness({
      warnings: [
        {
          id: "product-postcheck-blocks-f3",
          title: "Bygg integrationer är spärrat.",
          detail: "Mobilmeny kunde inte verifieras.",
          severity: "warning",
          category: "advisory",
          action: "preview",
        },
        {
          id: "product-postcheck-mobile_menu_failed",
          title: "Mobilmeny kunde inte verifieras: no toggle found.",
          severity: "warning",
          category: "advisory",
          action: "preview",
        },
      ],
      info: {
        ...emptyInfo,
        productPostcheckBlocksF3: true,
        productPostcheckBlockedReason: "Mobilmeny kunde inte verifieras.",
      },
    });

    render(<LaunchReadinessCard readiness={readiness} hasAnyVersion />);
    fireEvent.click(screen.getByRole("button", { name: "Publiceringsstatus" }));

    expect(screen.getByText("Rekommendationer — blockerar inte")).toBeTruthy();
    expect(screen.getByText("Bygg integrationer är spärrat.")).toBeTruthy();
    expect(screen.getByText("Mobilmeny kunde inte verifieras: no toggle found.")).toBeTruthy();
    expect(screen.queryByText("Blockerar publicering")).toBeNull();
  });

  it("visar sen preview:client-error i den befintliga rekommendationsytan", () => {
    const readiness = buildChatReadiness({
      warnings: [
        {
          id: "late-client-error",
          title: "Förhandsvisningen rapporterade ett fel efter att versionen godkändes.",
          detail: "[hydration] Text content does not match server-rendered HTML.",
          severity: "warning",
          category: "advisory",
          action: "preview",
        },
      ],
      info: emptyInfo,
    });

    render(<LaunchReadinessCard readiness={readiness} hasAnyVersion />);
    fireEvent.click(screen.getByRole("button", { name: "Publiceringsstatus" }));

    expect(screen.getByText("Rekommendationer — blockerar inte")).toBeTruthy();
    expect(
      screen.getByText("Förhandsvisningen rapporterade ett fel efter att versionen godkändes."),
    ).toBeTruthy();
    expect(screen.queryByText("Blockerar publicering")).toBeNull();
  });
});
