import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PreviewRouteInfo } from "../../preview-panel/pages/preview-route-helpers";
import { buildSitemapTree, CubeSitemapFace } from "./CubeSitemapFace";

const routesState = vi.hoisted(() => ({
  routes: [] as PreviewRouteInfo[],
  loading: false,
  calls: [] as Array<[string | null, string | null, number | undefined]>,
}));
vi.mock("../../preview-panel/pages/usePreviewPanelPreviewRoutes", () => ({
  usePreviewPanelPreviewRoutes: (chatId: string | null, versionId: string | null, refreshToken?: number) => {
    routesState.calls.push([chatId, versionId, refreshToken]);
    return { previewRoutes: routesState.routes, previewRoutesLoading: routesState.loading };
  },
}));

function page(route: string, extra: Partial<PreviewRouteInfo> = {}): PreviewRouteInfo {
  return { route, label: route, dynamic: false, navigable: true, reachable: true, ...extra };
}

beforeEach(() => {
  routesState.routes = [];
  routesState.loading = false;
  routesState.calls = [];
});

describe("buildSitemapTree", () => {
  it("nests pages under their parent and keeps the source order", () => {
    const tree = buildSitemapTree([
      page("/"),
      page("/tjanster"),
      page("/tjanster/badrum"),
      page("/tjanster/kok"),
      page("/kontakt"),
    ]);
    expect(tree.map((node) => node.path)).toEqual(["/", "/tjanster", "/kontakt"]);
    expect(tree[0]).toMatchObject({ title: "Start", children: [] });
    expect(tree[1].children.map((node) => node.title)).toEqual(["Badrum", "Kok"]);
    expect(tree[1].page?.route).toBe("/tjanster");
  });

  it("creates a folder for a parent that has no page of its own", () => {
    const tree = buildSitemapTree([page("/"), page("/blogg/forsta-inlagget")]);
    const folder = tree[1];
    expect(folder).toMatchObject({ path: "/blogg", title: "Blogg", page: null });
    expect(folder.children[0]).toMatchObject({ path: "/blogg/forsta-inlagget", title: "Forsta inlagget" });
    expect(folder.children[0].page?.route).toBe("/blogg/forsta-inlagget");
  });

  it("labels a dynamic segment readably and returns nothing for no routes", () => {
    const tree = buildSitemapTree([page("/blogg/[slug]", { dynamic: true, navigable: false })]);
    expect(tree[0].children[0].title).toBe(":slug");
    expect(buildSitemapTree([])).toEqual([]);
  });
});

describe("CubeSitemapFace", () => {
  const ownEngineUrl = "/api/preview-render?chatId=c1&versionId=v1";

  it("reads the pages of the active version from the same source as the preview tabs", () => {
    routesState.routes = [page("/")];
    render(
      <CubeSitemapFace chatId="c1" versionId="v1" previewUrl={null} refreshToken={7} visible onNavigatePreviewUrl={vi.fn()} />,
    );
    expect(routesState.calls.at(-1)).toEqual(["c1", "v1", 7]);
    expect(screen.getByText("1 sida")).toBeTruthy();
  });

  it("reads no pages while the face is out of sight", () => {
    const { rerender } = render(
      <CubeSitemapFace chatId="c1" versionId="v1" previewUrl={null} visible={false} onNavigatePreviewUrl={vi.fn()} />,
    );
    // The list is built from all files of the version: it is not fetched for a hidden face.
    expect(routesState.calls.at(-1)).toEqual([null, null, undefined]);

    rerender(
      <CubeSitemapFace chatId="c1" versionId="v1" previewUrl={null} visible onNavigatePreviewUrl={vi.fn()} />,
    );
    expect(routesState.calls.at(-1)).toEqual(["c1", "v1", undefined]);
  });

  it("shows the tree, marks the page on screen and navigates on click", () => {
    routesState.routes = [page("/"), page("/tjanster"), page("/tjanster/badrum"), page("/kontakt")];
    const onNavigate = vi.fn();
    render(
      <CubeSitemapFace
        chatId="c1"
        versionId="v1"
        previewUrl={`${ownEngineUrl}&route=%2Fkontakt`}
        visible
        onNavigatePreviewUrl={onNavigate}
      />,
    );

    const nav = screen.getByRole("navigation", { name: "Sajtkarta" });
    expect(within(nav).getByRole("button", { name: /Kontakt/ }).getAttribute("aria-current")).toBe("page");
    expect(within(nav).getByRole("button", { name: /Start/ }).getAttribute("aria-current")).toBeNull();
    expect(screen.getByText("4 sidor")).toBeTruthy();

    fireEvent.click(within(nav).getByRole("button", { name: /Badrum/ }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
    const target = new URL(onNavigate.mock.calls[0][0], "http://localhost");
    expect(target.searchParams.get("route")).toBe("/tjanster/badrum");
    expect(target.searchParams.get("versionId")).toBe("v1");

    // The page already on screen is not reloaded.
    fireEvent.click(within(nav).getByRole("button", { name: /Kontakt/ }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("lists a dynamic or unlinked page without making it a dead button", () => {
    routesState.routes = [
      page("/"),
      page("/blogg/[slug]", { label: "/blogg/:slug", dynamic: true, navigable: false }),
      page("/gammal", { reachable: false }),
    ];
    render(
      <CubeSitemapFace chatId="c1" versionId="v1" previewUrl={ownEngineUrl} visible onNavigatePreviewUrl={vi.fn()} />,
    );
    expect(screen.getByText("/blogg/:slug")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /slug/ })).toBeNull();
    expect(screen.getByText("olänkad")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Gammal/ })).toBeTruthy();
  });

  it("offers no navigation without a preview, and explains an empty map", () => {
    routesState.routes = [page("/")];
    const { rerender } = render(
      <CubeSitemapFace chatId="c1" versionId="v1" previewUrl={null} visible onNavigatePreviewUrl={vi.fn()} />,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Start")).toBeTruthy();

    routesState.routes = [];
    rerender(<CubeSitemapFace chatId="c1" versionId="v1" previewUrl={null} visible onNavigatePreviewUrl={vi.fn()} />);
    expect(screen.getByText("Inga sidor hittades i den här versionen.")).toBeTruthy();

    rerender(<CubeSitemapFace chatId={null} versionId={null} previewUrl={null} visible onNavigatePreviewUrl={vi.fn()} />);
    expect(screen.getByText("Sajtkartan visas när sajten har en första version.")).toBeTruthy();
  });
});
