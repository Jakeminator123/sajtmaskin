import Link from "next/link";
import type { ProjectSite } from "@/lib/projects/project-client";
import {
  addressKindLabel,
  cardAddressText,
  publishStateLabel,
  type SiteStateTone,
} from "@/lib/projects/site-labels";

const TONE_CLASS: Record<SiteStateTone, string> = {
  live: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  progress: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  problem: "bg-red-500/10 text-red-400 border-red-500/30",
  idle: "bg-gray-800 text-gray-400 border-gray-700",
};

export function ProjectCardSiteMeta({
  projectId,
  site,
}: {
  projectId: string;
  site: ProjectSite | null | undefined;
}) {
  if (!site) return null;

  const state = publishStateLabel(site.state);
  const address = cardAddressText(site.address);

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-block border px-2 py-0.5 text-xs ${TONE_CLASS[state.tone]}`}>
          {state.label}
        </span>
        <span className="text-xs text-gray-500">{addressKindLabel(site.address.kind)}</span>
      </div>
      <p className="truncate text-xs text-gray-400" title={site.address.liveUrl ?? address}>
        {address}
      </p>
      <Link
        href={`/projects/${projectId}`}
        className="inline-flex text-xs text-gray-300 underline-offset-2 hover:text-white hover:underline"
      >
        Visa sajt
      </Link>
    </div>
  );
}
