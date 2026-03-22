import { describe, expect, it } from "vitest";
import { runDepCompleter } from "./dep-completer";

describe("runDepCompleter", () => {
  it("detects unscoped packages", () => {
    const code = `
import { BarChart } from "recharts";
import { motion } from "framer-motion";
`;
    const result = runDepCompleter(code);
    expect(result.dependencies).toHaveProperty("recharts");
    expect(result.dependencies).toHaveProperty("framer-motion");
    expect(result.unknownPackages).toHaveLength(0);
  });

  it("detects @-scoped packages like @vercel/analytics", () => {
    const code = `
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
`;
    const result = runDepCompleter(code);
    expect(result.dependencies).toHaveProperty("@vercel/analytics");
    expect(result.dependencies).toHaveProperty("@vercel/speed-insights");
  });

  it("detects Radix UI scoped packages", () => {
    const code = `
import { Dialog, DialogContent } from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
`;
    const result = runDepCompleter(code);
    expect(result.dependencies).toHaveProperty("@radix-ui/react-dialog");
    expect(result.dependencies).toHaveProperty("@radix-ui/react-dropdown-menu");
  });

  it("skips path aliases (@/…)", () => {
    const code = `
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
`;
    const result = runDepCompleter(code);
    expect(Object.keys(result.dependencies)).toHaveLength(0);
    expect(result.unknownPackages).toHaveLength(0);
  });

  it("skips built-in packages (react, next, etc.)", () => {
    const code = `
import React from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
`;
    const result = runDepCompleter(code);
    expect(Object.keys(result.dependencies)).toHaveLength(0);
  });

  it("reports unknown scoped packages as unknownPackages", () => {
    const code = `import { Foo } from "@unknown-org/mystery-package";`;
    const result = runDepCompleter(code);
    expect(result.unknownPackages).toContain("@unknown-org/mystery-package");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("normalizes deep imports to package root", () => {
    const code = `
import { Analytics } from "@vercel/analytics/next";
import { format } from "date-fns/format";
`;
    const result = runDepCompleter(code);
    expect(result.dependencies).toHaveProperty("@vercel/analytics");
    expect(result.dependencies).not.toHaveProperty("@vercel/analytics/next");
    expect(result.dependencies).toHaveProperty("date-fns");
    expect(result.dependencies).not.toHaveProperty("date-fns/format");
  });

  it("deduplicates multiple imports of the same package", () => {
    const code = `
import { BarChart } from "recharts";
import { LineChart } from "recharts";
`;
    const result = runDepCompleter(code);
    expect(Object.keys(result.dependencies).filter((k) => k === "recharts")).toHaveLength(1);
  });
});
