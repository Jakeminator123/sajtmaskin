"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/navbar";
import { AuthModal } from "@/components/auth/auth-modal";
import { Plus, Trash2, ExternalLink, Clock, Folder } from "lucide-react";
import { getProjects, deleteProject, Project } from "@/lib/project-client";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    try {
      setLoading(true);
      const data = await getProjects();
      setProjects(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Vill du verkligen ta bort "${name}"?`)) {
      return;
    }

    try {
      await deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (err: any) {
      alert(`Kunde inte ta bort projekt: ${err.message}`);
    }
  }

  function formatDate(dateStr: string) {
    const date = new Date(dateStr);
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
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950">
      <Navbar
        onLoginClick={() => setShowAuthModal(true)}
        onRegisterClick={() => setShowAuthModal(true)}
      />
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        defaultMode="login"
      />

      <div className="max-w-6xl mx-auto px-6 pt-24 pb-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-3xl font-bold text-zinc-100">Mina Projekt</h1>
            <p className="text-zinc-400 mt-1">
              {projects.length} sparade projekt
            </p>
          </div>
          <Link href="/">
            <Button className="gap-2 bg-blue-600 hover:bg-blue-700">
              <Plus className="h-4 w-4" />
              Nytt projekt
            </Button>
          </Link>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400">
            {error}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && projects.length === 0 && (
          <div className="text-center py-20">
            <Folder className="h-16 w-16 text-zinc-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-zinc-300 mb-2">
              Inga projekt än
            </h2>
            <p className="text-zinc-500 mb-6">
              Skapa ditt första projekt för att komma igång!
            </p>
            <Link href="/">
              <Button className="gap-2 bg-blue-600 hover:bg-blue-700">
                <Plus className="h-4 w-4" />
                Skapa projekt
              </Button>
            </Link>
          </div>
        )}

        {/* Project grid */}
        {!loading && projects.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <div
                key={project.id}
                className="group bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden hover:border-zinc-700 transition-all"
              >
                {/* Thumbnail placeholder */}
                <div className="aspect-video bg-gradient-to-br from-zinc-800 to-zinc-900 relative">
                  {project.thumbnail_path ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={project.thumbnail_path}
                      alt={project.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-zinc-600">
                      <Folder className="h-12 w-12" />
                    </div>
                  )}

                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                    <Link href={`/builder?project=${project.id}`}>
                      <Button
                        size="sm"
                        className="gap-2 bg-blue-600 hover:bg-blue-700"
                      >
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
                      <h3 className="font-semibold text-zinc-100 line-clamp-1">
                        {project.name}
                      </h3>
                      <span className="inline-block mt-1 px-2 py-0.5 bg-zinc-800 rounded text-xs text-zinc-400">
                        {getCategoryLabel(project.category)}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                      onClick={() => handleDelete(project.id, project.name)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {project.description && (
                    <p className="mt-2 text-sm text-zinc-500 line-clamp-2">
                      {project.description}
                    </p>
                  )}

                  <div className="mt-3 flex items-center gap-1 text-xs text-zinc-600">
                    <Clock className="h-3 w-3" />
                    {formatDate(project.updated_at)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
