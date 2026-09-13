// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { CreditPackageGrid } from "./CreditPackageGrid";

describe("CreditPackageGrid", () => {
  it("shows 1 kr = 1 credit on every package", () => {
    render(
      <CreditPackageGrid
        onSelect={() => {}}
        ctaLabel={(pkg) => `Köp ${pkg.name}`}
      />,
    );

    expect(screen.getByText("49 kr")).toBeTruthy();
    expect(screen.getByText("99 kr")).toBeTruthy();
    expect(screen.getByText("179 kr")).toBeTruthy();
    expect(screen.getAllByText("49 credits")).toHaveLength(1);
    expect(screen.getAllByText("99 credits")).toHaveLength(1);
    expect(screen.getAllByText("179 credits")).toHaveLength(1);
    expect(screen.getAllByText("1.0 kr/credit")).toHaveLength(3);
    expect(screen.queryByText("25 credits")).toBeNull();
  });
});
