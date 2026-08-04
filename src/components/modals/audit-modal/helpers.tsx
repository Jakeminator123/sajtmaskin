import type { Tab } from "./types";

const tabs: Tab[] = [
  { id: "overview", label: "Översikt", icon: "📊" },
  { id: "improvements", label: "Förbättringar", icon: "✨" },
  { id: "technical", label: "Teknisk", icon: "⚙️" },
  { id: "business", label: "Budget", icon: "💰" },
];

function sanitizeDisplayText(value?: string): string {
  if (!value) return "";
  let cleaned = value.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");
  cleaned = cleaned.replace(/\r\n/g, "\n");
  cleaned = cleaned.replace(/[ \t]+\n/g, "\n");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  return cleaned.trim();
}

function renderTextList(items?: string[]) {
  if (!items || items.length === 0) {
    return <p className="text-xs text-muted-foreground/70">–</p>;
  }
  return (
    <ul className="list-inside list-disc space-y-1 text-xs text-foreground/90">
      {items.map((item, index) => (
        <li key={`${item}-${index}`}>{sanitizeDisplayText(item)}</li>
      ))}
    </ul>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="py-12 text-center">
      <span className="mb-4 block text-4xl">{icon}</span>
      <h3 className="mb-2 text-lg font-medium text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground/70">{description}</p>
    </div>
  );
}

export { tabs, sanitizeDisplayText, renderTextList, EmptyState };
