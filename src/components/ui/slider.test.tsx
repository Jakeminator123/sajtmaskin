import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Slider } from "./slider";

/**
 * Radix sätter `role="slider"` på Thumb, inte på Root. Ett `aria-label` som
 * spreadas vidare till Root landar därför på en roll-lös `<span>` där det
 * varken exponeras för skärmläsare eller är tillåtet enligt ARIA 1.2 — och
 * tummen blir namnlös, vilket ger axe-felet "ARIA input fields must have an
 * accessible name" (Vercel-toolbaren flaggade det på Byggval-reglaget
 * "Antal sidor"). Testerna binder att namnet hamnar på tummen.
 */
describe("Slider — tillgängligt namn", () => {
  it("ger tummen namnet från aria-label", () => {
    render(<Slider aria-label="Antal sidor" min={0} max={12} value={[3]} />);

    expect(screen.getByRole("slider", { name: "Antal sidor" })).toBeTruthy();
  });

  it("sätter inte aria-label på roten", () => {
    const { container } = render(
      <Slider aria-label="Antal sidor" min={0} max={12} value={[3]} />,
    );

    const root = container.querySelector('[data-slot="slider"]');
    expect(root).toBeTruthy();
    expect(root?.getAttribute("aria-label")).toBeNull();
  });

  it("stödjer aria-labelledby via tummen", () => {
    render(
      <>
        <span id="pages-label">Antal sidor</span>
        <Slider aria-labelledby="pages-label" min={0} max={12} value={[3]} />
      </>,
    );

    expect(screen.getByRole("slider", { name: "Antal sidor" })).toBeTruthy();
  });

  it("numrerar namnet när reglaget har flera tummar", () => {
    render(<Slider aria-label="Prisintervall" min={0} max={100} value={[20, 80]} />);

    expect(screen.getByRole("slider", { name: "Prisintervall (1)" })).toBeTruthy();
    expect(screen.getByRole("slider", { name: "Prisintervall (2)" })).toBeTruthy();
  });

  it("lämnar tummen namnlös när inget namn angetts", () => {
    const { container } = render(<Slider min={0} max={12} value={[3]} />);

    const thumb = container.querySelector('[data-slot="slider-thumb"]');
    expect(thumb).toBeTruthy();
    expect(thumb?.getAttribute("aria-label")).toBeNull();
  });

  // Ett tomt aria-label är värre än inget: attributet renderas, men namnet
  // blir tomt och axe flaggar tummen ändå. Normaliseras till utelämnat.
  it("renderar inget tomt aria-label", () => {
    const { container } = render(<Slider aria-label="" min={0} max={12} value={[3]} />);

    const thumb = container.querySelector('[data-slot="slider-thumb"]');
    expect(thumb?.getAttribute("aria-label")).toBeNull();
  });
});
