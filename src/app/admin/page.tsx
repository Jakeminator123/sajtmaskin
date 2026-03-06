"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Database,
  FileText,
  Key,
  Loader2,
  Lock,
  Mail,
  TrendingUp,
} from "lucide-react";
import { ShaderBackground } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AdminAnalyticsTab } from "./components/AdminAnalyticsTab";
import { AdminDatabaseTab } from "./components/AdminDatabaseTab";
import { AdminEnvironmentTab } from "./components/AdminEnvironmentTab";
import { AdminPromptsTab } from "./components/AdminPromptsTab";
import type {
  AdminTab,
  AnalyticsStats,
  DatabaseStats,
  EnvStatusPayload,
  IntegrationStatus,
  PromptLog,
  TemplateSyncStatus,
  TeamStatus,
  VercelEnvVar,
  VercelProject,
} from "./components/types";

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
  const [promptLogs, setPromptLogs] = useState<PromptLog[]>([]);
  const [promptLogsLoading, setPromptLogsLoading] = useState(false);
  const [promptLogsError, setPromptLogsError] = useState<string | null>(null);
  const [teamStatus, setTeamStatus] = useState<TeamStatus | null>(null);
  const [teamStatusLoading, setTeamStatusLoading] = useState(false);
  const [templateSyncStatus, setTemplateSyncStatus] = useState<TemplateSyncStatus | null>(null);

  const fetchStats = async () => {
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
  };

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

  const fetchPromptLogs = async () => {
    setPromptLogsLoading(true);
    setPromptLogsError(null);
    try {
      const response = await fetch("/api/admin/prompt-logs?limit=20");
      const data = await response.json();
      if (data.success) {
        setPromptLogs(Array.isArray(data.logs) ? data.logs : []);
      } else {
        setPromptLogsError(data.error || "Kunde inte hämta promptloggar");
      }
    } catch {
      setPromptLogsError("Kunde inte hämta promptloggar");
    } finally {
      setPromptLogsLoading(false);
    }
  };

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
      (async () => {
        setIsLoading(true);
        try {
          const response = await fetch(`/api/analytics?days=${days}`);
          const data = await response.json();
          if (data.success) {
            setStats(data.stats);
          } else {
            setIsAuthenticated(false);
            localStorage.removeItem("admin-auth");
          }
        } catch {
          // Silent fail
        } finally {
          setIsLoading(false);
        }
      })();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (activeTab === "prompts" && isAuthenticated) {
      fetchPromptLogs();
    }
  }, [activeTab, isAuthenticated]);

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

      const statsResponse = await fetch(`/api/analytics?days=${days}`);
      const statsData = await statsResponse.json();
      if (statsData.success) {
        setStats(statsData.stats);
      }
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
          <div className="border border-gray-800 bg-black/70 p-8">
            <div className="mb-6 text-center">
              <div className="bg-brand-teal/10 mx-auto mb-4 flex h-12 w-12 items-center justify-center">
                <Lock className="text-brand-teal h-6 w-6" />
              </div>
              <h1 className="text-2xl font-bold text-white">Admin Panel</h1>
              <p className="mt-2 text-gray-500">Logga in med admin-kontot</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="relative">
                <Mail className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <Input
                  type="email"
                  placeholder="E-post"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 border-gray-700 bg-black/50 pl-10 text-white"
                  required
                />
              </div>
              <div className="relative">
                <Lock className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <Input
                  type="password"
                  placeholder="Lösenord"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 border-gray-700 bg-black/50 pl-10 text-white"
                  required
                />
              </div>

              {error && <p className="text-center text-sm text-red-400">{error}</p>}

              <Button
                type="submit"
                className="bg-brand-teal hover:bg-brand-teal/90 h-11 w-full"
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Logga in"}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <Link href="/" className="text-sm text-gray-500 hover:text-gray-300">
                ← Tillbaka till startsidan
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background min-h-screen">
      <ShaderBackground theme="deep" speed={0.15} />
      <div className="relative z-10 mx-auto max-w-7xl px-4 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 text-gray-400 hover:bg-gray-800 hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" />
                Tillbaka
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
              <p className="text-gray-500">{email || "Admin"}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="text-gray-400 hover:bg-gray-800 hover:text-white"
          >
            Logga ut
          </Button>
        </div>

        {message && (
          <div className="bg-brand-teal/10 border-brand-teal/30 mb-4 rounded border p-4">
            <p className="text-brand-teal text-sm">{message}</p>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AdminTab)} className="w-full gap-0">
        <TabsList className="mb-6 flex h-auto w-auto gap-2 bg-transparent p-0">
          <TabsTrigger
            value="analytics"
            className="gap-2 rounded-md border border-transparent px-3 py-1.5 text-sm shadow-none transition-all data-[state=active]:border-transparent data-[state=active]:bg-brand-teal data-[state=active]:text-white data-[state=active]:hover:bg-brand-teal/90 data-[state=inactive]:border-gray-700 data-[state=inactive]:bg-transparent data-[state=inactive]:text-gray-400 data-[state=inactive]:hover:bg-gray-800 data-[state=inactive]:hover:text-white"
          >
            <TrendingUp className="h-4 w-4" />
            Statistik
          </TabsTrigger>
          <TabsTrigger
            value="database"
            className="gap-2 rounded-md border border-transparent px-3 py-1.5 text-sm shadow-none transition-all data-[state=active]:border-transparent data-[state=active]:bg-brand-teal data-[state=active]:text-white data-[state=active]:hover:bg-brand-teal/90 data-[state=inactive]:border-gray-700 data-[state=inactive]:bg-transparent data-[state=inactive]:text-gray-400 data-[state=inactive]:hover:bg-gray-800 data-[state=inactive]:hover:text-white"
          >
            <Database className="h-4 w-4" />
            Databaser
          </TabsTrigger>
          <TabsTrigger
            value="environment"
            className="gap-2 rounded-md border border-transparent px-3 py-1.5 text-sm shadow-none transition-all data-[state=active]:border-transparent data-[state=active]:bg-brand-teal data-[state=active]:text-white data-[state=active]:hover:bg-brand-teal/90 data-[state=inactive]:border-gray-700 data-[state=inactive]:bg-transparent data-[state=inactive]:text-gray-400 data-[state=inactive]:hover:bg-gray-800 data-[state=inactive]:hover:text-white"
          >
            <Key className="h-4 w-4" />
            Miljö
          </TabsTrigger>
          <TabsTrigger
            value="prompts"
            className="gap-2 rounded-md border border-transparent px-3 py-1.5 text-sm shadow-none transition-all data-[state=active]:border-transparent data-[state=active]:bg-brand-teal data-[state=active]:text-white data-[state=active]:hover:bg-brand-teal/90 data-[state=inactive]:border-gray-700 data-[state=inactive]:bg-transparent data-[state=inactive]:text-gray-400 data-[state=inactive]:hover:bg-gray-800 data-[state=inactive]:hover:text-white"
          >
            <FileText className="h-4 w-4" />
            Promptloggar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="analytics">
          <AdminAnalyticsTab
            days={days}
            onDaysChange={setDays}
            isLoading={isLoading}
            stats={stats}
            onRefresh={fetchStats}
          />
        </TabsContent>

        <TabsContent value="database">
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

        <TabsContent value="environment">
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

        <TabsContent value="prompts">
          <AdminPromptsTab
            promptLogs={promptLogs}
            promptLogsLoading={promptLogsLoading}
            promptLogsError={promptLogsError}
            onRefresh={fetchPromptLogs}
          />
        </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
