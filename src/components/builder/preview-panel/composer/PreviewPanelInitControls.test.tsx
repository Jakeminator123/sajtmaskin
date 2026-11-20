import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PreviewPanelInitControls } from "./PreviewPanelInitControls";
import { parseChatRequestMeta } from "@/lib/api/engine/chats/parse-chat-request-meta";
import {
  buildInitBuildChoicesInstructions,
  buildInitBuildChoicesMeta,
  getCurrentInitBuildChoices,
  resetInitBuildChoices,
} from "@/lib/builder/init-build-choices";
import {
  THEME_CLUSTERS,
  getThemeColors,
  normalizeDesignTheme,
  resolveThemePalette,
  type DesignTheme,
  type ThemePalette,
} from "@/lib/builder/theme-presets";

afterEach(() => {
  resetInitBuildChoices();
});

/** Every Byggval row renders as a Radix `radiogroup` named by its heading. */
function choiceRow(name: string): HTMLElement {
  return screen.getByRole("radiogroup", { name });
}

function paletteGroup(): HTMLElement {
  return choiceRow("Färgpalett");
}

function openMoreChoices() {
  fireEvent.click(screen.getByRole("button", { name: /Fler byggval/ }));
}

/** Stateful parent, like the shell: `designTheme` lives outside the panel. */
function ControlledControls(props: {
  initialTheme?: DesignTheme;
  description?: string;
  onThemeChange?: (theme: DesignTheme) => void;
  onStart?: () => void;
}) {
  const [theme, setTheme] = useState<DesignTheme>(props.initialTheme ?? "off");
  return (
    <>
      <PreviewPanelInitControls
        designTheme={theme}
        onDesignThemeChange={(next) => {
          setTheme(next);
          props.onThemeChange?.(next);
        }}
        description={props.description}
        onStart={props.onStart}
      />
      <output data-testid="theme">{theme}</output>
    </>
  );
}

const CAFE_BRIEF = "En hemsida för Café Lindgren, ett kafé i Uppsala. Varm, ljus och modern.";

/**
 * The miniature binds the palette through CSS custom properties (jsdom drops
 * `oklch()` in plain color properties, real browsers do not — and the variables
 * keep the exact string the build locks, so the comparison is exact).
 */
function miniatureVars(card: HTMLElement) {
  const root = card.querySelector<HTMLElement>("[data-palette-miniature]");
  expect(root).not.toBeNull();
  const read = (name: string) => root!.style.getPropertyValue(name);
  return {
    background: read("--mini-bg"),
    foreground: read("--mini-fg"),
    mutedForeground: read("--mini-muted-fg"),
    primary: read("--mini-primary"),
    primaryForeground: read("--mini-on-primary"),
  };
}

function expectedVars(palette: ThemePalette) {
  return {
    background: palette.background,
    foreground: palette.foreground,
    mutedForeground: palette.mutedForeground,
    primary: palette.primary,
    primaryForeground: palette.primaryForeground,
  };
}

