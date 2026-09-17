import Link from "next/link";
import { PencilLine, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProjectSite } from "@/lib/projects/project-client";
import {
  projectCardBuilderHref,
  projectCardManageHref,
  projectCardMode,
} from "@/lib/projects/project-card-mode";

export function ProjectCardActions({
  projectId,
  site,
}: {
  projectId: string;
  site: ProjectSite | null | undefined;
}) {
  const mode = projectCardMode(site);
  const manageHref = projectCardManageHref(projectId);
  const editHref = projectCardBuilderHref(projectId);
  const showManage = mode !== "legacy";
  const manageIsPrimary = mode === "live" || mode === "progress" || mode === "problem";
  const buildLabel = mode === "legacy" ? "Öppna i byggaren" : "Fortsätt bygga";

  return (
    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
      {manageIsPrimary ? (
        <>
          <Button asChild className="bg-brand-teal hover:bg-brand-teal/90 w-full gap-2">
            <Link href={manageHref}>
              <Settings2 className="h-4 w-4" />
              Hantera sajt
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full gap-2">
            <Link href={editHref}>
              <PencilLine className="h-4 w-4" />
              Redigera
            </Link>
          </Button>
        </>
      ) : (
        <>
          <Button asChild className="bg-brand-teal hover:bg-brand-teal/90 w-full gap-2">
            <Link href={editHref}>
              <PencilLine className="h-4 w-4" />
              {buildLabel}
            </Link>
          </Button>
          {showManage ? (
            <Button asChild variant="outline" className="w-full gap-2">
              <Link href={manageHref}>
                <Settings2 className="h-4 w-4" />
                Hantera sajt
              </Link>
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
