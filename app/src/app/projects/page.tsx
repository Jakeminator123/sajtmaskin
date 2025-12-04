"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/navbar";
import { AuthModal } from "@/components/auth/auth-modal";
import { ShaderBackground } from "@/components/shader-background";
import { Plus, Trash2, ExternalLink, Clock, Folder } from "lucide-react";
import { getProjects, deleteProject, Project } from "@/lib/project-client";
import { FloatingAvatar } from "@/components/avatar";
import { useAvatar } from "@/contexts/AvatarContext";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const { triggerReaction } = useAvatar();

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
      triggerReaction("download", `"${name}" borttaget!`);
    } catch (err: any) {
      alert(`Kunde inte ta bort projekt: ${err.message}`);
      triggerReaction("generation_error", "Kunde inte ta bort projektet.");
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
    <div className="min-h-screen bg-black">
      {/* Shader Background - subtle for projects page */}
      <ShaderBackground color="#101828" speed={0.2} opacity={0.3} />

      <Navbar
        onLoginClick={() => setShowAuthModal(true)}
        onRegisterClick={() => setShowAuthModal(true)}
      />
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        defaultMode="login"
      />

      <div className="relative z-10 max-w-6xl mx-auto px-6 pt-24 pb-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-3xl font-bold text-white">Mina Projekt</h1>
            <p className="text-gray-400 mt-1">
              {projects.length} sparade projekt
            </p>
          </div>
          <Link href="/">
            <Button className="gap-2 bg-teal-600 hover:bg-teal-500">
              <Plus className="h-4 w-4" />
              Nytt projekt
            </Button>
          </Link>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin h-8 w-8 border-b-2 border-teal-500" />
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 p-4 text-red-400">
            {error}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && projects.length === 0 && (
          <div className="text-center py-20">
            <Folder className="h-16 w-16 text-gray-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-300 mb-2">
              Inga projekt än
            </h2>
            <p className="text-gray-500 mb-6">
              Skapa ditt första projekt för att komma igång!
            </p>
            <Link href="/">
              <Button className="gap-2 bg-teal-600 hover:bg-teal-500">
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
                className="group bg-black/50 border border-gray-800 overflow-hidden hover:border-gray-700 transition-all"
              >
                {/* Thumbnail placeholder */}
                <div className="aspect-video bg-gradient-to-br from-gray-900 to-black relative">
                  {project.thumbnail_path ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={project.thumbnail_path}
                      alt={project.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-gray-700">
                      <Folder className="h-12 w-12" />
                    </div>
                  )}

                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                    <Link href={`/builder?project=${project.id}`}>
                      <Button
                        size="sm"
                        className="gap-2 bg-teal-600 hover:bg-teal-500"
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
                      <h3 className="font-semibold text-white line-clamp-1">
                        {project.name}
                      </h3>
                      <span className="inline-block mt-1 px-2 py-0.5 bg-gray-800 text-xs text-gray-400">
                        {getCategoryLabel(project.category)}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-gray-500 hover:text-red-400 hover:bg-red-500/10"
                      onClick={() => handleDelete(project.id, project.name)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {project.description && (
                    <p className="mt-2 text-sm text-gray-500 line-clamp-2">
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
        )}
      </div>

      {/* 3D Avatar Guide */}
      <FloatingAvatar section="projects" showWelcome={false} />
    </div>
  );
}
