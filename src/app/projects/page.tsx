"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Navbar, ShaderBackground } from "@/components/layout";
import { AuthModal } from "@/components/auth";
import { Loader2, Plus, Trash2, ExternalLink, Clock, Folder } from "lucide-react";
import { getProjects, deleteProject, Project } from "@/lib/project-client";
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

function ProjectsPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [failedVisuals, setFailedVisuals] = useState<Set<string>>(new Set());
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    projectId: string;
    projectName: string;
  }>({ isOpen: false, projectId: "", projectName: "" });
  const [isDeleting, setIsDeleting] = useState(false);

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
    try {
      setLoading(true);
      const regularProjects = await getProjects();
      setProjects(regularProjects);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Kunde inte ladda projekt";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }

  // Open delete confirmation dialog
  function openDeleteDialog(id: string, name: string) {
    setDeleteDialog({ isOpen: true, projectId: id, projectName: name });
  }

  // Close delete confirmation dialog
  function closeDeleteDialog() {
    setDeleteDialog({ isOpen: false, projectId: "", projectName: "" });
  }

  // Confirm and execute delete
  async function confirmDelete() {
    const { projectId } = deleteDialog;
    if (!projectId) return;

    setIsDeleting(true);

    // Optimistically update UI (remove from list immediately)
    const previousProjects = [...projects];
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    closeDeleteDialog();

    try {
      await deleteProject(projectId);
    } catch (err: unknown) {
      // Revert UI change on error
      setProjects(previousProjects);
      const errorMessage = err instanceof Error ? err.message : "Okänt fel";
      setError(`Kunde inte ta bort projekt: ${errorMessage}`);
    } finally {
      setIsDeleting(false);
    }
  }

  function formatDate(dateStr: string) {
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

  function getCategoryLabel(category?: string) {
    const labels: Record<string, string> = {
      website: "Hemsida",
      landing: "Landing Page",
      dashboard: "Dashboard",
    };
    return category ? labels[category] || category : "Okänd";
  }

  return (
    <div className="bg-background min-h-screen">
      {/* Shader Background - subtle for projects page */}
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
        {/* Header */}
        <div className="mb-10 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Mina Projekt</h1>
            <p className="mt-1 text-gray-400">{projects?.length || 0} projekt totalt</p>
          </div>
          <Link href="/">
            <Button className="bg-brand-teal hover:bg-brand-teal/90 gap-2">
              <Plus className="h-4 w-4" />
              Nytt projekt
            </Button>
          </Link>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="overflow-hidden border border-gray-800 bg-black/50">
                <Skeleton className="aspect-video w-full rounded-none" />
                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                      <Skeleton className="h-5 w-36" />
                      <Skeleton className="h-4 w-16 rounded-none" />
                    </div>
                    <Skeleton className="h-8 w-8" />
                  </div>
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-28" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="border border-red-500/30 bg-red-500/10 p-4 text-red-400">{error}</div>
        )}

        {/* Empty state */}
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

        {/* Project grid */}
        {!loading && projects.length > 0 && (
          <div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="group overflow-hidden border border-gray-800 bg-black/50 transition-all hover:border-gray-700"
                >
                  {/* Thumbnail */}
                  <div className="relative aspect-video bg-linear-to-br from-gray-900 to-black">
                    {(() => {
                      const imageFailKey = `${project.id}:image`;
                      const hasImageThumbnail =
                        typeof project.thumbnail_path === "string" &&
                        (project.thumbnail_path.startsWith("http") ||
                          project.thumbnail_path.startsWith("/")) &&
                        !failedVisuals.has(imageFailKey);

                      if (hasImageThumbnail) {
                        return (
                          <Image
                            src={project.thumbnail_path as string}
                            alt={project.name}
                            fill
                            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                            className="object-cover"
                            unoptimized={project.thumbnail_path?.startsWith("http") ?? false}
                            onError={() => {
                              setFailedVisuals((prev) => new Set(prev).add(imageFailKey));
                            }}
                          />
                        );
                      }

                      return (
                        <div className="absolute inset-0 flex items-center justify-center text-gray-700">
                          <Folder className="h-12 w-12" />
                        </div>
                      );
                    })()}

                    {/* Hover overlay */}
                    <div className="absolute inset-0 flex items-center justify-center gap-3 bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                      <Link href={`/builder?project=${project.id}`}>
                        <Button size="sm" className="bg-brand-teal hover:bg-brand-teal/90 gap-2">
                          <ExternalLink className="h-4 w-4" />
                          Öppna
                        </Button>
                      </Link>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="line-clamp-1 font-semibold text-white">{project.name}</h3>
                        <span className="mt-1 inline-block bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
                          {getCategoryLabel(project.category)}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-gray-500 hover:bg-red-500/10 hover:text-red-400"
                        onClick={() => openDeleteDialog(project.id, project.name)}
                        aria-label={`Ta bort projektet ${project.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    {project.description && (
                      <p className="mt-2 line-clamp-2 text-sm text-gray-500">
                        {project.description}
                      </p>
                    )}

                    <div className="mt-3 flex items-center gap-1 text-xs text-gray-600">
                      <Clock className="h-3 w-3" />
                      {formatDate(project.updated_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialog.isOpen} onOpenChange={(open) => { if (!open) closeDeleteDialog(); }}>
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
            <AlertDialogAction
              variant="destructive"
              onClick={confirmDelete}
              disabled={isDeleting}
            >
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
