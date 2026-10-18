import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { dashboardManifest } from "./dashboard/manifest";
import { appShellManifest } from "./app-shell/manifest";
import { DashboardSidebar } from "./dashboard/files/components/dashboard-sidebar";
import { AppSidebar } from "./app-shell/files/components/app-sidebar";
import DashboardSettings from "./dashboard/files/app/settings/page";
import AppSettings from "./app-shell/files/app/settings/page";
import { buildCompleteProject } from "../export/project-scaffold";
import { collectRequiredUiComponents } from "../export/project-scaffold-ui-reader";
import { inferFileLanguage } from "@/lib/utils/infer-file-language";
import { getScaffoldById } from "./registry";
import { serializeScaffoldForPrompt } from "./serialize";
import { syncNavItemsFromRoutePlan } from "./sync-nav-from-route-plan";
import { listNavSurfaces } from "./types";

vi.mock("next/navigation", () => ({ usePathname: () => "/settings" }));
afterEach(cleanup);

const families = [
  { manifest: dashboardManifest, Sidebar: DashboardSidebar, Settings: DashboardSettings },
  { manifest: appShellManifest, Sidebar: AppSidebar, Settings: AppSettings },
];

describe("app scaffold demo boundaries", () => {
  it.each(families)(
    "$manifest.id does not advertise implemented authentication",
    ({ manifest }) => {
      expect(manifest.features).not.toContain("auth");
      expect(manifest.promptHints.join(" ")).toContain("visibly labelled as demo");
      expect(manifest.promptHints.join(" ")).toContain("verified sources");
    },
  );

  it.each(families)(
    "$manifest.id labels data and identity on every shared sidebar",
    ({ manifest, Sidebar }) => {
      render(<Sidebar />);
      expect(screen.getByText("Demodata — inte ansluten")).toBeDefined();
      expect(screen.getByText("Demoanvändare — ingen session")).toBeDefined();
      // The root layout renders this shared marker on every route, not only on the homepage.
      const layout = manifest.files.find((file) => file.path === "app/layout.tsx")!.content;
      expect(layout).toContain(`<${Sidebar.name} />`);
      expect(screen.getByRole("link", { name: "Inställningar" }).getAttribute("href")).toBe(
        "/settings",
      );
    },
  );

  it.each(families)(
    "$manifest.id lets users preview fields but cannot claim saved settings",
    ({ Settings }) => {
      const { container } = render(<Settings />);
      expect(screen.getByText("Demoformulär — sparas inte")).toBeDefined();
      const save = screen.getByRole("button", {
        name: "Spara (inte anslutet)",
      }) as HTMLButtonElement;
      expect(save.disabled).toBe(true);
      expect(save.type).toBe("button");
      const field = screen.getAllByRole("textbox")[0] as HTMLInputElement;
      fireEvent.change(field, { target: { value: "Mitt verkliga företag" } });
      expect(field.value).toBe("Mitt verkliga företag");
      fireEvent.click(save);
      expect(container.querySelector("form[action]")).toBeNull();
      expect(screen.queryByRole("status")).toBeNull();
    },
  );
});

describe("app scaffold materialization", () => {
  it.each(families)(
    "$manifest.id keeps the honesty guard in runtime instructions and nav rewrites",
    ({ manifest }) => {
      const runtime = getScaffoldById(manifest.id)!;
      const prompt = serializeScaffoldForPrompt(runtime, "structural");
      expect(prompt).toContain("visibly labelled as demo");
      expect(prompt).toContain("verified sources");
      expect(prompt).toContain("Keep unavailable actions disabled");
      const files = runtime.files.map((file) => ({
        ...file,
        language: inferFileLanguage(file.path),
      }));
      const synced = syncNavItemsFromRoutePlan({
        scaffold: runtime,
        files,
        routePlan: {
          provenance: { primarySource: "prompt", sources: ["prompt"] },
          siteType: "app-shell",
          reason: "Only planned routes delivered",
          routes: [
            { path: "/", name: "Hem", intent: "Home", required: true },
            { path: "/settings", name: "Inställningar", intent: "Settings", required: false },
          ],
        },
      });
      const surface = listNavSurfaces(runtime.navSurface)[0]!;
      expect(synced.changedPaths).toContain(surface);
      const sidebar = synced.files.find((file) => file.path === surface)!.content;
      expect(sidebar).toContain("Demodata — inte ansluten");
      expect(sidebar).toContain("Demoanvändare — ingen session");
      expect(sidebar).not.toMatch(/href: "\/(users|analytics|pipeline|tasks)"/);
    },
  );

  it.each(families)(
    "$manifest.id retains its sidebar, settings and complete UI closure",
    ({ manifest }) => {
      const generated = manifest.files.map((file) => ({
        ...file,
        language: inferFileLanguage(file.path),
      }));
      const files = buildCompleteProject(generated, collectRequiredUiComponents(generated));
      const byPath = new Map(files.map((file) => [file.path, file.content]));
      expect(byPath.get(listNavSurfaces(manifest.navSurface)[0]!)!).toContain(
        "Demodata — inte ansluten",
      );
      expect(byPath.get("app/settings/page.tsx")!).toContain("Demoformulär — sparas inte");
      for (const path of [
        "app/page.tsx",
        "app/layout.tsx",
        "components/ui/button.tsx",
        "components/ui/input.tsx",
        "components/ui/avatar.tsx",
        "components/ui/separator.tsx",
      ]) {
        expect(byPath.has(path), path).toBe(true);
      }
      expect(manifest.routeContract?.requiredRoutes).toEqual([]);
      expect(
        manifest.routeContract?.optionalRoutes.some((route) => route.path === "/settings"),
      ).toBe(true);
    },
  );
});
