import { describe, expect, it } from "vitest";
import { fixTailwindApplyOfComponents } from "./tailwind-apply-component-fixer";

describe("fixTailwindApplyOfComponents", () => {
  it("inlines a component class body when @apply'd from another rule", () => {
    const code = `@layer components {
  .surface-blueprint {
    background-color: blue;
    background-image: linear-gradient(red, blue);
  }

  .tile-1 {
    @apply surface-blueprint;
  }
}
`;
    const result = fixTailwindApplyOfComponents(code);
    expect(result.fixed).toBe(true);
    expect(result.replacedClasses).toEqual(["surface-blueprint"]);
    expect(result.code).toContain("background-color: blue");
    expect(result.code).toContain("background-image: linear-gradient(red, blue)");
    expect(result.code).not.toMatch(/@apply\s+surface-blueprint\s*;/);
  });

  it("preserves real utility classes alongside an inlined component class", () => {
    const code = `@layer components {
  .foo {
    color: red;
  }

  .bar {
    @apply foo px-4 py-2;
  }
}
`;
    const result = fixTailwindApplyOfComponents(code);
    expect(result.fixed).toBe(true);
    expect(result.code).toContain("@apply px-4 py-2;");
    expect(result.code).toContain("color: red");
    expect(result.code).not.toMatch(/@apply\s+foo\s/);
  });

  it("leaves stylesheets alone when @apply only references real utilities", () => {
    const code = `@layer components {
  .button {
    @apply rounded-md bg-blue-500 px-4 py-2 text-white;
  }
}
`;
    const result = fixTailwindApplyOfComponents(code);
    expect(result.fixed).toBe(false);
    expect(result.replacedClasses).toEqual([]);
    expect(result.code).toBe(code);
  });

  it("leaves variant-wrapped @apply alone (e.g. hover:custom-thing)", () => {
    const code = `@layer components {
  .badge {
    color: green;
  }

  .alert {
    @apply hover:badge px-2;
  }
}
`;
    const result = fixTailwindApplyOfComponents(code);
    // We don't touch variant-prefixed component-class applies — too risky.
    expect(result.fixed).toBe(false);
    expect(result.code).toBe(code);
  });

  it("skips component classes whose body contains nested rules (& selectors)", () => {
    const code = `@layer components {
  .complex {
    color: red;
    &:hover {
      color: blue;
    }
  }

  .other {
    @apply complex;
  }
}
`;
    const result = fixTailwindApplyOfComponents(code);
    // Body has `&` so we don't have a safe inline form.
    expect(result.fixed).toBe(false);
  });

  it("handles multiple component classes inlined from one @apply", () => {
    const code = `@layer components {
  .a {
    color: red;
  }

  .b {
    background: blue;
  }

  .c {
    @apply a b;
  }
}
`;
    const result = fixTailwindApplyOfComponents(code);
    expect(result.fixed).toBe(true);
    expect(result.replacedClasses).toContain("a");
    expect(result.replacedClasses).toContain("b");
    expect(result.code).toContain("color: red");
    expect(result.code).toContain("background: blue");
  });

  it("ignores @apply when no @layer components block exists at all", () => {
    const code = `.button {
  @apply px-4 py-2;
}
`;
    const result = fixTailwindApplyOfComponents(code);
    expect(result.fixed).toBe(false);
    expect(result.code).toBe(code);
  });

  it("reproduces and fixes the Snickar Anders surface-blueprint scenario", () => {
    const code = `@layer components {
  .surface-blueprint {
    background-color: color-mix(in oklab, var(--color-primary) 18%, white);
    background-image: radial-gradient(circle at 20% 20%, white 0%, transparent 28%);
  }

  .surface-oak {
    background-color: #e9dcc6;
  }

  .tile-1 {
    @apply surface-blueprint;
  }

  .tile-2 {
    @apply surface-oak;
  }

  .tile-6 {
    @apply surface-blueprint;
  }
}
`;
    const result = fixTailwindApplyOfComponents(code);
    expect(result.fixed).toBe(true);
    expect(result.replacedClasses).toContain("surface-blueprint");
    expect(result.replacedClasses).toContain("surface-oak");
    expect(result.code).not.toMatch(/@apply\s+surface-blueprint\s*;/);
    expect(result.code).not.toMatch(/@apply\s+surface-oak\s*;/);
  });
});
