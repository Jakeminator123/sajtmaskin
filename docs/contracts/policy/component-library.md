# Component library policy

How scaffolds, UI component libraries, and capability-gated dependencies interact in the generation pipeline.

## Ownership split

| Layer | Owns | Examples |
|---|---|---|
| **Scaffolds** | App structure, routes, base layout, core files | `app/layout.tsx`, `app/page.tsx`, route pages, `globals.css`, `package.json` |
| **shadcn/ui** | On-demand UI widgets via registry | carousel, chart, sheet/drawer, tabs, datatable, sidebar, calendar, toast, command, form fields |
| **Capability-gated deps** | Heavy libraries injected only when prompt signals require them | `framer-motion`, `@react-three/fiber`, `@react-three/drei`, `@react-three/rapier`, `@tanstack/react-table`, `recharts` |

## shadcn/ui as primary component source

shadcn is the default source for UI components that go beyond what scaffolds provide. It is not a replacement for scaffolds but a composable layer on top.

Components like `carousel`, `chart`, `sidebar`, `calendar`, `command`, and `datatable` should be sourced from shadcn registry when the prompt or capabilities indicate they are needed.

`@/components/ui/` imports are already whitelisted in `project-sanity.ts` and do not trigger unresolved-import errors.

`## Your Toolkit` is the prompt-facing summary of that layer. It is built from the registry-synced `SHADCN_COMPONENTS` map, which is synced against components that actually exist locally under `src/components/ui`, so the model sees a grouped summary of the safe local runtime surface rather than a stale manual shortlist.

## Capability-gated dependencies

`capability-inference.ts` detects prompt signals and sets boolean flags. These flags currently drive prompt hints via `buildCapabilityHints()`. The policy for each:

| Capability flag | Library | Gate policy |
|---|---|---|
| `needsMotion` | `framer-motion` (Motion for React) | Install only when prompt clearly requires reveal animations, scroll motion, drag/gesture, or micro-interactions. Not default. |
| `needs3D` | `three` + `@react-three/fiber` + `@react-three/drei` | Strong feature gate for decorative WebGL/Three.js/R3F. Hovering, floating and product-orbit motion stay here without physics. |
| `needsPhysics` | `@react-three/rapier` via `physics-3d` | Only when explicit gravity, bouncing, falling, collisions, rigid bodies or physics simulation are requested. |
| `needsCharts` | `recharts` (via shadcn `ChartContainer`) | Install when chart/graph/analytics signal is present. |
| `needsCarousel` | `embla-carousel-react` (via shadcn `Carousel`) | Install when carousel/slider/gallery signal is present. |
| `needsForms` | `react-hook-form` + `zod` (via shadcn `Form`) | Install when form/booking/contact-form signal is present. |
| `needsDataUI` | `@tanstack/react-table` (via shadcn `Table`) | Install when data table/CRUD/sorting/filtering signal is present. |

### 3D stack enforcement (baseline vs gated)

The React-Three stack (`three`, `@react-three/fiber`, `@react-three/drei`, `@react-three/rapier`) is **not** in the always-installed generated baseline. `applyThreeStackPolicy()` in `src/lib/gen/export/project-scaffold.ts` runs during `mergePackageJsonWithBaseline` and treats the stack as one group: if any member is imported by the generated code it pins every present member to the canonical version from `KNOWN_PACKAGES` (and ensures `three`, the shared peer dependency, is present even when only the React wrappers are imported); if nothing in the stack is imported it strips any members that leaked into the model `package.json` (capability false-positive bloat, e.g. a brief that tagged `visual-3d` on a prompt that never rendered a Canvas). The gated pins are kept in lockstep with the platform by `project-scaffold-baseline-parity.test.ts`.

## Dynamic UI Recipes

When capabilities are detected, the orchestration pipeline resolves shadcn registry items through `src/lib/gen/data/shadcn-ui-recipes.ts` and injects them into the dynamic context as `## UI Recipes`. A recipe is a small, request-specific prompt reference: item metadata, dependencies, registry dependencies and compact excerpts from the most relevant files.

Candidate selection is **search-driven** (Fas 4 of the shadcn-registry plan, 2026-07-22): capability signals + prompt keywords become deterministic search queries (`src/lib/gen/data/shadcn-recipe-search.ts`) that are fuzzy-matched against the official registry INDEX (name/title/description/categories, restricted to `registry:ui|block|example`) and the community registries declared in `components.json` (item catalog seeded by `config/community-registries.json`). No LLM calls run in the resolver — it sits in the orchestration critical path. Gated by `SAJTMASKIN_SHADCN_RESOLVER_SEARCH` (default ON; `0`/`false` restores the legacy hardcoded candidate lists exactly), and an index fetch failure automatically degrades to the same legacy lists so network errors never empty the candidate set. Regression evidence: `src/lib/gen/data/shadcn-recipe-search.snapshot.test.ts` (pinned index fixture, six prompt classes, legacy vs search).

UI Recipes replace the old local `data/shadcn-examples/` cache and the old `## Component References` path. Static component patterns in `config/prompt-core/02-component-contract.md` still serve as always-present baseline; `## UI Recipes` add request-specific depth for blocks/components without giving the codegen LLM live MCP or arbitrary web access.

## Libraries evaluated but not default

| Library | Status | Rationale |
|---|---|---|
| **DaisyUI** | Evaluate as optional mode | Adds a parallel styling paradigm (CSS component classes + 35 themes). Not compatible with current `@theme inline` strategy without migration. Good for prototyping or alternative style tracks. |
| **Flowbite** | Inspiration/fallback only | Overlaps heavily with shadcn. Not first choice given existing shadcn/radix/tailwind stack. |

## Unresolved import severity

Unresolved local imports default to **error** severity in `project-sanity.ts`. During rollout, `SAJTMASKIN_SANITY_ALLOW_UNRESOLVED_IMPORT_WARNINGS=true` downgrades them to warnings. Usage of this fallback is tracked in telemetry (`preflight.unresolvedImportFallbackUsed`) to measure how often it fires before locking to strict permanently.

## Missing package.json

A missing `package.json` is treated as a hard **error** in sanity checks. Without it, dependency readiness cannot be verified and the project cannot be installed or built.
