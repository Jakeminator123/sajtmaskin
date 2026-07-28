import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FileExplorer } from "./FileExplorer";
import type { FileNode } from "@/lib/builder/types";

const files: FileNode[] = [
  { name: "env.example", path: "env.example", type: "file" },
  { name: "package.json", path: "package.json", type: "file" },
];

describe("FileExplorer", () => {
  it("marks env.example as auto-generated and non-canonical (R2)", () => {
    render(<FileExplorer files={files} onFileSelect={vi.fn()} selectedPath={null} />);

    const badge = screen.getByLabelText(/auto-genererad dokumentation/i);
    expect(badge.textContent).toBe("auto");
    expect(badge.getAttribute("aria-label")).toContain("Byggblock");
  });

  it("leaves ordinary project files unmarked", () => {
    render(<FileExplorer files={files} onFileSelect={vi.fn()} selectedPath={null} />);

    expect(screen.getAllByText("auto")).toHaveLength(1);
    expect(screen.getByText("package.json")).toBeTruthy();
  });
});
