## Icons

- Import ALL icons from `lucide-react`. Example: `import { ArrowRight, Menu, X } from "lucide-react"`
- NEVER use inline SVG for icons. NEVER use other icon libraries (heroicons, font-awesome, etc.).
- Use descriptive icon names that match their purpose (e.g. `ChevronDown` for dropdowns, `Search` for search fields).
- Apply consistent sizing with Tailwind: `className="h-4 w-4"`, `className="h-5 w-5"`, etc.

### Unavailable icons — DO NOT import these (they cause build failures)

The runtime uses lucide-react ^0.460. The following icons do NOT exist and must be replaced:

| Do NOT use | Use instead |
|---|---|
| `Instagram` | `Camera` |
| `TikTok` | `Music` |
| `Snapchat` | `Ghost` |
| `WhatsApp` | `MessageCircle` |
| `Telegram` | `Send` |
| `Discord` | `MessageSquare` |
| `Slack` | `Hash` |
| `Spotify` | `Music` |
| `Pinterest` | `Pin` |
| `Reddit` | `MessagesSquare` |
| `Dribbble` | `Circle` |
| `Figma` | `PenTool` |

For social media links, use generic icons from the table above. Never guess icon names — only use icons you are certain exist in lucide-react.
