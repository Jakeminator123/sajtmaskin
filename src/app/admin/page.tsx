"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Database,
  FileText,
  Key,
  Loader2,
  Lock,
  Mail,
  Printer,
  TrendingUp,
} from "lucide-react";
import { ShaderBackground } from "@/components/layout/shader-background";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AdminAnalyticsTab } from "./components/AdminAnalyticsTab";
import { AdminDatabaseTab } from "./components/AdminDatabaseTab";
import { AdminEnvironmentTab } from "./components/AdminEnvironmentTab";
import { AdminFrontlogsTab } from "./components/AdminFrontlogsTab";
import type {
  AdminTab,
  AnalyticsStats,
  DatabaseStats,
  EnvStatusPayload,
  FrontlogsPayload,
  IntegrationStatus,
  TemplateSyncStatus,
  TeamStatus,
  VercelEnvVar,
  VercelProject,
} from "./components/types";

const ADMIN_TAB_LABELS: Record<AdminTab, string> = {
  analytics: "Statistik",
  database: "Databaser",
  environment: "Miljö",
  frontlogs: "Frontloggar",
};

export default function AdminPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [dbStats, setDbStats] = useState<DatabaseStats | null>(null);
  const [days, setDays] = useState(30);
  const [activeTab, setActiveTab] = useState<AdminTab>("analytics");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [envStatus, setEnvStatus] = useState<EnvStatusPayload | null>(null);
  const [envError, setEnvError] = useState<string | null>(null);
  const [envLoading, setEnvLoading] = useState(false);
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus | null>(null);
  const [vercelProjects, setVercelProjects] = useState<VercelProject[]>([]);
  const [vercelProjectsLoading, setVercelProjectsLoading] = useState(false);
  const [vercelProjectsError, setVercelProjectsError] = useState<string | null>(null);
  const [selectedVercelProjectId, setSelectedVercelProjectId] = useState<string | null>(null);
  const [vercelEnvVars, setVercelEnvVars] = useState<VercelEnvVar[]>([]);
  const [vercelEnvLoading, setVercelEnvLoading] = useState(false);
  const [confirmVercelProjectId, setConfirmVercelProjectId] = useState<string | null>(null);
  const [frontlogs, setFrontlogs] = useState<FrontlogsPayload | null>(null);
  const [frontlogsLoading, setFrontlogsLoading] = useState(false);
  const [frontlogsError, setFrontlogsError] = useState<string | null>(null);
  const [selectedFrontlogSlug, setSelectedFrontlogSlug] = useState<string | null>(null);
  const [teamStatus, setTeamStatus] = useState<TeamStatus | null>(null);
  const [teamStatusLoading, setTeamStatusLoading] = useState(false);
  const [templateSyncStatus, setTemplateSyncStatus] = useState<TemplateSyncStatus | null>(null);

  const handlePrintCurrentTab = () => {
    if (typeof window === "undefined") return;

    const { body } = document;
    const previousMode = body.dataset.adminPrintMode;
    const previousTab = body.dataset.adminPrintTab;

    const cleanup = () => {
      if (previousMode) {
        body.dataset.adminPrintMode = previousMode;
      } else {
        delete body.dataset.adminPrintMode;
      }

      if (previousTab) {
        body.dataset.adminPrintTab = previousTab;
      } else {
        delete body.dataset.adminPrintTab;
      }
    };

    body.dataset.adminPrintMode = "current-tab";
    body.dataset.adminPrintTab = activeTab;

    const timeoutId = window.setTimeout(cleanup, 1000);
    const afterPrintHandler = () => {
      window.clearTimeout(timeoutId);
      cleanup();
    };

    window.addEventListener("afterprint", afterPrintHandler, { once: true });
    window.print();
  };

  const fetchStats = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/analytics?days=${days}`);
      const data = await response.json();

      if (!data.success) {
        if (response.status === 401) {
          setIsAuthenticated(false);
          localStorage.removeItem("admin-auth");
          setError("Ingen åtkomst");
        } else {
          setError(data.error || "Kunde inte hämta statistik");
        }
        return;
      }

      setStats(data.stats);
    } catch {
      setError("Kunde inte ansluta till servern");
    } finally {
      setIsLoading(false);
    }
  }, [days]);

  const fetchDbStats = async () => {
    try {
      const response = await fetch("/api/admin/database");
      const data = await response.json();
      if (data.success) {
        setDbStats(data.stats);
      }
    } catch (err) {
      console.error("Failed to fetch db stats:", err);
    }
  };

  const fetchEnvStatus = async () => {
    setEnvLoading(true);
    setEnvError(null);
    try {
      const response = await fetch("/api/admin/env");
      const data = await response.json();
      if (data.success) {
        setEnvStatus(data);
      } else {
        setEnvError(data.error || "Kunde inte hämta miljöstatus");
      }
    } catch {
      setEnvError("Kunde inte hämta miljöstatus");
    } finally {
      setEnvLoading(false);
    }
  };

  const fetchIntegrations = async () => {
    try {
      const response = await fetch("/api/integrations/status");
      const data = await response.json();
      if (response.ok) {
        setIntegrationStatus(data);
      }
    } catch {
      // Non-blocking
    }
  };

  const fetchVercelProjects = async () => {
    setVercelProjectsLoading(true);
    setVercelProjectsError(null);
    try {
      const response = await fetch("/api/admin/vercel/projects");
      const data = await response.json();
      if (data.success) {
        setVercelProjects(Array.isArray(data.projects) ? data.projects : []);
      } else {
        setVercelProjectsError(data.error || "Kunde inte hämta Vercel-projekt");
      }
    } catch {
      setVercelProjectsError("Kunde inte hämta Vercel-projekt");
    } finally {
      setVercelProjectsLoading(false);
    }
  };

  const fetchVercelEnv = async (projectId: string) => {
    if (!projectId) return;
    setVercelEnvLoading(true);
    try {
      const response = await fetch(
        `/api/admin/vercel/env?projectId=${encodeURIComponent(projectId)}`,
      );
      const data = await response.json();
      if (data.success) {
        setVercelEnvVars(Array.isArray(data.envs) ? data.envs : []);
      }
    } catch {
      // Non-blocking
    } finally {
      setVercelEnvLoading(false);
    }
  };

  const fetchFrontlogs = useCallback(
    async (slug = selectedFrontlogSlug) => {
      setFrontlogsLoading(true);
      setFrontlogsError(null);
      try {
        const params = new URLSearchParams({ limit: "120" });
        if (slug) {
          params.set("slug", slug);
        }
        const response = await fetch(`/api/admin/frontlogs?${params.toString()}`);
        const data = await response.json();
        if (data.success) {
          setFrontlogs(data as FrontlogsPayload);
        } else {
          setFrontlogsError(data.error || "Kunde inte hämta frontloggar");
        }
      } catch {
        setFrontlogsError("Kunde inte hämta frontloggar");
      } finally {
        setFrontlogsLoading(false);
      }
    },
    [selectedFrontlogSlug],
  );

  const fetchTeamStatus = async () => {
    setTeamStatusLoading(true);
    try {
      const response = await fetch("/api/admin/vercel/team-status");
      const data = await response.json();
      if (data.configured !== undefined) {
        setTeamStatus(data);
      }
    } catch {
      // Non-blocking
    } finally {
      setTeamStatusLoading(false);
    }
  };

  const fetchTemplateSyncStatus = async () => {
    try {
      const response = await fetch("/api/admin/templates/sync");
      const data = await response.json();
      if (data.success) {
        setTemplateSyncStatus(data as TemplateSyncStatus);
      } else {
        setTemplateSyncStatus(null);
      }
    } catch {
      setTemplateSyncStatus(null);
    }
  };

  useEffect(() => {
    const stored = localStorage.getItem("admin-auth");
    if (stored === "true") {
      setIsAuthenticated(true);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "analytics" && isAuthenticated) {
      void fetchStats();
    }
  }, [activeTab, isAuthenticated, fetchStats]);

  useEffect(() => {
    if (activeTab === "database" && isAuthenticated) {
      fetchDbStats();
      fetchTemplateSyncStatus();
    }
  }, [activeTab, isAuthenticated]);

  useEffect(() => {
    if (activeTab === "environment" && isAuthenticated) {
      fetchEnvStatus();
      fetchIntegrations();
      fetchVercelProjects();
      fetchTeamStatus();
    }
  }, [activeTab, isAuthenticated]);

  useEffect(() => {
    if (activeTab === "frontlogs" && isAuthenticated) {
      void fetchFrontlogs();
    }
  }, [activeTab, isAuthenticated, fetchFrontlogs]);

  useEffect(() => {
    if (!envStatus?.vercel?.projectId || selectedVercelProjectId) return;
    setSelectedVercelProjectId(envStatus.vercel.projectId);
  }, [envStatus, selectedVercelProjectId]);

  useEffect(() => {
    if (!selectedVercelProjectId) return;
    fetchVercelEnv(selectedVercelProjectId);
  }, [selectedVercelProjectId]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!data.success) {
        setError(data.error || "Fel e-post eller lösenord");
        setIsLoading(false);
        return;
      }

      const adminEmails = (
        process.env.NEXT_PUBLIC_ADMIN_EMAILS ||
        process.env.NEXT_PUBLIC_ADMIN_EMAIL ||
        ""
      )
        .split(",")
        .map((mail: string) => mail.trim().toLowerCase())
        .filter(Boolean);

      if (!adminEmails.includes((data.user?.email ?? "").toLowerCase())) {
        setError("Du har inte admin-behörighet");
        await fetch("/api/auth/logout", { method: "POST" });
        setIsLoading(false);
        return;
      }

      setIsAuthenticated(true);
      localStorage.setItem("admin-auth", "true");
    } catch {
      setError("Kunde inte ansluta till servern");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setIsAuthenticated(false);
    setEmail("");
    setPassword("");
    setStats(null);
    setDbStats(null);
    setFrontlogs(null);
    setTemplateSyncStatus(null);
    localStorage.removeItem("admin-auth");
  };

  const handleClearTable = async (table: string) => {
    if (confirmAction !== table) {
      setConfirmAction(table);
      return;
    }

    setActionLoading(table);
    try {
      const response = await fetch("/api/admin/database", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear", table }),
      });
      const data = await response.json();
      if (data.success) {
        await fetchDbStats();
        await fetchStats();
      }
    } catch (err) {
      console.error("Failed to clear table:", err);
    } finally {
      setActionLoading(null);
      setConfirmAction(null);
    }
  };

  const handleFlushRedis = async () => {
    if (confirmAction !== "redis") {
      setConfirmAction("redis");
      return;
    }

    setActionLoading("redis");
    try {
      await fetch("/api/admin/database", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "flush-redis" }),
      });
      await fetchDbStats();
    } catch (err) {
      console.error("Failed to flush Redis:", err);
    } finally {
      setActionLoading(null);
      setConfirmAction(null);
    }
  };

  const handleResetAll = async () => {
    if (confirmAction !== "reset-all") {
      setConfirmAction("reset-all");
      return;
    }

    setActionLoading("reset-all");
    try {
      await fetch("/api/admin/database", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset-all" }),
      });
      await fetchDbStats();
      await fetchStats();
    } catch (err) {
      console.error("Failed to reset all:", err);
    } finally {
      setActionLoading(null);
      setConfirmAction(null);
    }
  };

  const handleClearUploads = async () => {
    if (confirmAction !== "uploads") {
      setConfirmAction("uploads");
      return;
    }

    setActionLoading("uploads");
    try {
      await fetch("/api/admin/database", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear-uploads" }),
      });
      await fetchDbStats();
    } catch (err) {
      console.error("Failed to clear uploads:", err);
    } finally {
      setActionLoading(null);
      setConfirmAction(null);
    }
  };

  const handleDeleteVercelProject = async (project: VercelProject) => {
    if (confirmVercelProjectId !== project.id) {
      setConfirmVercelProjectId(project.id);
      return;
    }

    setActionLoading(`vercel:${project.id}`);
    try {
      const res = await fetch(`/api/admin/vercel/projects/${encodeURIComponent(project.id)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Kunde inte radera projekt");
      }
      setMessage(`Raderade Vercel-projekt: ${project.name}`);
      setTimeout(() => setMessage(null), 5000);
      await fetchVercelProjects();
      if (selectedVercelProjectId === project.id) {
        setSelectedVercelProjectId(null);
        setVercelEnvVars([]);
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Radering misslyckades");
      setTimeout(() => setMessage(null), 5000);
    } finally {
      setActionLoading(null);
      setConfirmVercelProjectId(null);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="bg-background flex min-h-screen items-center justify-center p-4">
        <ShaderBackground theme="blue" speed={0.2} />
        <div className="relative z-10 w-full max-w-md">
          <div className="border border-border bg-card p-8">
            <div className="mb-6 text-center">
              <div className="bg-primary/10 mx-auto mb-4 flex h-12 w-12 items-center justify-center">
                <Lock className="text-primary h-6 w-6" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">Admin Panel</h1>
              <p className="mt-2 text-muted-foreground">Logga in med admin-kontot</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="relative">
                <Mail className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="E-post"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 border-border bg-card pl-10 text-foreground"
                  required
                />
              </div>
              <div className="relative">
                <Lock className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="password"
                  placeholder="Lösenord"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 border-border bg-card pl-10 text-foreground"
                  required
                />
              </div>

              {error && <p className="text-center text-sm text-red-400">{error}</p>}

              <Button
                type="submit"
                className="bg-primary hover:bg-primary/90 h-11 w-full"
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Logga in"}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
                ← Tillbaka till startsidan
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-print-root bg-background min-h-screen">
      <ShaderBackground theme="deep" speed={0.15} />
      <div className="relative z-10 mx-auto max-w-7xl px-4 py-8">
        <div className="admin-print-hide mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
                Tillbaka
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Admin Dashboard</h1>
              <p className="text-muted-foreground">{email || "Admin"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrintCurrentTab}
              className="gap-2 border-border text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Printer className="h-4 w-4" />
              Skriv ut {ADMIN_TAB_LABELS[activeTab]}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Logga ut
            </Button>
          </div>
        </div>

        {message && (
          <div className="bg-primary/10 border-primary/30 mb-4 rounded border p-4">
            <p className="text-primary text-sm">{message}</p>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AdminTab)} className="w-full gap-0">
        <TabsList className="admin-print-hide mb-6 flex h-auto w-auto gap-2 bg-transparent p-0">
          <TabsTrigger
            value="analytics"
            className="gap-2 rounded-md border border-transparent px-3 py-1.5 text-sm shadow-none transition-all data-[state=active]:border-transparent data-[state=active]:bg-primary data-[state=active]:text-foreground data-[state=active]:hover:bg-primary/90 data-[state=inactive]:border-border data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted data-[state=inactive]:hover:text-foreground"
          >
            <TrendingUp className="h-4 w-4" />
            Statistik
          </TabsTrigger>
          <TabsTrigger
            value="database"
            className="gap-2 rounded-md border border-transparent px-3 py-1.5 text-sm shadow-none transition-all data-[state=active]:border-transparent data-[state=active]:bg-primary data-[state=active]:text-foreground data-[state=active]:hover:bg-primary/90 data-[state=inactive]:border-border data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted data-[state=inactive]:hover:text-foreground"
          >
            <Database className="h-4 w-4" />
            Databaser
          </TabsTrigger>
          <TabsTrigger
            value="environment"
            className="gap-2 rounded-md border border-transparent px-3 py-1.5 text-sm shadow-none transition-all data-[state=active]:border-transparent data-[state=active]:bg-primary data-[state=active]:text-foreground data-[state=active]:hover:bg-primary/90 data-[state=inactive]:border-border data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted data-[state=inactive]:hover:text-foreground"
          >
            <Key className="h-4 w-4" />
            Miljö
          </TabsTrigger>
          <TabsTrigger
            value="frontlogs"
            className="gap-2 rounded-md border border-transparent px-3 py-1.5 text-sm shadow-none transition-all data-[state=active]:border-transparent data-[state=active]:bg-primary data-[state=active]:text-foreground data-[state=active]:hover:bg-primary/90 data-[state=inactive]:border-border data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted data-[state=inactive]:hover:text-foreground"
          >
            <FileText className="h-4 w-4" />
            Frontloggar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="analytics" className="admin-print-panel" data-admin-tab="analytics">
          <AdminAnalyticsTab
            days={days}
            onDaysChange={setDays}
            isLoading={isLoading}
            stats={stats}
            onRefresh={fetchStats}
          />
        </TabsContent>

        <TabsContent value="database" className="admin-print-panel" data-admin-tab="database">
          <AdminDatabaseTab
            dbStats={dbStats}
            templateSyncConfigured={Boolean(templateSyncStatus?.configured)}
            actionLoading={actionLoading}
            confirmAction={confirmAction}
            onClearTable={handleClearTable}
            onFlushRedis={handleFlushRedis}
            onResetAll={handleResetAll}
            onClearUploads={handleClearUploads}
            setActionLoading={setActionLoading}
            setConfirmAction={setConfirmAction}
            setMessage={setMessage}
            refreshDbStats={fetchDbStats}
            refreshStats={fetchStats}
          />
        </TabsContent>

        <TabsContent value="environment" className="admin-print-panel" data-admin-tab="environment">
          <AdminEnvironmentTab
            teamStatusLoading={teamStatusLoading}
            teamStatus={teamStatus}
            envLoading={envLoading}
            envError={envError}
            envStatus={envStatus}
            integrationStatus={integrationStatus}
            vercelProjects={vercelProjects}
            vercelProjectsLoading={vercelProjectsLoading}
            vercelProjectsError={vercelProjectsError}
            selectedVercelProjectId={selectedVercelProjectId}
            setSelectedVercelProjectId={setSelectedVercelProjectId}
            vercelEnvVars={vercelEnvVars}
            vercelEnvLoading={vercelEnvLoading}
            confirmVercelProjectId={confirmVercelProjectId}
            actionLoading={actionLoading}
            onRefreshVercelProjects={fetchVercelProjects}
            onDeleteVercelProject={handleDeleteVercelProject}
          />
        </TabsContent>

        <TabsContent value="frontlogs" className="admin-print-panel" data-admin-tab="frontlogs">
          <AdminFrontlogsTab
            frontlogs={frontlogs}
            frontlogsLoading={frontlogsLoading}
            frontlogsError={frontlogsError}
            selectedSlug={selectedFrontlogSlug}
            onSlugChange={setSelectedFrontlogSlug}
            onRefresh={() => fetchFrontlogs()}
          />
        </TabsContent>
        </Tabs>
      </div>
      <style jsx global>{`
        @page {
          margin: 14mm;
        }

        @media print {
          body[data-admin-print-mode="current-tab"] {
            background: #fff !important;
          }

          body[data-admin-print-mode="current-tab"] .admin-print-hide,
          body[data-admin-print-mode="current-tab"] [data-sonner-toaster] {
            display: none !important;
          }

          body[data-admin-print-mode="current-tab"] .admin-print-root {
            min-height: auto !important;
            background: #fff !important;
            color: #000 !important;
          }

          body[data-admin-print-mode="current-tab"] .admin-print-root * {
            box-shadow: none !important;
          }

          body[data-admin-print-mode="current-tab"] .admin-print-panel {
            display: none !important;
          }

          body[data-admin-print-mode="current-tab"][data-admin-print-tab="analytics"] .admin-print-panel[data-admin-tab="analytics"],
          body[data-admin-print-mode="current-tab"][data-admin-print-tab="database"] .admin-print-panel[data-admin-tab="database"],
          body[data-admin-print-mode="current-tab"][data-admin-print-tab="environment"] .admin-print-panel[data-admin-tab="environment"],
          body[data-admin-print-mode="current-tab"][data-admin-print-tab="frontlogs"] .admin-print-panel[data-admin-tab="frontlogs"] {
            display: block !important;
          }

          body[data-admin-print-mode="current-tab"] pre {
            max-height: none !important;
            overflow: visible !important;
            white-space: pre-wrap !important;
            word-break: break-word !important;
          }
        }
      `}</style>
    </div>
  );
}
