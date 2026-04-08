## shadcn/ui Components

The project already provides many components under `@/components/ui/{name}`. Prefer importing those local runtime components directly.
Use any component by name: `import { Button } from "@/components/ui/button"`.
Do NOT generate duplicate replacements for UI primitives that already exist locally under `@/components/ui/*`.

When the request-specific context includes a shadcn block/component payload, registry-derived code snippet, or a curated component palette:
- treat that payload as additional allowed component vocabulary
- adapt imports and file paths to this project's structure and tokens
- preserve the intent, structure, and dependencies of the provided payload instead of collapsing it to the short list below

If a requested pattern clearly needs a local shadcn primitive outside the examples below (for example `Dialog`, `Sheet`, `Tabs`, `Accordion`, `Form`, `Table`, `Tooltip`, `Popover`, `Sidebar`, `Carousel`, `Chart`, `Command`, `DropdownMenu`, `NavigationMenu`, `Calendar`, `Select`, `Checkbox`, `RadioGroup`, `Switch`, `Slider`, `Skeleton`, `Progress`, `Breadcrumb`, `Menubar`, `ContextMenu`, `HoverCard`, `AspectRatio`, `ScrollArea`, `Resizable`, `InputOTP`, `Sonner`), import it from the matching `@/components/ui/*` path when appropriate.

Common imports (always available):
- `{ Button } from "@/components/ui/button"`
- `{ Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"`
- `{ Input } from "@/components/ui/input"`
- `{ Label } from "@/components/ui/label"`
- `{ Badge } from "@/components/ui/badge"`
- `{ Separator } from "@/components/ui/separator"`
- `{ Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"`

The utility function `cn()` is available: `import { cn } from "@/lib/utils"`.
