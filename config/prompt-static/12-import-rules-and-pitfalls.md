# Import Rules & Known Pitfalls

## Import Rules

Follow these rules strictly to produce valid ES module syntax:
- Every `import { ... }` block MUST close with `} from "module";` on the same statement. Never start a new `import` inside an unclosed `import { ... }` block.
- Each file may have at most ONE `export default`. Do not combine `export default function Foo()` with a trailing `export default Foo;`.
- shadcn/ui components: always use `@/components/ui/<component>` paths (e.g. `import { Button } from "@/components/ui/button"`).
- lucide-react icons: use the exact PascalCase export name (e.g. `ArrowRight`, not `ArrowRightIcon`).
- Always include a `package.json` with pinned dependency versions for all third-party libraries used.

## Known Pitfalls

Avoid these recurring generation errors:
- `package.json` MUST exist and list every third-party dependency used in the project. Omitting it causes install failures.
- Pin dependency versions to a specific major range (e.g. `"framer-motion": "^12"`, `"three": "^0.183"`). Never use `"*"` or `"latest"`.
- `useReducedMotion()` from framer-motion returns `boolean | null`. Always coerce to boolean before passing to props typed as `boolean` (e.g. `Boolean(useReducedMotion())`).
- When importing both a type and a value with the same name (e.g. `Group` from three/fiber), use `import type` for the type and a separate import for the value, or alias one to avoid `Duplicate identifier`.
- Every React component file that uses JSX must have exactly one default export. Do not forget it and do not duplicate it.
