"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShaderBackground } from "@/components/layout";
import {
  ArrowLeft,
  Users,
  FolderOpen,
  Sparkles,
  Eye,
  Lock,
  Loader2,
  TrendingUp,
  RefreshCw,
  Diamond,
  Mail,
  Database,
  Trash2,
  Download,
  Upload,
  AlertTriangle,
  HardDrive,
  Server,
  Key,
  FileText,
} from "lucide-react";

interface AnalyticsStats {
  totalPageViews: number;
  uniqueVisitors: number;
  totalUsers: number;
  totalProjects: number;
  totalGenerations: number;
  totalRefines: number;
  recentPageViews: { path: string; count: number }[];
  dailyViews: { date: string; views: number; unique: number }[];
  topReferrers: { referrer: string; count: number }[];
}

interface DatabaseStats {
  database: {
    users: number;
    projects: number;
    pageViews: number;
    transactions: number;
    guestUsage: number;
    companyProfiles: number;
    templateCache?: number;
    templateCacheExpired?: number;
  };
  redis: {
    connected: boolean;
    memoryUsed?: string;
    totalKeys?: number;
    uptime?: number;
  } | null;
  dbFileSize: string;
  uploads?: {
    fileCount: number;
    totalSize: string;
    files: { name: string; size: string }[];
  };
  dataDir?: string;
}

interface EnvKeyStatus {
  key: string;
  required: boolean;
  present: boolean;
  notes?: string;
}

interface EnvStatusPayload {
  runtime: {
    nodeEnv: string | null;
    vercelEnv: string | null;
    vercel: string | null;
    appUrl: string | null;
    baseUrl: string;
    vercelUrl: string | null;
  };
  vercel: {
    teamId: string | null;
    projectId: string | null;
  };
  features: Record<string, boolean>;
  keys: EnvKeyStatus[];
}

interface IntegrationItem {
  id: string;
  label: string;
  enabled: boolean;
  required: boolean;
  requiredEnv: string[];
  affects: string;
  notes?: string;
}

interface IntegrationStatus {
  updatedAt: string;
  items: IntegrationItem[];
}

interface VercelProject {
  id: string;
  name: string;
  accountId: string;
  updatedAt: number;
}

interface VercelEnvVar {
  id: string | null;
  key: string;
  target: string[];
  type?: string | null;
}

interface PromptLog {
  id: string;
  event: string;
  userId: string | null;
  sessionId: string | null;
  appProjectId: string | null;
  v0ProjectId: string | null;
  chatId: string | null;
  promptOriginal: string | null;
  promptFormatted: string | null;
  systemPrompt: string | null;
  promptAssistModel: string | null;
  promptAssistDeep: boolean | null;
  promptAssistMode: string | null;
  buildIntent: string | null;
  buildMethod: string | null;
  modelTier: string | null;
  imageGenerations: boolean | null;
  thinking: boolean | null;
  attachmentsCount: number | null;
  meta: Record<string, unknown> | null;
  createdAt: string | null;
}

