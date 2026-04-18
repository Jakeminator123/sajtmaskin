"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Folder, History, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { getProjects, type Project } from "@/lib/project-client";

function formatRelative(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "Just nu";
  if (minutes < 60) return `${minutes} min sedan`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} tim sedan`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d sedan`;
  return date.toLocaleDateString("sv-SE", { month: "short", day: "numeric" });
}

interface BuilderProjectMenuProps {
  currentProjectId: string | null;
  disabled?: boolean;
  compact?: boolean;
}

export function BuilderProjectMenu({
  currentProjectId,
  disabled = false,
  compact = false,
}: BuilderProjectMenuProps) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

  const loadProjects = useCallback(async () => {
    if (isLoading) return;
    setIsLoading(true);
    setError(null);
    try {
      const list = await getProjects();
      setProjects(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte ladda projekt");
    } finally {
      setIsLoading(false);
      setHasFetched(true);
    }
  }, [isLoading]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open && !hasFetched) {
        void loadProjects();
      }
    },
    [hasFetched, loadProjects],
  );

  // Refresh when the active project changes (so the list reflects recent saves)
  useEffect(() => {
    if (!hasFetched) return;
    void loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProjectId]);

  const recent = (projects ?? [])
    .filter((p) => p.id !== currentProjectId)
    .slice(0, 8);

  return (
    <DropdownMenu onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          title="Öppna tidigare projekt"
          aria-label="Öppna tidigare projekt"
        >
          <History className="h-4 w-4" />
          {!compact && <span className="hidden sm:inline">Tidigare</span>}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Tidigare projekt</DropdownMenuLabel>
        {isLoading && (
          <div className="text-muted-foreground flex items-center gap-2 px-2 py-3 text-xs">
            <Loader2 className="h-3 w-3 animate-spin" />
            Laddar...
          </div>
        )}
        {!isLoading && error && (
          <div className="text-destructive px-2 py-3 text-xs">{error}</div>
        )}
        {!isLoading && !error && hasFetched && recent.length === 0 && (
          <div className="text-muted-foreground px-2 py-3 text-xs">
            Inga tidigare projekt.
          </div>
        )}
        {!isLoading && recent.map((project) => (
          <DropdownMenuItem key={project.id} asChild>
            <a
              href={`/builder?project=${project.id}`}
              className="flex items-start gap-2"
            >
              <Folder className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{project.name}</div>
                <div className="text-muted-foreground text-xs">
                  {formatRelative(project.updated_at)}
                </div>
              </div>
            </a>
          </DropdownMenuItem>
        ))}
        {!isLoading && projects && projects.length > recent.length + (currentProjectId ? 1 : 0) && (
          <div className="text-muted-foreground px-2 pb-1 pt-1 text-[11px]">
            Visar {recent.length} av {projects.length}
          </div>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href="/projects" className="flex items-center gap-2">
            <Folder className="h-3.5 w-3.5" />
            Visa alla projekt
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
