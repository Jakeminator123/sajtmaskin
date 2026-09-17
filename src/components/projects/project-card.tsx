"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Clock, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProjectThumbnail } from "@/components/projects/project-thumbnail";
import { ProjectCardSiteMeta } from "@/components/projects/project-card-site-meta";
import { ProjectCardActions } from "@/components/projects/project-card-actions";
import type { Project, ProjectSite } from "@/lib/projects/project-client";
import { projectCardMode, projectCardPrimaryHref } from "@/lib/projects/project-card-mode";
import { publishStateLabel, SITE_STATE_TONE_CLASS } from "@/lib/projects/site-labels";
import { cn } from "@/lib/utils";

const CATEGORY_LABELS: Record<string, string> = {
  website: "Hemsida",
  landing: "Landing Page",
  dashboard: "Dashboard",
};

function categoryLabel(category?: string) {
  return category ? CATEGORY_LABELS[category] || category : "Projekt";
}

function formatUpdatedAt(dateStr: string) {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return "Ogiltigt datum";
  }
  return date.toLocaleDateString("sv-SE", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function cardBorderClass(mode: ReturnType<typeof projectCardMode>) {
  switch (mode) {
    case "live":
      return "border-emerald-500/25 hover:border-emerald-500/40";
    case "progress":
      return "border-amber-500/25 hover:border-amber-500/40";
    case "problem":
      return "border-red-500/25 hover:border-red-500/40";
    default:
      return "border-gray-800 hover:border-gray-700";
  }
}

export function ProjectCard({
  project,
  site,
  onDelete,
}: {
  project: Project;
  site: ProjectSite | null | undefined;
  onDelete: (id: string, name: string) => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const mode = projectCardMode(site);
  const primaryHref = projectCardPrimaryHref(project.id, mode);
  const state = site ? publishStateLabel(site.state) : null;
  const statusLabel = state?.label ?? (mode === "legacy" ? "Utkast" : null);
  const statusTone = state?.tone ?? "idle";
  const hasImageThumbnail =
    typeof project.thumbnail_path === "string" &&
    (project.thumbnail_path.startsWith("http") || project.thumbnail_path.startsWith("/")) &&
    !imageFailed;
  const showDescription = Boolean(project.description) && (mode === "draft" || mode === "legacy");

  return (
    <article
      className={cn(
        "flex flex-col overflow-hidden border bg-black/50 transition-colors",
        cardBorderClass(mode),
      )}
    >
      <Link
        href={primaryHref}
        className="relative block aspect-video bg-linear-to-br from-gray-900 to-black"
        aria-label={
          mode === "live" || mode === "progress" || mode === "problem"
            ? `Hantera sajten ${project.name}`
            : `Öppna ${project.name} i byggaren`
        }
      >
        {hasImageThumbnail ? (
          <Image
            src={project.thumbnail_path as string}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className="object-cover"
            unoptimized={project.thumbnail_path?.startsWith("http") ?? false}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <ProjectThumbnail id={project.id} name={project.name} />
        )}
        {statusLabel ? (
          <span
            className={`absolute top-3 left-3 inline-block border px-2 py-0.5 text-xs backdrop-blur-sm ${SITE_STATE_TONE_CLASS[statusTone]}`}
          >
            {statusLabel}
          </span>
        ) : null}
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="line-clamp-1 font-semibold text-white">{project.name}</h3>
            <span className="mt-1 inline-block bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
              {categoryLabel(project.category)}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-gray-500 hover:bg-red-500/10 hover:text-red-400"
            onClick={(event) => {
              // Radix AlertDialog sätter aria-hidden på resten av sidan när
              // den öppnas. Om triggern behåller fokus hamnar fokus på en
              // ancestor med aria-hidden. Blurra först så Radix kan ta över.
              event.currentTarget.blur();
              onDelete(project.id, project.name);
            }}
            aria-label={`Ta bort projektet ${project.name}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        {showDescription ? (
          <p className="mt-2 line-clamp-2 text-sm text-gray-500">{project.description}</p>
        ) : null}

        <ProjectCardSiteMeta projectId={project.id} site={site} />
        <ProjectCardActions projectId={project.id} site={site} />

        <div className="mt-auto flex items-center gap-1 pt-3 text-xs text-gray-600">
          <Clock className="h-3 w-3" />
          {formatUpdatedAt(project.updated_at)}
        </div>
      </div>
    </article>
  );
}
