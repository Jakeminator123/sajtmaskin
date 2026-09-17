"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/layout/navbar";
import { ShaderBackground } from "@/components/layout/shader-background";
import { AuthModal } from "@/components/auth/auth-modal";
import { Loader2, Plus, Folder } from "lucide-react";
import {
  getProjects,
  getProjectSite,
  deleteProject,
  Project,
  type ProjectSite,
} from "@/lib/projects/project-client";
import { ProjectCard } from "@/components/projects/project-card";
import {
  countProjectListSegments,
  matchesProjectListSegment,
  type ProjectListSegment,
} from "@/lib/projects/project-card-mode";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const LIST_SEGMENTS: Array<{ id: ProjectListSegment; label: string }> = [
  { id: "all", label: "Alla" },
  { id: "published", label: "Publicerade" },
  { id: "drafts", label: "Utkast" },
];

function ProjectsPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [segment, setSegment] = useState<ProjectListSegment>("all");
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    projectId: string;
    projectName: string;
  }>({ isOpen: false, projectId: "", projectName: "" });
  const [isDeleting, setIsDeleting] = useState(false);
  const [sitesById, setSitesById] = useState<Record<string, ProjectSite | null>>({});

  useEffect(() => {
    loadProjects();
  }, []); // Only run on mount

  useEffect(() => {
    const login = searchParams.get("login");
    const authError = searchParams.get("error");
    if (!login && !authError) return;

    if (login === "success") {
      toast.success("Inloggningen lyckades.");
    }
    if (authError) {
      toast.error(authError);
      setAuthMode("login");
      setShowAuthModal(true);
    }

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("login");
    nextParams.delete("error");
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
  }, [pathname, router, searchParams]);

  async function loadProjects() {
    let regularProjects: Project[] = [];
    try {
      setLoading(true);
      regularProjects = await getProjects();
      setProjects(regularProjects);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Kunde inte ladda projekt";
      setError(errorMessage);
      return;
    } finally {
      setLoading(false);
    }

    const siteEntries = await Promise.all(
      regularProjects.map(async (project) => {
        try {
          return [project.id, await getProjectSite(project.id)] as const;
        } catch {
          // Leave the card in the loading/neutral state. Mapping a transient
          // 500 onto `null` would both hide a working portal retry and paint
          // the row as a confirmed "Utkast". A real missing site is `null`.
          return null;
        }
      }),
    );
    setSitesById(
      Object.fromEntries(
        siteEntries.filter((entry): entry is readonly [string, ProjectSite | null] => entry !== null),
      ),
    );
  }

  function openDeleteDialog(id: string, name: string) {
    setDeleteDialog({ isOpen: true, projectId: id, projectName: name });
  }

  function closeDeleteDialog() {
    setDeleteDialog({ isOpen: false, projectId: "", projectName: "" });
  }

  async function confirmDelete() {
    const { projectId } = deleteDialog;
    if (!projectId) return;

    setIsDeleting(true);

    const previousProjects = [...projects];
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    closeDeleteDialog();

    try {
      await deleteProject(projectId);
    } catch (err: unknown) {
      setProjects(previousProjects);
      const errorMessage = err instanceof Error ? err.message : "Okänt fel";
      setError(`Kunde inte ta bort projekt: ${errorMessage}`);
    } finally {
      setIsDeleting(false);
    }
  }

  const filteredProjects = useMemo(
    () => projects.filter((project) => matchesProjectListSegment(sitesById[project.id], segment)),
    [projects, sitesById, segment],
  );
  const counts = useMemo(
    () => countProjectListSegments(projects.map((project) => sitesById[project.id])),
    [projects, sitesById],
  );

  return (
    <div className="bg-background min-h-screen">
      <ShaderBackground theme="default" speed={0.2} opacity={0.3} />

      <Navbar
        onLoginClick={() => {
          setAuthMode("login");
          setShowAuthModal(true);
        }}
        onRegisterClick={() => {
          setAuthMode("register");
          setShowAuthModal(true);
        }}
      />
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        defaultMode={authMode}
      />

      <div className="relative z-10 mx-auto max-w-6xl px-6 pt-24 pb-12">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Mina Projekt</h1>
            <p className="mt-1 text-gray-400">
              Dina hemsidor — se status, öppna adressen och hantera publicering.
            </p>
            <p className="mt-1 text-sm text-gray-500">{projects.length} projekt totalt</p>
          </div>
          <Link href="/">
            <Button className="bg-brand-teal hover:bg-brand-teal/90 gap-2">
              <Plus className="h-4 w-4" />
              Nytt projekt
            </Button>
          </Link>
        </div>

        {loading && (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="overflow-hidden border border-gray-800 bg-black/50">
                <Skeleton className="aspect-video w-full rounded-none" />
                <div className="space-y-3 p-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                      <Skeleton className="h-5 w-36" />
                      <Skeleton className="h-4 w-16 rounded-none" />
                    </div>
                    <Skeleton className="h-8 w-8" />
                  </div>
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-9 w-full" />
                </div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="border border-red-500/30 bg-red-500/10 p-4 text-red-400">{error}</div>
        )}

        {!loading && !error && projects.length === 0 && (
          <div className="py-20 text-center">
            <Folder className="mx-auto mb-4 h-16 w-16 text-gray-600" />
            <h2 className="mb-2 text-xl font-semibold text-gray-300">Inga projekt än</h2>
            <p className="mb-6 text-gray-500">Skapa ditt första projekt för att komma igång!</p>
            <Link href="/">
              <Button className="bg-brand-teal hover:bg-brand-teal/90 gap-2">
                <Plus className="h-4 w-4" />
                Skapa projekt
              </Button>
            </Link>
          </div>
        )}

        {!loading && projects.length > 0 && (
          <div>
            <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Filtrera projekt">
              {LIST_SEGMENTS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={segment === item.id}
                  onClick={() => setSegment(item.id)}
                  className={cn(
                    "border px-3 py-1.5 text-sm transition-colors",
                    segment === item.id
                      ? "border-brand-teal/40 bg-brand-teal/10 text-white"
                      : "border-gray-800 bg-black/40 text-gray-400 hover:border-gray-700 hover:text-gray-200",
                  )}
                >
                  {item.label}
                  <span className="ml-2 text-xs text-gray-500">{counts[item.id]}</span>
                </button>
              ))}
            </div>

            {filteredProjects.length === 0 ? (
              <div className="border border-gray-800 bg-black/40 px-6 py-12 text-center">
                <h2 className="text-lg font-semibold text-gray-300">
                  {segment === "published"
                    ? "Inga publicerade sajter än"
                    : "Inga utkast just nu"}
                </h2>
                <p className="mt-2 text-sm text-gray-500">
                  {segment === "published"
                    ? "Publicera från byggaren när ett utkast är redo — sedan hanterar du sajten härifrån."
                    : "Byt till Alla eller Publicerade om sajten redan är live eller håller på att publiceras."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {filteredProjects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    site={sitesById[project.id]}
                    onDelete={openDeleteDialog}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <AlertDialog
        open={deleteDialog.isOpen}
        onOpenChange={(open) => {
          if (!open) closeDeleteDialog();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort projekt?</AlertDialogTitle>
            <AlertDialogDescription>
              Är du säker på att du vill ta bort &quot;{deleteDialog.projectName}&quot;? Denna åtgärd
              kan inte ångras.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Avbryt</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete} disabled={isDeleting}>
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Ta bort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ProjectsPageFallback() {
  return (
    <div className="bg-background min-h-screen">
      <div className="relative z-10 mx-auto max-w-6xl px-6 pt-24 pb-12">
        <div className="mb-10 flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="mt-2 h-4 w-28" />
          </div>
          <Skeleton className="h-10 w-32 rounded-md" />
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="overflow-hidden border border-gray-800 bg-black/50">
              <Skeleton className="aspect-video w-full rounded-none" />
              <div className="space-y-3 p-4">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-28" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={<ProjectsPageFallback />}>
      <ProjectsPageInner />
    </Suspense>
  );
}
