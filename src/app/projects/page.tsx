"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/layout";
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
  }, []);

  useEffect(() => {
    const login = searchParams.get("login");
    const authError = searchParams.get("error");
    if (!login && !authError) return;

    if (login === "success") toast.success("Inloggningen lyckades.");
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
      setError(`Kunde inte ta bort: ${errorMessage}`);
    } finally {
      setIsDeleting(false);
    }
  }

  function formatDate(dateStr: string) {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "–";
    return date.toLocaleDateString("sv-SE", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div className="bg-background min-h-screen">
      <Navbar
        onLoginClick={() => { setAuthMode("login"); setShowAuthModal(true); }}
        onRegisterClick={() => { setAuthMode("register"); setShowAuthModal(true); }}
      />
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} defaultMode={authMode} />

      <div className="mx-auto max-w-5xl px-6 pt-24 pb-12">
        {/* Minimal header */}
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-foreground">Projekt</h1>
          <Link href="/">
            <Button size="sm" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Nytt
            </Button>
          </Link>
        </div>

        {loading && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-xl border border-border">
                <Skeleton className="aspect-video w-full" />
                <div className="p-3 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {!loading && !error && projects.length === 0 && (
          <div className="py-16 text-center">
            <Folder className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground mb-4">Inga projekt ännu.</p>
            <Link href="/">
              <Button size="sm" className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Skapa projekt
              </Button>
            </Link>
          </div>
        )}

        {!loading && projects.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => {
              const imageFailKey = `${project.id}:image`;
              const hasImage =
                typeof project.thumbnail_path === "string" &&
                (project.thumbnail_path.startsWith("http") || project.thumbnail_path.startsWith("/")) &&
                !failedVisuals.has(imageFailKey);

              return (
                <div
                  key={project.id}
                  className="group overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-foreground/15"
                >
                  <div className="relative aspect-video bg-muted">
                    {hasImage ? (
                      <Image
                        src={project.thumbnail_path as string}
                        alt={project.name}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover"
                        unoptimized={project.thumbnail_path?.startsWith("http") ?? false}
                        onError={() => setFailedVisuals((prev) => new Set(prev).add(imageFailKey))}
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/40">
                        <Folder className="h-8 w-8" />
                      </div>
                    )}

                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                      <Link href={`/builder?project=${project.id}`}>
                        <Button size="sm" className="gap-1.5">
                          <ExternalLink className="h-3.5 w-3.5" />
                          Öppna
                        </Button>
                      </Link>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-medium text-foreground">{project.name}</h3>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatDate(project.updated_at)}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => openDeleteDialog(project.id, project.name)}
                      aria-label={`Ta bort ${project.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AlertDialog open={deleteDialog.isOpen} onOpenChange={(open) => { if (!open) closeDeleteDialog(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort projekt?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{deleteDialog.projectName}&quot; tas bort permanent.
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
      <div className="mx-auto max-w-5xl px-6 pt-24 pb-12">
        <div className="mb-8 flex items-center justify-between">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-border">
              <Skeleton className="aspect-video w-full" />
              <div className="p-3 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-20" />
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
