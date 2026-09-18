import { ExternalLink } from "lucide-react";
import type { ProjectSite } from "@/lib/projects/project-client";
import { projectCardMode } from "@/lib/projects/project-card-mode";
import {
  addressKindLabel,
  cardAddressText,
  publishStateLabel,
  SITE_STATE_TONE_CLASS,
} from "@/lib/projects/site-labels";

export function ProjectCardSiteMeta({
  projectId: _projectId,
  site,
}: {
  /** Kept for the existing card contract; actions live on `ProjectCardActions`. */
  projectId: string;
  site: ProjectSite | null | undefined;
}) {
  if (!site) return null;

  const mode = projectCardMode(site);
  const state = publishStateLabel(site.state);
  const liveUrl = site.address.liveUrl;
  const showKind = site.address.kind !== "none";
  const showAddress = Boolean(liveUrl);
  const address = showAddress ? cardAddressText(site.address) : null;

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-block border px-2 py-0.5 text-xs ${SITE_STATE_TONE_CLASS[state.tone]}`}>
          {state.label}
        </span>
        {showKind ? (
          <span className="text-xs text-gray-500">{addressKindLabel(site.address.kind)}</span>
        ) : mode === "draft" ? (
          <span className="text-xs text-gray-500">Ännu inte en publicerad hemsida</span>
        ) : null}
      </div>
      {showAddress && liveUrl && address ? (
        <a
          href={liveUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex max-w-full items-center gap-1 text-xs text-gray-300 hover:text-white"
          title={liveUrl}
        >
          <span className="truncate">{address}</span>
          <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="sr-only">Öppna sajten</span>
        </a>
      ) : null}
    </div>
  );
}