describe("PreviewPanelInitControls — Sidans utseende", () => {
  it("förklarar att valet gäller hemsidan, inte arbetsytan", () => {
    render(<ControlledControls />);
    expect(screen.getByRole("heading", { name: "Sidans utseende" })).toBeTruthy();
    expect(screen.getByText(/gäller hemsidan du bygger, inte arbetsytan/)).toBeTruthy();
  });

  it("visar Låt AI välja plus tre kompletta palettkort på första nivån", () => {
    render(<ControlledControls />);
    const radios = within(paletteGroup()).getAllByRole("radio");
    expect(radios).toHaveLength(4);
    expect(radios[0]!.getAttribute("aria-label")).toBe("Låt AI välja färger");
    expect(radios[0]!.dataset.state).toBe("on");
  });

  /**
   * Kortet är en miniatyr av sajten, inte en färgprick: bakgrund, rubrik,
   * brödtext och knapp ur samma palett som bygget låser.
   */
  it("ritar varje kort med temats riktiga bakgrund, text och knapp", () => {
    render(<ControlledControls />);
    const card = within(paletteGroup()).getByRole("radio", { name: /Varm & inbjudande, Bärnsten/ });
    expect(miniatureVars(card)).toEqual(expectedVars(THEME_CLUSTERS.orange.light));
    // Rubrik, brödtext och knapp läser just de variablerna.
    expect(within(card).getByText("Välkommen").className).toContain("var(--mini-fg)");
    expect(within(card).getByText("Lugn och läsbar.").className).toContain("var(--mini-muted-fg)");
    const button = within(card).getByText("Kontakt");
    expect(button.className).toContain("var(--mini-primary)");
    expect(button.className).toContain("var(--mini-on-primary)");
  });

  it("föreslår lokalt utifrån beskrivningen och markerar förslaget", () => {
    render(<ControlledControls description={CAFE_BRIEF} />);
    expect(screen.getByText(/Förslag utifrån din beskrivning \(mat och fika\)/)).toBeTruthy();
    const radios = within(paletteGroup()).getAllByRole("radio");
    expect(radios[1]!.getAttribute("aria-label")).toBe("Varm & inbjudande, Bärnsten, förslag");
    // Förslaget väljs inte åt användaren — AI-valet står kvar tills någon klickar.
    expect(radios[0]!.dataset.state).toBe("on");
  });

  it("skickar cluster-id vid klick och off för Låt AI välja", () => {
    const onThemeChange = vi.fn();
    render(<ControlledControls onThemeChange={onThemeChange} />);
    fireEvent.click(within(paletteGroup()).getByRole("radio", { name: /Grön & naturlig/ }));
    expect(onThemeChange).toHaveBeenLastCalledWith("green");
    fireEvent.click(within(paletteGroup()).getByRole("radio", { name: "Låt AI välja färger" }));
    expect(onThemeChange).toHaveBeenLastCalledWith("off");
  });

  it("visar hela utbudet om 13 teman under Fler färger, med stämningsnamn", () => {
    render(<ControlledControls />);
    const toggle = screen.getByRole("button", { name: /Fler färger/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    // Siffran är antalet som fälls ut (13 − de tre som redan syns), inte totalen.
    expect(toggle.textContent).toContain("Fler färger (10)");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const radios = within(paletteGroup()).getAllByRole("radio");
    expect(radios).toHaveLength(14);
    expect(radios.length - 4).toBe(10);
    expect(
      within(paletteGroup()).getByRole("radio", { name: "Elegant & seriös, Midnatt" }),
    ).toBeTruthy();
  });

  /**
   * Fokus och valt får inte se likadana ut (bild F6): valt = blå kant, fokus =
   * ljus ring med luft som inte rör kanten.
   */
  it("markerar fokus med en ljus ring, skild från valt-ramens blå", () => {
    render(<ControlledControls initialTheme="orange" />);
    const card = within(paletteGroup()).getByRole("radio", { name: /Bärnsten/ });
    const classes = card.getAttribute("class") ?? "";
    expect(classes).toContain("focus-visible:ring-foreground");
    expect(classes).toContain("focus-visible:ring-offset-2");
    expect(classes).not.toContain("focus-visible:ring-ring");
    expect(classes).not.toContain("focus-visible:border-ring");
    expect(classes).toContain("data-[state=on]:border-primary");
  });

  /** Ett val ur "Fler färger" får aldrig försvinna ur sikte när listan fälls ihop. */
  it("håller ett val ur Fler färger synligt på första nivån", () => {
    render(<ControlledControls />);
    fireEvent.click(screen.getByRole("button", { name: /Fler färger/ }));
    fireEvent.click(within(paletteGroup()).getByRole("radio", { name: /Kreativ & djup, Plommon/ }));
    fireEvent.click(screen.getByRole("button", { name: /Färre färger/ }));
    const radios = within(paletteGroup()).getAllByRole("radio");
    expect(radios).toHaveLength(4);
    const plum = within(paletteGroup()).getByRole("radio", { name: /Plommon/ });
    expect(plum.dataset.state).toBe("on");
  });

  it("låser paletten under streaming", () => {
    const onDesignThemeChange = vi.fn();
    render(
      <PreviewPanelInitControls
        designTheme="off"
        onDesignThemeChange={onDesignThemeChange}
        themeLocked
      />,
    );
    fireEvent.click(within(paletteGroup()).getByRole("radio", { name: /Bärnsten/ }));
    expect(onDesignThemeChange).not.toHaveBeenCalled();
  });

  it("ritar korten mörka när Färgläge är Mörkt", () => {
    render(<ControlledControls />);
    fireEvent.click(within(choiceRow("Färgläge")).getByRole("radio", { name: "Mörkt" }));
    const card = within(paletteGroup()).getByRole("radio", { name: /Bärnsten/ });
    expect(miniatureVars(card)).toEqual(expectedVars(THEME_CLUSTERS.orange.dark));
  });

  it("markerar ett läge som beskrivningen ber om utan att välja det", () => {
    render(<ControlledControls description="En mörk sida för en nattklubb" />);
    const row = choiceRow("Färgläge");
    expect(within(row).getByRole("radio", { name: "Mörkt, förslag" }).dataset.state).toBe("off");
    expect(within(row).getByRole("radio", { name: "Auto" }).dataset.state).toBe("on");
  });
});

/**
 * Godkänt-kriteriet "vald palett och ljust/mörkt når bygget". Kedjan körs med
 * de riktiga funktionerna: panelens val → storen → request-meta (samma fält som
 * useCreateChat skriver) → serverns parser → `resolveThemePalette`, som
 * finalize-prompts använder för det låsta palettblocket. Det kortet visade är
 * det bygget låser.
 */
describe("PreviewPanelInitControls — valet når bygget", () => {
  function requestMetaFor(theme: DesignTheme) {
    const choices = getCurrentInitBuildChoices();
    // Samma regler som useCreateChat: designTheme bara när det inte är off.
    return {
      ...(theme !== "off" ? { designTheme: theme } : {}),
      ...(getThemeColors(theme) ? { themeColors: getThemeColors(theme) } : {}),
      ...buildInitBuildChoicesMeta(choices),
    };
  }

  it("Bärnsten + Mörkt blir Bärnstens mörka palett i bygget", () => {
    render(<ControlledControls />);
    fireEvent.click(within(paletteGroup()).getByRole("radio", { name: /Bärnsten/ }));
    fireEvent.click(within(choiceRow("Färgläge")).getByRole("radio", { name: "Mörkt" }));
    const theme = screen.getByTestId("theme").textContent as DesignTheme;
    expect(theme).toBe("orange");

    const parsed = parseChatRequestMeta(requestMetaFor(theme));
    expect(parsed.designThemePreset).toBe("orange");
    expect(parsed.colorModeHint).toBe("dark");
    expect(parsed.themeColors).toEqual(getThemeColors("orange"));
    const locked = resolveThemePalette(
      normalizeDesignTheme(parsed.designThemePreset),
      parsed.colorModeHint ?? "auto",
    );
    expect(locked).toEqual(THEME_CLUSTERS.orange.dark);
    // Det synliga kortet visade exakt de färger bygget låser.
    const card = within(paletteGroup()).getByRole("radio", { name: /Bärnsten/ });
    expect(miniatureVars(card)).toEqual(expectedVars(locked!));
    // Och den svenska direktivtexten följer med i custom-instructions-kanalen.
    expect(buildInitBuildChoicesInstructions(getCurrentInitBuildChoices())).toContain(
      "mörkt färgtema",
    );
  });

  it("Låt AI välja skickar ingen palett, Ljust skickar ändå läget", () => {
    render(<ControlledControls initialTheme="green" />);
    fireEvent.click(within(paletteGroup()).getByRole("radio", { name: "Låt AI välja färger" }));
    fireEvent.click(within(choiceRow("Färgläge")).getByRole("radio", { name: "Ljust" }));
    const parsed = parseChatRequestMeta(requestMetaFor("off"));
    expect(parsed.designThemePreset).toBeNull();
    expect(parsed.themeColors).toBeNull();
    expect(parsed.colorModeHint).toBe("light");
    expect(resolveThemePalette("off", "light")).toBeNull();
  });

  /** Att bara titta kostar inget: förslag och Fler färger rör varken store eller tema. */
  it("ändrar ingenting av att man bläddrar eller skriver en beskrivning", () => {
    const onThemeChange = vi.fn();
    const { rerender } = render(<ControlledControls onThemeChange={onThemeChange} />);
    const before = getCurrentInitBuildChoices();
    rerender(<ControlledControls onThemeChange={onThemeChange} description={CAFE_BRIEF} />);
    fireEvent.click(screen.getByRole("button", { name: /Fler färger/ }));
    fireEvent.click(screen.getByRole("button", { name: /Färre färger/ }));
    expect(onThemeChange).not.toHaveBeenCalled();
    expect(getCurrentInitBuildChoices()).toBe(before);
  });
});

describe("PreviewPanelInitControls — Fler byggval", () => {
  it("sammanfattar dolda val på en rad och visar dem vid klick", () => {
    render(<ControlledControls />);
    const trigger = screen.getByRole("button", { name: /Fler byggval/ });
    expect(trigger.textContent).toContain("AI väljer");
    expect(screen.queryByRole("radiogroup", { name: "Stil" })).toBeNull();
    openMoreChoices();
    fireEvent.click(within(choiceRow("Stil")).getByRole("radio", { name: "Redaktionell" }));
    expect(trigger.textContent).toContain("Stil: Redaktionell");
  });

  /**
   * Radix clears the value when an already-active item is clicked, which would
   * leave a row with NO choice. `ChoiceChipRow` drops that empty `next`.
   */
  it("behåller valet när man klickar på det redan aktiva chippet", () => {
    render(<ControlledControls />);
    openMoreChoices();
    const row = choiceRow("Komplexitet");
    fireEvent.click(within(row).getByRole("radio", { name: "Lagom" }));
    expect(getCurrentInitBuildChoices().complexity).toBe("medium");
    fireEvent.click(within(row).getByRole("radio", { name: "Lagom" }));
    expect(getCurrentInitBuildChoices().complexity).toBe("medium");
    expect(within(row).getByRole("radio", { name: "Lagom" }).dataset.state).toBe("on");
  });

  it("använder svenska stiletiketter men oförändrade värden", () => {
    render(<ControlledControls />);
    openMoreChoices();
    const row = choiceRow("Stil");
    for (const english of ["Corporate", "Bold startup", "Editorial"]) {
      expect(within(row).queryByRole("radio", { name: english })).toBeNull();
    }
    fireEvent.click(within(row).getByRole("radio", { name: "Affärsmässig" }));
    expect(getCurrentInitBuildChoices().style).toBe("corporate");
    fireEvent.click(within(row).getByRole("radio", { name: "Uttrycksfull" }));
    expect(getCurrentInitBuildChoices().style).toBe("bold");
    fireEvent.click(within(row).getByRole("radio", { name: "Redaktionell" }));
    expect(getCurrentInitBuildChoices().style).toBe("editorial");
  });

  it("håller Hemsida eller app på första nivån när beskrivningen är oklar", () => {
    render(<ControlledControls description="Något snyggt" />);
    expect(choiceRow("Hemsida eller app")).toBeTruthy();
  });

  it("flyttar Hemsida eller app till Fler byggval när beskrivningen är tydlig", () => {
    render(<ControlledControls description={CAFE_BRIEF} />);
    expect(screen.queryByRole("radiogroup", { name: "Hemsida eller app" })).toBeNull();
    openMoreChoices();
    fireEvent.click(within(choiceRow("Hemsida eller app")).getByRole("radio", { name: "App" }));
    expect(getCurrentInitBuildChoices().buildTarget).toBe("app");
    expect(screen.getByRole("button", { name: /Fler byggval/ }).textContent).toContain("App");
  });
});

describe("PreviewPanelInitControls — start", () => {
  it("visar ingen startknapp utan handler", () => {
    render(<ControlledControls />);
    expect(screen.queryByRole("button", { name: /Skapa första utkastet/ })).toBeNull();
  });

  it("startar via handlern", () => {
    const onStart = vi.fn();
    render(<ControlledControls onStart={onStart} />);
    fireEvent.click(screen.getByRole("button", { name: /Skapa första utkastet/ }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});

describe("PreviewPanelInitControls — tillgängliga namn", () => {
  /**
   * `ToggleGroup type="single"` renders `role="radiogroup"`, and a radiogroup
   * without an accessible name fails axe's `aria-input-field-name`.
   */
  it("namnger varje valrad", () => {
    render(<ControlledControls description="Något snyggt" />);
    openMoreChoices();
    for (const label of [
      "Färgpalett",
      "Färgläge",
      "Hemsida eller app",
      "Typ av sajt",
      "Komplexitet",
      "Stil",
      "Ton",
    ]) {
      expect(choiceRow(label)).toBeTruthy();
    }
    for (const row of screen.getAllByRole("radiogroup")) {
      expect(row.getAttribute("aria-labelledby") || row.getAttribute("aria-label")).toBeTruthy();
    }
  });

  it("ger antal sidor-slidern ett eget namn", () => {
    render(<ControlledControls />);
    openMoreChoices();
    expect(screen.getByRole("slider", { name: "Antal sidor" })).toBeTruthy();
  });

  it("ger Fler byggval ett expanderat tillstånd", () => {
    render(<ControlledControls />);
    const trigger = screen.getByRole("button", { name: /Fler byggval/ });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    openMoreChoices();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });
});
