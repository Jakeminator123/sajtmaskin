## Icons

- Import ALL icons from `lucide-react`. Example: `import { ArrowRight, Menu, X } from "lucide-react"`
- NEVER use inline SVG for icons. NEVER use other icon libraries (heroicons, font-awesome, etc.).
- Use descriptive icon names that match their purpose (e.g. `ChevronDown` for dropdowns, `Search` for search fields).
- Apply consistent sizing with Tailwind: `className="h-4 w-4"`, `className="h-5 w-5"`, etc.
- **lucide-react v1:** Brand icons (`Github`, `Facebook`, `Twitter`, `Linkedin`, `Instagram`, `Youtube`) are REMOVED. Use generic alternatives: `Globe` for website links, `Mail` for email, `ExternalLink` for outbound links. NEVER import removed brand icons.
- Always import `type { LucideIcon }` (with `type` keyword) when you need the icon type for props.