export default function AdminPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [dbStats, setDbStats] = useState<DatabaseStats | null>(null);
  const [days, setDays] = useState(30);
  const [activeTab, setActiveTab] = useState<
    "analytics" | "database" | "environment" | "prompts"
  >("analytics");
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
  const [teamStatus, setTeamStatus] = useState<{
    configured: boolean;
    configuredTeamId: string | null;
    configuredTeam: {
      id: string;
      slug: string;
      name: string;
      plan: string;
      isFree: boolean;
      isPro: boolean;
      isEnterprise: boolean;
    } | null;
    teams: Array<{
      id: string;
      slug: string;
      name: string;
      plan: string;
      isFree: boolean;
      isPro: boolean;
      isEnterprise: boolean;
    }>;
    warnings: string[];
  } | null>(null);
  const [teamStatusLoading, setTeamStatusLoading] = useState(false);

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

  // Check if already authenticated on mount
  useEffect(() => {
    const stored = localStorage.getItem("admin-auth");
    if (stored === "true") {
      setIsAuthenticated(true);
      // Fetch stats
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

  // Fetch db stats when switching to database tab
  useEffect(() => {
    if (activeTab === "database" && isAuthenticated) {
      fetchDbStats();
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

      const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL || "test@gmail.com";
      if (data.user?.email !== adminEmail) {
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

  // Login form
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

  // Admin dashboard
  return (
    <div className="bg-background min-h-screen">
      <ShaderBackground theme="deep" speed={0.15} />
      <div className="relative z-10 mx-auto max-w-7xl px-4 py-8">
        {/* Header */}
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

        {/* Message display */}
        {message && (
          <div className="bg-brand-teal/10 border-brand-teal/30 mb-4 rounded border p-4">
            <p className="text-brand-teal text-sm">{message}</p>
          </div>
        )}

        {/* Tabs */}
        <div className="mb-6 flex gap-2">
          <Button
            variant={activeTab === "analytics" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("analytics")}
            className={`gap-2 ${
              activeTab === "analytics"
                ? "bg-brand-teal hover:bg-brand-teal/90"
                : "border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-white"
            }`}
          >
            <TrendingUp className="h-4 w-4" />
            Statistik
          </Button>
          <Button
            variant={activeTab === "database" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("database")}
            className={`gap-2 ${
              activeTab === "database"
                ? "bg-brand-teal hover:bg-brand-teal/90"
                : "border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-white"
            }`}
          >
            <Database className="h-4 w-4" />
            Databaser
          </Button>
          <Button
            variant={activeTab === "environment" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("environment")}
            className={`gap-2 ${
              activeTab === "environment"
                ? "bg-brand-teal hover:bg-brand-teal/90"
                : "border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-white"
            }`}
          >
            <Key className="h-4 w-4" />
            Miljö
          </Button>
          <Button
            variant={activeTab === "prompts" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("prompts")}
            className={`gap-2 ${
              activeTab === "prompts"
                ? "bg-brand-teal hover:bg-brand-teal/90"
                : "border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-white"
            }`}
          >
            <FileText className="h-4 w-4" />
            Promptloggar
          </Button>
        </div>

        {/* Analytics Tab */}
        {activeTab === "analytics" && (
          <>
            {/* Controls */}
            <div className="mb-6 flex items-center gap-3">
              <select
                value={days}
                onChange={(e) => setDays(parseInt(e.target.value))}
                className="border border-gray-700 bg-black/50 px-3 py-2 text-sm text-white"
              >
                <option value={7}>7 dagar</option>
                <option value={30}>30 dagar</option>
                <option value={90}>90 dagar</option>
                <option value={365}>1 år</option>
              </select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchStats()}
                disabled={isLoading}
                className="gap-2 border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-white"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                Uppdatera
              </Button>
            </div>

            {stats && (
              <>
                {/* Stats cards */}
                <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
                  <StatCard
                    icon={Eye}
                    label="Sidvisningar"
                    value={stats.totalPageViews}
                    color="blue"
                  />
                  <StatCard
                    icon={Users}
                    label="Unika besökare"
                    value={stats.uniqueVisitors}
                    color="green"
                  />
                  <StatCard
                    icon={Users}
                    label="Registrerade"
                    value={stats.totalUsers}
                    color="purple"
                  />
                  <StatCard
                    icon={FolderOpen}
                    label="Projekt"
                    value={stats.totalProjects}
                    color="amber"
                  />
                  <StatCard
                    icon={Sparkles}
                    label="Generationer"
                    value={stats.totalGenerations}
                    color="pink"
                  />
                  <StatCard
                    icon={Diamond}
                    label="Förfiningar"
                    value={stats.totalRefines}
                    color="cyan"
                  />
                </div>

                {/* Charts */}
                <div className="grid gap-6 lg:grid-cols-2">
                  {/* Daily views chart */}
                  <div className="border border-gray-800 bg-black/50 p-6">
                    <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
                      <TrendingUp className="text-brand-teal h-5 w-5" />
                      Dagliga besök
                    </h2>
                    <div className="flex h-64 items-end gap-1">
                      {stats.dailyViews.length > 0 ? (
                        stats.dailyViews.slice(-14).map((day, i) => {
                          const maxViews = Math.max(...stats.dailyViews.map((d) => d.views));
                          const height = maxViews > 0 ? (day.views / maxViews) * 100 : 0;
                          return (
                            <div key={i} className="flex flex-1 flex-col items-center gap-1">
                              <div
                                className="bg-brand-teal/20 group relative w-full"
                                style={{
                                  height: `${height}%`,
                                  minHeight: "4px",
                                }}
                              >
                                <div
                                  className="bg-brand-teal absolute bottom-0 w-full"
                                  style={{
                                    height: `${maxViews > 0 ? (day.unique / maxViews) * 100 : 0}%`,
                                  }}
                                />
                                <div className="absolute -top-8 left-1/2 z-10 -translate-x-1/2 bg-gray-900 px-2 py-1 text-xs whitespace-nowrap text-white opacity-0 group-hover:opacity-100">
                                  {day.views} visningar, {day.unique} unika
                                </div>
                              </div>
                              <span className="-rotate-45 text-[10px] text-gray-500">
                                {day.date.slice(5)}
                              </span>
                            </div>
                          );
                        })
                      ) : (
                        <div className="flex flex-1 items-center justify-center text-gray-500">
                          Ingen data än
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Top pages */}
                  <div className="border border-gray-800 bg-black/50 p-6">
                    <h2 className="mb-4 text-lg font-semibold text-white">Populära sidor</h2>
                    <div className="space-y-3">
                      {stats.recentPageViews.length > 0 ? (
                        stats.recentPageViews.map((page, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between border-b border-gray-800 py-2 last:border-0"
                          >
                            <span className="max-w-[200px] truncate text-gray-300">
                              {page.path}
                            </span>
                            <span className="font-mono text-sm text-gray-500">{page.count}</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-gray-500">Ingen data än</p>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* Database Tab */}
        {activeTab === "database" && (
          <div className="space-y-6">
            {/* Database Section */}
            <div className="border border-gray-800 bg-black/50 p-6">
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-brand-teal/10 flex h-10 w-10 items-center justify-center">
                    <HardDrive className="text-brand-teal h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">Supabase Database</h2>
                    <p className="text-sm text-gray-500">Storlek: {dbStats?.dbFileSize || "..."}</p>
                  </div>
                </div>
              </div>

              <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
                {dbStats?.database && (
                  <>
                    <DbStatCard label="Användare" value={dbStats.database.users} />
                    <DbStatCard label="Projekt" value={dbStats.database.projects} />
                    <DbStatCard label="Sidvisningar" value={dbStats.database.pageViews} />
                    <DbStatCard label="Transaktioner" value={dbStats.database.transactions} />
                    <DbStatCard label="Gäst-användning" value={dbStats.database.guestUsage} />
                    <DbStatCard label="Företagsprofiler" value={dbStats.database.companyProfiles} />
                  </>
                )}
              </div>

              <div className="border-t border-gray-800 pt-4">
                <h3 className="mb-3 text-sm font-medium text-gray-400">Rensa tabeller</h3>
                <div className="flex flex-wrap gap-2">
                  {[
                    "page_views",
                    "guest_usage",
                    "transactions",
                    "projects",
                    "company_profiles",
                    "users",
                  ].map((table) => (
                    <Button
                      key={table}
                      variant="outline"
                      size="sm"
                      onClick={() => handleClearTable(table)}
                      disabled={actionLoading === table}
                      className={`gap-2 ${
                        confirmAction === table
                          ? "border-red-500 text-red-400"
                          : "border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-white"
                      }`}
                    >
                      {actionLoading === table ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : confirmAction === table ? (
                        <AlertTriangle className="h-3 w-3" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                      {confirmAction === table ? "Bekräfta?" : table}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            {/* Redis Section */}
            <div className="border border-gray-800 bg-black/50 p-6">
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center ${
                      dbStats?.redis?.connected ? "bg-brand-teal/10" : "bg-red-500/10"
                    }`}
                  >
                    <Server
                      className={`h-5 w-5 ${
                        dbStats?.redis?.connected ? "text-brand-teal" : "text-red-400"
                      }`}
                    />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">Redis Cache</h2>
                    <p className="text-sm text-gray-500">
                      {dbStats?.redis?.connected ? (
                        <>
                          Ansluten • {dbStats.redis.memoryUsed} använt • {dbStats.redis.totalKeys}{" "}
                          nycklar
                        </>
                      ) : (
                        "Ej ansluten"
                      )}
                    </p>
                  </div>
                </div>
                {dbStats?.redis?.connected && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleFlushRedis}
                    disabled={actionLoading === "redis"}
                    className={`gap-2 ${
                      confirmAction === "redis"
                        ? "border-red-500 text-red-400"
                        : "border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-white"
                    }`}
                  >
                    {actionLoading === "redis" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : confirmAction === "redis" ? (
                      <AlertTriangle className="h-4 w-4" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    {confirmAction === "redis" ? "Bekräfta?" : "Rensa cache"}
                  </Button>
                )}
              </div>

              {!dbStats?.redis?.connected && (
                <div className="bg-brand-amber/10 border-brand-amber/30 text-brand-amber border p-4 text-sm">
                  Redis är inte konfigurerat. Lägg till REDIS_URL eller KV_URL i .env.local för att
                  aktivera caching.
                </div>
              )}
            </div>

            {/* Template Cache Section */}
            <div className="border border-gray-800 bg-black/50 p-6">
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-brand-teal/10 flex h-10 w-10 items-center justify-center">
                    <Sparkles className="text-brand-teal h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">Template Cache</h2>
                    <p className="text-sm text-gray-500">
                      {dbStats?.database?.templateCache || 0} templates cachade
                      {dbStats?.database?.templateCacheExpired ? (
                        <span className="text-brand-amber">
                          {" "}
                          • {dbStats.database.templateCacheExpired} utgångna
                        </span>
                      ) : null}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      setActionLoading("export-templates");
                      try {
                        const res = await fetch("/api/admin/database", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "export-templates" }),
                        });
                        const data = await res.json();
                        if (data.success) {
                          // Download as JSON file
                          const blob = new Blob([JSON.stringify(data, null, 2)], {
                            type: "application/json",
                          });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `templates-backup-${new Date()
                            .toISOString()
                            .slice(0, 10)}.json`;
                          a.click();
                          URL.revokeObjectURL(url);
                          setMessage(`Exporterade ${data.count} templates`);
                          setTimeout(() => setMessage(null), 5000);
                        }
                      } catch {
                        setMessage("Export misslyckades");
                        setTimeout(() => setMessage(null), 5000);
                      }
                      setActionLoading(null);
                    }}
                    disabled={actionLoading === "export-templates"}
                    className="gap-2 border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-white"
                  >
                    {actionLoading === "export-templates" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    Exportera
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = ".json";
                      input.onchange = async (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (!file) return;
                        setActionLoading("import-templates");
                        try {
                          const text = await file.text();
                          const data = JSON.parse(text);
                          const res = await fetch("/api/admin/database", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              action: "import-templates",
                              templates: data.templates || data,
                            }),
                          });
                          const result = await res.json();
                          setMessage(result.message || "Import klar");
                          setTimeout(() => setMessage(null), 5000);
                          fetchDbStats();
                        } catch {
                          setMessage("Import misslyckades");
                          setTimeout(() => setMessage(null), 5000);
                        }
                        setActionLoading(null);
                      };
                      input.click();
                    }}
                    disabled={actionLoading === "import-templates"}
                    className="gap-2 border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-white"
                  >
                    {actionLoading === "import-templates" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    Importera
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      setActionLoading("extend-cache");
                      try {
                        const res = await fetch("/api/admin/database", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            action: "extend-template-cache",
                          }),
                        });
                        const data = await res.json();
                        setMessage(data.message || "Cache förlängd");
                        setTimeout(() => setMessage(null), 5000);
                        fetchDbStats();
                      } catch {
                        setMessage("Kunde inte förlänga cache");
                        setTimeout(() => setMessage(null), 5000);
                      }
                      setActionLoading(null);
                    }}
                    disabled={actionLoading === "extend-cache"}
                    className="border-brand-teal/50 text-brand-teal hover:bg-brand-teal/20 gap-2 hover:text-white"
                  >
                    {actionLoading === "extend-cache" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    Förläng 30 dagar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      if (confirmAction !== "clear-templates") {
                        setConfirmAction("clear-templates");
                        return;
                      }
                      setActionLoading("clear-templates");
                      try {
                        const res = await fetch("/api/admin/database", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            action: "clear-template-cache",
                          }),
                        });
                        const data = await res.json();
                        setMessage(data.message || "Cache rensad");
                        setTimeout(() => setMessage(null), 5000);
                        fetchDbStats();
                      } catch {
                        setMessage("Kunde inte rensa cache");
                        setTimeout(() => setMessage(null), 5000);
                      }
                      setActionLoading(null);
                      setConfirmAction(null);
                    }}
                    disabled={actionLoading === "clear-templates"}
                    className={`gap-2 ${
                      confirmAction === "clear-templates"
                        ? "border-red-500 text-red-400"
                        : "border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-white"
                    }`}
                  >
                    {actionLoading === "clear-templates" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : confirmAction === "clear-templates" ? (
                      <AlertTriangle className="h-4 w-4" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    {confirmAction === "clear-templates" ? "Bekräfta?" : "Rensa"}
                  </Button>
                </div>
              </div>
              <p className="text-sm text-gray-500">
                Spara templates lokalt för att undvika API-kostnader. Exportera → spara filen →
                importera på andra enheter.
              </p>
            </div>

            {/* Persistent Disk / Uploads Section */}
            <div className="border border-gray-800 bg-black/50 p-6">
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-brand-blue/10 flex h-10 w-10 items-center justify-center">
                    <HardDrive className="text-brand-blue h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">Persistent Disk</h2>
                    <p className="text-sm text-gray-500">
                      {dbStats?.dataDir || "Ej konfigurerad"} • {dbStats?.uploads?.fileCount || 0}{" "}
                      filer • {dbStats?.uploads?.totalSize || "0 B"}
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearUploads}
                  disabled={actionLoading === "uploads" || !dbStats?.uploads?.fileCount}
                  className={`gap-2 ${
                    confirmAction === "uploads"
                      ? "border-red-500 text-red-400"
                      : "border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-white"
                  }`}
                >
                  {actionLoading === "uploads" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : confirmAction === "uploads" ? (
                    <AlertTriangle className="h-4 w-4" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  {confirmAction === "uploads" ? "Bekräfta?" : "Rensa uploads"}
                </Button>
              </div>

              {/* Show uploaded files */}
              {dbStats?.uploads?.files && dbStats.uploads.files.length > 0 && (
                <div className="border-t border-gray-800 pt-4">
                  <h3 className="mb-3 text-sm font-medium text-gray-400">
                    Uppladdade filer ({dbStats.uploads.fileCount} st)
                  </h3>
                  <div className="max-h-40 space-y-1 overflow-y-auto text-sm">
                    {dbStats.uploads.files.map((file, i) => (
                      <div key={i} className="flex items-center justify-between py-1 text-gray-500">
                        <span className="max-w-[250px] truncate">{file.name}</span>
                        <span className="font-mono text-xs">{file.size}</span>
                      </div>
                    ))}
                    {dbStats.uploads.fileCount > 20 && (
                      <p className="pt-2 text-xs text-gray-600">
                        ...och {dbStats.uploads.fileCount - 20} filer till
                      </p>
                    )}
                  </div>
                </div>
              )}

              {dbStats?.dataDir && !dbStats.dataDir.includes("/var/data") && (
                <div className="bg-brand-amber/10 border-brand-amber/30 text-brand-amber mt-4 border p-4 text-sm">
                  ⚠️ Persistent disk är inte konfigurerad. Lägg till DATA_DIR=/var/data i
                  miljövariabler på Render för att bevara data mellan deploys.
                </div>
              )}
            </div>

            {/* Danger Zone */}
            <div className="border border-red-500/30 bg-black/50 p-6">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-red-400">
                <AlertTriangle className="h-5 w-5" />
                Farozon
              </h2>
              <p className="mb-4 text-sm text-gray-400">
                Dessa åtgärder raderar data permanent. Kan inte ångras!
              </p>

              <div className="space-y-4">
                {/* Individual cleanup buttons */}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      if (confirmAction !== "v0-cleanup") {
                        setConfirmAction("v0-cleanup");
                        return;
                      }
                      setActionLoading("v0-cleanup");
                      try {
                        const res = await fetch("/api/admin/database", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            action: "cleanup-v0-projects",
                          }),
                        });
                        const data = await res.json();
                        setMessage(data.message || `Raderade ${data.deleted || 0} v0-projekt`);
                        setTimeout(() => setMessage(null), 5000);
                      } catch {
                        setMessage("Misslyckades");
                        setTimeout(() => setMessage(null), 5000);
                      }
                      setActionLoading(null);
                      setConfirmAction(null);
                    }}
                    disabled={actionLoading === "v0-cleanup"}
                    className={`gap-2 ${
                      confirmAction === "v0-cleanup"
                        ? "border-brand-warm text-brand-warm"
                        : "border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-white"
                    }`}
                  >
                    {actionLoading === "v0-cleanup" ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : confirmAction === "v0-cleanup" ? (
                      <AlertTriangle className="h-3 w-3" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                    {confirmAction === "v0-cleanup" ? "Bekräfta?" : "Rensa v0-projekt"}
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      if (confirmAction !== "vercel-cleanup") {
                        setConfirmAction("vercel-cleanup");
                        return;
                      }
                      setActionLoading("vercel-cleanup");
                      try {
                        const res = await fetch("/api/admin/database", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            action: "cleanup-vercel-projects",
                          }),
                        });
                        const data = await res.json();
                        setMessage(data.message || `Raderade ${data.deleted || 0} Vercel-projekt`);
                        setTimeout(() => setMessage(null), 5000);
                      } catch {
                        setMessage("Misslyckades");
                        setTimeout(() => setMessage(null), 5000);
                      }
                      setActionLoading(null);
                      setConfirmAction(null);
                    }}
                    disabled={actionLoading === "vercel-cleanup"}
                    className={`gap-2 ${
                      confirmAction === "vercel-cleanup"
                        ? "border-brand-blue text-brand-blue"
                        : "border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-white"
                    }`}
                  >
                    {actionLoading === "vercel-cleanup" ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : confirmAction === "vercel-cleanup" ? (
                      <AlertTriangle className="h-3 w-3" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                    {confirmAction === "vercel-cleanup" ? "Bekräfta?" : "Rensa Vercel-projekt"}
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResetAll}
                    disabled={actionLoading === "reset-all"}
                    className={`gap-2 ${
                      confirmAction === "reset-all"
                        ? "border-brand-blue text-brand-blue"
                        : "border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-white"
                    }`}
                  >
                    {actionLoading === "reset-all" ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : confirmAction === "reset-all" ? (
                      <AlertTriangle className="h-3 w-3" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                    {confirmAction === "reset-all" ? "Bekräfta?" : "Rensa databas + Redis"}
                  </Button>
                </div>

                {/* MEGA CLEANUP button */}
                <div className="border-t border-red-500/30 pt-4">
                  <p className="mb-3 flex items-center gap-2 text-sm text-red-400">
                    <AlertTriangle className="h-4 w-4" />
                    MEGA CLEANUP - Raderar ALLT på alla 4 ställen
                  </p>
                  <Button
                    variant="outline"
                    onClick={async () => {
                      if (confirmAction !== "mega-cleanup") {
                        setConfirmAction("mega-cleanup");
                        return;
                      }
                      setActionLoading("mega-cleanup");
                      try {
                        const res = await fetch("/api/admin/database", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "mega-cleanup" }),
                        });
                        const data = await res.json();
                        setMessage(data.message || "MEGA CLEANUP klar!");
                        setTimeout(() => setMessage(null), 10000);
                        await fetchDbStats();
                        await fetchStats();
                      } catch {
                        setMessage("MEGA CLEANUP misslyckades");
                        setTimeout(() => setMessage(null), 5000);
                      }
                      setActionLoading(null);
                      setConfirmAction(null);
                    }}
                    disabled={actionLoading === "mega-cleanup"}
                    className={`gap-2 ${
                      confirmAction === "mega-cleanup"
                        ? "border-red-500 bg-red-500/20 text-red-400"
                        : "border-red-500/50 text-red-400 hover:bg-red-500/10"
                    }`}
                  >
                    {actionLoading === "mega-cleanup" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : confirmAction === "mega-cleanup" ? (
                      <AlertTriangle className="h-4 w-4" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    {confirmAction === "mega-cleanup"
                      ? "🔥 KLICKA IGEN FÖR ATT RADERA ALLT 🔥"
                      : "🔥 MEGA CLEANUP (v0 + Vercel + Databas + Redis)"}
                  </Button>
                  <p className="mt-2 text-xs text-gray-600">
                    Raderar: v0-projekt, Vercel-projekt, alla databastabeller, Redis-cache,
                    uppladdade filer
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Environment Tab */}
        {activeTab === "environment" && (
          <div className="space-y-6">
            {/* Team Status Warnings */}
            {teamStatusLoading && (
              <div className="flex items-center gap-2 border border-gray-800 bg-black/50 p-4 text-sm text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Hämtar Vercel team-status...
              </div>
            )}

            {teamStatus && teamStatus.warnings.length > 0 && (
              <div className="space-y-2">
                {teamStatus.warnings.map((warning, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 border border-amber-500/50 bg-amber-500/10 p-4 text-sm"
                  >
                    <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" />
                    <div className="text-amber-200">{warning}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Team Plan Overview */}
            {teamStatus && teamStatus.teams.length > 0 && (
              <div className="border border-gray-800 bg-black/50 p-6">
                <div className="mb-4 flex items-center gap-3">
                  <div className="bg-brand-teal/10 flex h-10 w-10 items-center justify-center">
                    <Users className="text-brand-teal h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">Vercel Teams</h2>
                    <p className="text-sm text-gray-500">Team‑planer</p>
                  </div>
                </div>

                <div className="grid gap-2 md:grid-cols-2">
                  {teamStatus.teams.map((team) => {
                    const isConfigured = team.id === teamStatus.configuredTeamId;
                    return (
                      <div
                        key={team.id}
                        className={`border p-3 text-sm ${
                          isConfigured
                            ? "border-brand-teal/50 bg-brand-teal/5 ring-1 ring-brand-teal/30"
                            : "border-gray-800 bg-black/30"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-gray-200">{team.name}</span>
                              {isConfigured && (
                                <span className="text-xs text-brand-teal">(konfigurerat)</span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500">{team.slug}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`rounded px-2 py-1 text-xs font-medium ${
                                team.isFree
                                  ? "bg-amber-500/20 text-amber-400"
                                  : team.isPro
                                    ? "bg-green-500/20 text-green-400"
                                    : team.isEnterprise
                                      ? "bg-purple-500/20 text-purple-400"
                                      : "bg-gray-500/20 text-gray-400"
                              }`}
                            >
                              {team.plan === "hobby"
                                ? "Free (Hobby)"
                                : team.plan.charAt(0).toUpperCase() + team.plan.slice(1)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Runtime Section */}
            <div className="border border-gray-800 bg-black/50 p-6">
              <div className="mb-6 flex items-center gap-3">
                <div className="bg-brand-teal/10 flex h-10 w-10 items-center justify-center">
                  <Server className="text-brand-teal h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Runtime</h2>
                  <p className="text-sm text-gray-500">Aktiv miljö och bas‑URL</p>
                </div>
              </div>

              {envLoading && <p className="text-sm text-gray-500">Laddar miljöstatus...</p>}
              {envError && <p className="text-sm text-red-400">{envError}</p>}

              {envStatus && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="border border-gray-800 bg-black/30 p-4">
                    <div className="text-xs text-gray-500">NODE_ENV</div>
                    <div className="text-sm text-white">{envStatus.runtime.nodeEnv || "okänd"}</div>
                  </div>
                  <div className="border border-gray-800 bg-black/30 p-4">
                    <div className="text-xs text-gray-500">VERCEL_ENV</div>
                    <div className="text-sm text-white">{envStatus.runtime.vercelEnv || "lokal"}</div>
                  </div>
                  <div className="border border-gray-800 bg-black/30 p-4">
                    <div className="text-xs text-gray-500">Base URL</div>
                    <div className="text-sm text-white">{envStatus.runtime.baseUrl}</div>
                  </div>
                  <div className="border border-gray-800 bg-black/30 p-4">
                    <div className="text-xs text-gray-500">Vercel URL</div>
                    <div className="text-sm text-white">
                      {envStatus.runtime.vercelUrl || "ej tillgänglig"}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Integrations Section */}
            <div className="border border-gray-800 bg-black/50 p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="bg-brand-teal/10 flex h-10 w-10 items-center justify-center">
                  <Sparkles className="text-brand-teal h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Integrationer</h2>
                  <p className="text-sm text-gray-500">Status per integration</p>
                </div>
              </div>

              {!integrationStatus ? (
                <p className="text-sm text-gray-500">Laddar integrationsstatus...</p>
              ) : (
                <div className="grid gap-2 md:grid-cols-2">
                  {integrationStatus.items.map((item) => (
                    <div key={item.id} className="border border-gray-800 bg-black/30 p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-200">{item.label}</span>
                        <span className={item.enabled ? "text-green-400" : "text-red-400"}>
                          {item.enabled ? "OK" : item.required ? "Saknas" : "Valfri"}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">{item.affects}</div>
                      {item.notes && <div className="text-xs text-gray-600">Info: {item.notes}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Env Keys Section */}
            <div className="border border-gray-800 bg-black/50 p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="bg-brand-teal/10 flex h-10 w-10 items-center justify-center">
                  <Key className="text-brand-teal h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Env‑nycklar (runtime)</h2>
                  <p className="text-sm text-gray-500">Visar endast om nyckeln finns</p>
                </div>
              </div>

              {!envStatus ? (
                <p className="text-sm text-gray-500">Laddar env‑status...</p>
              ) : (
                <div className="grid gap-2 md:grid-cols-2">
                  {envStatus.keys.map((item) => (
                    <div key={item.key} className="border border-gray-800 bg-black/30 p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs text-gray-300">{item.key}</span>
                        <span className={item.present ? "text-green-400" : "text-red-400"}>
                          {item.present ? "Satt" : item.required ? "Saknas" : "Valfri"}
                        </span>
                      </div>
                      {item.notes && <div className="text-xs text-gray-500">{item.notes}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Vercel Projects Section */}
            <div className="border border-gray-800 bg-black/50 p-6">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-brand-blue/10 flex h-10 w-10 items-center justify-center">
                    <FolderOpen className="text-brand-blue h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">Vercel‑projekt</h2>
                    <p className="text-sm text-gray-500">Lista och radera projekt</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchVercelProjects}
                  disabled={vercelProjectsLoading}
                  className="gap-2 border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-white"
                >
                  <RefreshCw className={`h-4 w-4 ${vercelProjectsLoading ? "animate-spin" : ""}`} />
                  Uppdatera
                </Button>
              </div>

              {vercelProjectsError && (
                <p className="text-sm text-red-400">{vercelProjectsError}</p>
              )}

              {vercelProjectsLoading && (
                <p className="text-sm text-gray-500">Hämtar Vercel‑projekt...</p>
              )}

              {!vercelProjectsLoading && vercelProjects.length === 0 && (
                <p className="text-sm text-gray-500">Inga projekt hittades.</p>
              )}

              {vercelProjects.length > 0 && (
                <div className="space-y-2">
                  {vercelProjects.map((project) => {
                    const isConfirm = confirmVercelProjectId === project.id;
                    const isLoading = actionLoading === `vercel:${project.id}`;
                    const isSelected = selectedVercelProjectId === project.id;
                    return (
                      <div
                        key={project.id}
                        className={`border border-gray-800 bg-black/30 p-3 text-sm ${
                          isSelected ? "ring-1 ring-brand-teal/60" : ""
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="text-gray-200">{project.name}</div>
                            <div className="text-xs text-gray-500">ID: {project.id}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedVercelProjectId(project.id)}
                              className="border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-white"
                            >
                              Visa env
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteVercelProject(project)}
                              disabled={isLoading}
                              className={`gap-2 ${
                                isConfirm
                                  ? "border-red-500 text-red-400"
                                  : "border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-white"
                              }`}
                            >
                              {isLoading ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : isConfirm ? (
                                <AlertTriangle className="h-3 w-3" />
                              ) : (
                                <Trash2 className="h-3 w-3" />
                              )}
                              {isConfirm ? "Bekräfta?" : "Radera"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Vercel Env Section */}
            <div className="border border-gray-800 bg-black/50 p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="bg-brand-blue/10 flex h-10 w-10 items-center justify-center">
                  <Database className="text-brand-blue h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Vercel env‑variabler</h2>
                  <p className="text-sm text-gray-500">Visar nycklar + targets</p>
                </div>
              </div>

              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="text-xs text-gray-500">Projekt:</span>
                <select
                  value={selectedVercelProjectId ?? ""}
                  onChange={(e) => setSelectedVercelProjectId(e.target.value || null)}
                  className="border border-gray-700 bg-black/50 px-3 py-2 text-xs text-white"
                >
                  <option value="">Välj projekt</option>
                  {vercelProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>

              {vercelEnvLoading && (
                <p className="text-sm text-gray-500">Hämtar env‑variabler...</p>
              )}

              {!vercelEnvLoading && selectedVercelProjectId && vercelEnvVars.length === 0 && (
                <p className="text-sm text-gray-500">Inga env‑variabler hittades.</p>
              )}

              {vercelEnvVars.length > 0 && (
                <div className="grid gap-2 md:grid-cols-2">
                  {vercelEnvVars.map((envVar) => (
                    <div key={envVar.id || envVar.key} className="border border-gray-800 bg-black/30 p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs text-gray-300">{envVar.key}</span>
                        <span className="text-xs text-gray-500">
                          {envVar.target.length > 0 ? envVar.target.join(", ") : "ingen target"}
                        </span>
                      </div>
                      {envVar.type && <div className="text-xs text-gray-600">Typ: {envVar.type}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Prompt Logs Tab */}
        {activeTab === "prompts" && (
          <div className="space-y-6">
            <div className="border border-gray-800 bg-black/50 p-6">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="bg-brand-teal/10 flex h-10 w-10 items-center justify-center">
                    <FileText className="text-brand-teal h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">Promptloggar</h2>
                    <p className="text-sm text-gray-500">
                      Senaste 20 körningar (val + genererad prompt)
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchPromptLogs()}
                  disabled={promptLogsLoading}
                  className="gap-2 border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-white"
                >
                  <RefreshCw className={`h-4 w-4 ${promptLogsLoading ? "animate-spin" : ""}`} />
                  Uppdatera
                </Button>
              </div>

              {promptLogsLoading && <p className="text-sm text-gray-500">Hämtar promptloggar...</p>}
              {promptLogsError && <p className="text-sm text-red-400">{promptLogsError}</p>}

              {!promptLogsLoading && !promptLogsError && promptLogs.length === 0 && (
                <p className="text-sm text-gray-500">Inga promptloggar hittades ännu.</p>
              )}

              {promptLogs.length > 0 && (
                <div className="space-y-4">
                  {promptLogs.map((log) => (
                    <div key={log.id} className="border border-gray-800 bg-black/30 p-4">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
                        <span>
                          {log.createdAt
                            ? new Date(log.createdAt).toLocaleString("sv-SE")
                            : "okänd tid"}
                        </span>
                        <span>• {log.event}</span>
                        {log.modelTier && <span>• Tier: {log.modelTier}</span>}
                        {log.buildIntent && <span>• Intent: {log.buildIntent}</span>}
                        {log.buildMethod && <span>• Metod: {log.buildMethod}</span>}
                        {typeof log.imageGenerations === "boolean" && (
                          <span>• Bilder: {log.imageGenerations ? "på" : "av"}</span>
                        )}
                        {typeof log.thinking === "boolean" && (
                          <span>• Thinking: {log.thinking ? "på" : "av"}</span>
                        )}
                        {log.promptAssistModel && (
                          <span>• Förbättra‑modell: {log.promptAssistModel}</span>
                        )}
                        {typeof log.promptAssistDeep === "boolean" && (
                          <span>• Deep: {log.promptAssistDeep ? "ja" : "nej"}</span>
                        )}
                      </div>

                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div>
                          <p className="text-xs text-gray-500">Prompt (original)</p>
                          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-gray-200">
                            {log.promptOriginal || "—"}
                          </pre>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Prompt (formaterad)</p>
                          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-gray-200">
                            {log.promptFormatted || "—"}
                          </pre>
                        </div>
                      </div>

                      <div className="mt-3">
                        <p className="text-xs text-gray-500">Systemprompt</p>
                        <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-gray-200">
                          {log.systemPrompt || "—"}
                        </pre>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Stat card component
function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: string;
}) {
  const colors: Record<string, string> = {
    blue: "bg-brand-blue/10 text-brand-blue",
    green: "bg-brand-teal/10 text-brand-teal",
    purple: "bg-brand-blue/10 text-brand-blue",
    amber: "bg-brand-amber/10 text-brand-amber",
    pink: "bg-brand-warm/10 text-brand-warm",
    cyan: "bg-brand-teal/10 text-brand-teal",
  };

  return (
    <div className="border border-gray-800 bg-black/50 p-4">
      <div className={`h-10 w-10 ${colors[color]} mb-3 flex items-center justify-center`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-2xl font-bold text-white">{value.toLocaleString()}</p>
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}

// Database stat card
function DbStatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-gray-900/50 p-3">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-xl font-bold text-white">{value.toLocaleString()}</p>
    </div>
  );
}
