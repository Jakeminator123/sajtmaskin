import { describe, expect, it } from "vitest";
import {
  renderRequiredImportsChecklistBlock,
  renderLucideIconsReminderBlock,
  __testing,
} from "./routing-and-tooling";
import type { RoutePlan } from "../../route-plan";

function makeRoutePlan(paths: string[]): RoutePlan {
  return {
    provenance: { primarySource: "scaffold", sources: ["scaffold"] },
    siteType: "one-page",
    reason: "test fixture",
    routes: paths.map((path) => ({
      path,
      name: path,
      intent: "test",
      required: true,
    })),
  };
}

describe("renderRequiredImportsChecklistBlock", () => {
  it("returns empty when no routePlan and no capabilityHints", () => {
    expect(renderRequiredImportsChecklistBlock({})).toEqual([]);
  });

  it("renders baseline Button/Card/Badge rows when routePlan is present", () => {
    const block = renderRequiredImportsChecklistBlock({
      routePlan: makeRoutePlan(["/"]),
    });
    const joined = block.join("\n");
    expect(block[0]).toBe("## Required Imports Checklist");
    expect(joined).toContain('import { Button } from "@/components/ui/button";');
    expect(joined).toContain(
      'import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";',
    );
    expect(joined).toContain('import { Badge } from "@/components/ui/badge";');
  });

  it("adds form-related imports when capabilityHints mentions forms", () => {
    const block = renderRequiredImportsChecklistBlock({
      routePlan: makeRoutePlan(["/"]),
      capabilityHints:
        "## Detected Capabilities\n\n- **Forms requested**: Use react-hook-form + zod + shadcn Form components.",
    });
    const joined = block.join("\n");
    expect(joined).toContain('@/components/ui/input');
    expect(joined).toContain('@/components/ui/label');
    expect(joined).toContain('@/components/ui/textarea');
    expect(joined).toContain(
      'import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";',
    );
  });

  it("adds Calendar + Popover when capabilityHints mentions calendar", () => {
    const block = renderRequiredImportsChecklistBlock({
      routePlan: makeRoutePlan(["/"]),
      capabilityHints:
        "## Detected Capabilities\n\n- **Calendar/date selection requested**: Use shadcn Calendar.",
    });
    const joined = block.join("\n");
    expect(joined).toContain('import { Calendar } from "@/components/ui/calendar";');
    expect(joined).toContain(
      'import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";',
    );
  });

  it("adds form imports via the contact route prefix even without capabilityHints", () => {
    const block = renderRequiredImportsChecklistBlock({
      routePlan: makeRoutePlan(["/", "/kontakt"]),
    });
    const joined = block.join("\n");
    expect(joined).toContain('@/components/ui/input');
    expect(joined).toContain('@/components/ui/form');
  });

  it("adds sidebar/sheet/table for app-shell dashboard routes", () => {
    const block = renderRequiredImportsChecklistBlock({
      routePlan: makeRoutePlan(["/dashboard"]),
    });
    const joined = block.join("\n");
    expect(joined).toContain('@/components/ui/sidebar');
    expect(joined).toContain('@/components/ui/sheet');
    expect(joined).toContain('@/components/ui/table');
  });

  it("stays deterministic across repeated calls", () => {
    const params = {
      routePlan: makeRoutePlan(["/", "/pricing", "/kontakt"]),
      capabilityHints: "- **Forms requested**: foo",
    };
    const first = renderRequiredImportsChecklistBlock(params);
    const second = renderRequiredImportsChecklistBlock(params);
    expect(second).toEqual(first);
  });

  it("keeps the table compact (< 30 rows) to preserve prompt focus", () => {
    const allCapabilityHints = [
      "- **Forms requested**: …",
      "- **Carousel/slider requested**: …",
      "- **App shell requested**: …",
      "- **Data table / CRUD requested**: …",
      "- **Search/command palette requested**: …",
      "- **Calendar/date selection requested**: …",
      "- **E-commerce requested**: …",
    ].join("\n");
    const block = renderRequiredImportsChecklistBlock({
      routePlan: makeRoutePlan(["/", "/dashboard", "/kontakt", "/pricing"]),
      capabilityHints: allCapabilityHints,
    });
    const rowLines = block.filter((line) => line.startsWith("| ") && !line.startsWith("| Component(s)") && !line.startsWith("|---"));
    expect(rowLines.length).toBeLessThan(30);
    expect(rowLines.length).toBeGreaterThan(0);
  });

  it("__testing.collectGroups always includes baseline groups", () => {
    const groups = __testing.collectGroups({ routePlan: makeRoutePlan(["/"]) });
    for (const baseline of __testing.BASELINE_GROUPS) {
      expect(groups).toContain(baseline);
    }
  });
});

describe("renderLucideIconsReminderBlock", () => {
  it("renders grouped icon reminders and the critical import note", () => {
    const block = renderLucideIconsReminderBlock();
    const joined = block.join("\n");
    expect(block[0]).toBe("### Lucide icons commonly needed");
    expect(joined).toContain("- UI controls: Plus, Minus, X, Check");
    expect(joined).toContain("- Navigation: Menu, ArrowRight, ArrowLeft");
    expect(joined).toContain(
      'CRITICAL: Each icon used in JSX MUST be imported from "lucide-react".',
    );
    expect(joined).toContain(
      'Example: import { Menu, X, ArrowRight, Sparkles } from "lucide-react";',
    );
  });
});
