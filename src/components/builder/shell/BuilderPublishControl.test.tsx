import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BuilderPublishControl, resolveBuilderPublishState } from "./BuilderPublishControl";

type BuilderPublishControlProps = React.ComponentProps<typeof BuilderPublishControl>;

function baseProps(
  overrides: Partial<BuilderPublishControlProps> = {},
): BuilderPublishControlProps {
  return {
    activeVersionId: "ver_1",
    canDeploy: true,
    canManageDomain: true,
    isBusy: false,
    isDeploying: false,
    onDeployProduction: () => {},
    onDomainSearch: () => {},
    ...overrides,
  };
}

describe("resolveBuilderPublishState", () => {
  it("låter en pågående SSE-build vinna över hydratiserad historik", () => {
    expect(
      resolveBuilderPublishState({
        activeVersionId: "ver_2",
        canDeploy: true,
        deploymentStatus: "building",
        liveDeploymentUrl: "old.example.com",
        liveDeploymentVersionId: "ver_1",
      }),
    ).toEqual({ kind: "building" });
  });

  it("låter en ny SSE-ready-URL vinna över den hydratiserade URL:en", () => {
    expect(
      resolveBuilderPublishState({
        activeVersionId: "ver_2",
        canDeploy: true,
        deploymentStatus: "ready",
        deploymentUrl: "https://new.example.com",
        liveDeploymentUrl: "https://old.example.com",
        liveDeploymentVersionId: "ver_1",
      }),
    ).toEqual({ kind: "published", liveHref: "https://new.example.com" });
  });

  it("visar hydratiserad publicering som synkad när versions-id matchar", () => {
    expect(
      resolveBuilderPublishState({
        activeVersionId: "ver_1",
        canDeploy: true,
        liveDeploymentUrl: "site.example.com",
        liveDeploymentVersionId: "ver_1",
      }),
    ).toEqual({ kind: "published", liveHref: "https://site.example.com" });
  });

  it("visar ändringar när aktiv version skiljer sig från live-versionen", () => {
    expect(
      resolveBuilderPublishState({
        activeVersionId: "ver_2",
        canDeploy: true,
        liveDeploymentUrl: "site.example.com",
        liveDeploymentVersionId: "ver_1",
      }),
    ).toMatchObject({
      kind: "publish",
      hasUnpublishedChanges: true,
      label: "Publicera ändringar",
    });
  });

  it("blir aldrig falskt grön när live-versionens id är okänt", () => {
    expect(
      resolveBuilderPublishState({
        activeVersionId: "ver_1",
        canDeploy: true,
        liveDeploymentUrl: "site.example.com",
        liveDeploymentVersionId: null,
      }),
    ).toMatchObject({
      kind: "publish",
      hasUnpublishedChanges: true,
      label: "Publicera ändringar",
    });
  });

  it("undviker flimmer medan aktiv version ännu laddas om live-versionen är känd", () => {
    expect(
      resolveBuilderPublishState({
        activeVersionId: null,
        canDeploy: true,
        liveDeploymentUrl: "site.example.com",
        liveDeploymentVersionId: "ver_1",
      }),
    ).toEqual({ kind: "published", liveHref: "https://site.example.com" });
  });

  it("bevarar blockeringsorsaken för en inaktiv publiceringsknapp", () => {
    expect(
      resolveBuilderPublishState({
        activeVersionId: "ver_1",
        canDeploy: false,
        deployDisabledReason: "Bygg integrationerna först",
      }),
    ).toEqual({
      kind: "publish",
      hasUnpublishedChanges: false,
      label: "Publicera",
      tooltip: "Bygg integrationerna först",
    });
  });
});

describe("BuilderPublishControl", () => {
  it("visar ingen felstate när publiceringen inte har failat", () => {
    render(<BuilderPublishControl {...baseProps({ deploymentStatus: "ready" })} />);
    expect(screen.queryByText(/Publiceringen misslyckades/i)).toBeNull();
    expect(screen.queryByText(/Visa byggloggar/i)).toBeNull();
  });

  it("visar felstate utan byggloggslänk när inspectorUrl saknas", () => {
    render(
      <BuilderPublishControl
        {...baseProps({
          deploymentStatus: "error",
          deploymentInspectorUrl: null,
        })}
      />,
    );
    expect(screen.getByText(/Publiceringen misslyckades/i)).toBeTruthy();
    expect(screen.queryByText(/Visa byggloggar/i)).toBeNull();
  });

  it("visar en säker byggloggslänk när inspectorUrl finns", () => {
    render(
      <BuilderPublishControl
        {...baseProps({
          deploymentStatus: "error",
          deploymentInspectorUrl: "https://vercel.com/team/project/deployments/dpl_123",
        })}
      />,
    );
    const link = screen.getByRole("link", { name: /Visa byggloggar/i });
    expect(link.getAttribute("href")).toBe("https://vercel.com/team/project/deployments/dpl_123");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("visar felstaten och en enda manuell repair-knapp samtidigt", () => {
    const onRepublishWithFix = vi.fn();
    render(
      <BuilderPublishControl
        {...baseProps({
          deploymentStatus: "error",
          onRepublishWithFix,
        })}
      />,
    );

    expect(screen.getByText(/Publiceringen misslyckades/i)).toBeTruthy();
    const repairButton = screen.getByRole("button", { name: /Publicera om med fix/i });
    expect(screen.getAllByText(/Publicera om med fix/i)).toHaveLength(1);
    fireEvent.click(repairButton);
    expect(onRepublishWithFix).toHaveBeenCalledTimes(1);
  });

  it("visar building men lämnar domänmenyn nåbar under asynkron build", () => {
    render(
      <BuilderPublishControl
        {...baseProps({ deploymentStatus: "building", canManageDomain: true })}
      />,
    );

    expect(
      screen.getByRole("button", { name: /Bygger publiceringen/i }).hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen.getByRole("button", { name: /Fler publiceringsval: domän/i }).hasAttribute("disabled"),
    ).toBe(false);
  });

  it("öppnar den nya SSE-ready-URL:en i stället för den gamla hydratiserade URL:en", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(
      <BuilderPublishControl
        {...baseProps({
          activeVersionId: "ver_2",
          deploymentStatus: "ready",
          deploymentUrl: "https://new.example.com",
          liveDeploymentUrl: "https://old.example.com",
          liveDeploymentVersionId: "ver_1",
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Publicerad — öppna/i }));
    expect(open).toHaveBeenCalledWith("https://new.example.com", "_blank", "noopener,noreferrer");
    open.mockRestore();
  });

  it("kör om hämtningen när hydratiserad publiceringsstatus saknas", () => {
    const onRetryDeploymentHistory = vi.fn();
    render(
      <BuilderPublishControl
        {...baseProps({
          deploymentHistoryHydrationFailed: true,
          onRetryDeploymentHistory,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Kunde inte hämta publiceringsstatus/i }));
    expect(onRetryDeploymentHistory).toHaveBeenCalledTimes(1);
  });
});
