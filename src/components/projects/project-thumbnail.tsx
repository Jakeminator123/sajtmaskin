/**
 * Deterministic fallback thumbnail for a project card.
 *
 * Renders a per-project "mini site" mockup whose colors derive from a stable
 * hash of the project id. This replaces the identical Folder icon so every
 * project reads as distinct even before a real preview screenshot exists.
 * Pure CSS/SVG — no network, no browser, safe in serverless.
 */

interface ProjectThumbnailProps {
  id: string;
  name: string;
  className?: string;
}

// FNV-1a: small, stable, deterministic across reloads and machines.
function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function ProjectThumbnail({ id, name, className }: ProjectThumbnailProps) {
  const seed = hashString(id || name || "sajtmaskin");
  const hue = seed % 360;
  const hue2 = (hue + 38) % 360;
  const accent = `hsl(${hue} 70% 58%)`;
  const accentSoft = `hsl(${hue} 60% 46%)`;
  const bgFrom = `hsl(${hue} 42% 13%)`;
  const bgTo = `hsl(${hue2} 48% 7%)`;
  const initial = (name?.trim()?.[0] || "S").toUpperCase();

  return (
    <div
      className={`absolute inset-0 overflow-hidden ${className ?? ""}`}
      style={{ background: `linear-gradient(135deg, ${bgFrom}, ${bgTo})` }}
      aria-hidden="true"
    >
      <div className="absolute inset-0 flex items-center justify-center p-6">
        <div
          className="w-full max-w-[220px] overflow-hidden rounded-md border shadow-lg"
          style={{
            borderColor: `hsl(${hue} 40% 30% / 0.6)`,
            background: `hsl(${hue} 30% 12% / 0.85)`,
          }}
        >
          <div
            className="flex items-center gap-1.5 px-2.5 py-1.5"
            style={{ background: `hsl(${hue} 30% 16%)` }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: accent }} />
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: `hsl(${hue} 30% 40%)` }} />
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: `hsl(${hue} 30% 40%)` }} />
          </div>
          <div className="space-y-2 p-3">
            <div className="h-3 w-2/3 rounded-sm" style={{ background: accent }} />
            <div className="h-1.5 w-full rounded-sm" style={{ background: `hsl(${hue} 20% 35%)` }} />
            <div className="h-1.5 w-5/6 rounded-sm" style={{ background: `hsl(${hue} 20% 30%)` }} />
            <div className="grid grid-cols-3 gap-1.5 pt-1">
              <div className="h-6 rounded-sm" style={{ background: `hsl(${hue} 25% 22%)` }} />
              <div className="h-6 rounded-sm" style={{ background: `hsl(${hue} 25% 22%)` }} />
              <div className="h-6 rounded-sm" style={{ background: accentSoft, opacity: 0.5 }} />
            </div>
          </div>
        </div>
      </div>
      <div
        className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold text-white/90"
        style={{ background: `hsl(${hue} 45% 30% / 0.8)` }}
      >
        {initial}
      </div>
    </div>
  );
}
