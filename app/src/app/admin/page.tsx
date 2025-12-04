"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShaderBackground } from "@/components/shader-background";
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
  AlertTriangle,
  HardDrive,
  Server,
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
  sqlite: {
    users: number;
    projects: number;
    pageViews: number;
    transactions: number;
    guestUsage: number;
    companyProfiles: number;
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

export default function AdminPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [dbStats, setDbStats] = useState<DatabaseStats | null>(null);
  const [days, setDays] = useState(30);
  const [activeTab, setActiveTab] = useState<"analytics" | "database">(
    "analytics"
  );
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<string | null>(null);

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
    } catch (err) {
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

      if (data.user?.email !== "test@gmail.com") {
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
    } catch (err) {
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

  const handleDownloadDb = async () => {
    setActionLoading("download");
    try {
      const response = await fetch("/api/admin/database?action=download");
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `sajtmaskin-backup-${new Date()
          .toISOString()
          .slice(0, 10)}.db`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error("Failed to download:", err);
    } finally {
      setActionLoading(null);
    }
  };

  // Login form
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <ShaderBackground color="#330033" speed={0.2} />
        <div className="relative z-10 w-full max-w-md">
          <div className="bg-black/70 border border-gray-800 p-8">
            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-teal-500/10 flex items-center justify-center mx-auto mb-4">
                <Lock className="h-6 w-6 text-teal-400" />
              </div>
              <h1 className="text-2xl font-bold text-white">Admin Panel</h1>
              <p className="text-gray-500 mt-2">Logga in med admin-kontot</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                <Input
                  type="email"
                  placeholder="E-post"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 h-11 bg-black/50 border-gray-700 text-white"
                  required
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                <Input
                  type="password"
                  placeholder="Lösenord"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 h-11 bg-black/50 border-gray-700 text-white"
                  required
                />
              </div>

              {error && (
                <p className="text-sm text-red-400 text-center">{error}</p>
              )}

              <Button
                type="submit"
                className="w-full h-11 bg-teal-600 hover:bg-teal-500"
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Logga in"
                )}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <Link
                href="/"
                className="text-sm text-gray-500 hover:text-gray-300"
              >
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
    <div className="min-h-screen bg-black">
      <ShaderBackground color="#1a0033" speed={0.15} />
      <div className="relative z-10 max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 text-gray-400 hover:text-white hover:bg-gray-800"
              >
                <ArrowLeft className="h-4 w-4" />
                Tillbaka
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
              <p className="text-gray-500">test@gmail.com</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="text-gray-400 hover:text-white hover:bg-gray-800"
          >
            Logga ut
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <Button
            variant={activeTab === "analytics" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("analytics")}
            className={`gap-2 ${
              activeTab === "analytics"
                ? "bg-teal-600 hover:bg-teal-500"
                : "border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800"
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
                ? "bg-teal-600 hover:bg-teal-500"
                : "border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800"
            }`}
          >
            <Database className="h-4 w-4" />
            Databaser
          </Button>
        </div>

        {/* Analytics Tab */}
        {activeTab === "analytics" && (
          <>
            {/* Controls */}
            <div className="flex items-center gap-3 mb-6">
              <select
                value={days}
                onChange={(e) => setDays(parseInt(e.target.value))}
                className="px-3 py-2 bg-black/50 border border-gray-700 text-white text-sm"
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
                className="gap-2 border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800"
              >
                <RefreshCw
                  className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
                />
                Uppdatera
              </Button>
            </div>

            {stats && (
              <>
                {/* Stats cards */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
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
                <div className="grid lg:grid-cols-2 gap-6">
                  {/* Daily views chart */}
                  <div className="bg-black/50 border border-gray-800 p-6">
                    <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-teal-400" />
                      Dagliga besök
                    </h2>
                    <div className="h-64 flex items-end gap-1">
                      {stats.dailyViews.length > 0 ? (
                        stats.dailyViews.slice(-14).map((day, i) => {
                          const maxViews = Math.max(
                            ...stats.dailyViews.map((d) => d.views)
                          );
                          const height =
                            maxViews > 0 ? (day.views / maxViews) * 100 : 0;
                          return (
                            <div
                              key={i}
                              className="flex-1 flex flex-col items-center gap-1"
                            >
                              <div
                                className="w-full bg-teal-500/20 relative group"
                                style={{
                                  height: `${height}%`,
                                  minHeight: "4px",
                                }}
                              >
                                <div
                                  className="absolute bottom-0 w-full bg-teal-500"
                                  style={{
                                    height: `${
                                      maxViews > 0
                                        ? (day.unique / maxViews) * 100
                                        : 0
                                    }%`,
                                  }}
                                />
                                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-900 px-2 py-1 text-xs text-white opacity-0 group-hover:opacity-100 whitespace-nowrap z-10">
                                  {day.views} visningar, {day.unique} unika
                                </div>
                              </div>
                              <span className="text-[10px] text-gray-500 -rotate-45">
                                {day.date.slice(5)}
                              </span>
                            </div>
                          );
                        })
                      ) : (
                        <div className="flex-1 flex items-center justify-center text-gray-500">
                          Ingen data än
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Top pages */}
                  <div className="bg-black/50 border border-gray-800 p-6">
                    <h2 className="text-lg font-semibold text-white mb-4">
                      Populära sidor
                    </h2>
                    <div className="space-y-3">
                      {stats.recentPageViews.length > 0 ? (
                        stats.recentPageViews.map((page, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0"
                          >
                            <span className="text-gray-300 truncate max-w-[200px]">
                              {page.path}
                            </span>
                            <span className="text-gray-500 font-mono text-sm">
                              {page.count}
                            </span>
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
            {/* SQLite Section */}
            <div className="bg-black/50 border border-gray-800 p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-teal-500/10 flex items-center justify-center">
                    <HardDrive className="h-5 w-5 text-teal-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">
                      SQLite Database
                    </h2>
                    <p className="text-sm text-gray-500">
                      Storlek: {dbStats?.dbFileSize || "..."}
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadDb}
                  disabled={actionLoading === "download"}
                  className="gap-2 border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800"
                >
                  {actionLoading === "download" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Ladda ner backup
                </Button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                {dbStats?.sqlite && (
                  <>
                    <DbStatCard
                      label="Användare"
                      value={dbStats.sqlite.users}
                    />
                    <DbStatCard
                      label="Projekt"
                      value={dbStats.sqlite.projects}
                    />
                    <DbStatCard
                      label="Sidvisningar"
                      value={dbStats.sqlite.pageViews}
                    />
                    <DbStatCard
                      label="Transaktioner"
                      value={dbStats.sqlite.transactions}
                    />
                    <DbStatCard
                      label="Gäst-användning"
                      value={dbStats.sqlite.guestUsage}
                    />
                    <DbStatCard
                      label="Företagsprofiler"
                      value={dbStats.sqlite.companyProfiles}
                    />
                  </>
                )}
              </div>

              <div className="border-t border-gray-800 pt-4">
                <h3 className="text-sm font-medium text-gray-400 mb-3">
                  Rensa tabeller
                </h3>
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
                          : "border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800"
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
            <div className="bg-black/50 border border-gray-800 p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 flex items-center justify-center ${
                      dbStats?.redis?.connected
                        ? "bg-teal-500/10"
                        : "bg-red-500/10"
                    }`}
                  >
                    <Server
                      className={`h-5 w-5 ${
                        dbStats?.redis?.connected
                          ? "text-teal-400"
                          : "text-red-400"
                      }`}
                    />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">
                      Redis Cache
                    </h2>
                    <p className="text-sm text-gray-500">
                      {dbStats?.redis?.connected ? (
                        <>
                          Ansluten • {dbStats.redis.memoryUsed} använt •{" "}
                          {dbStats.redis.totalKeys} nycklar
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
                        : "border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800"
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
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm">
                  Redis är inte konfigurerat. Lägg till REDIS_PASSWORD i
                  .env.local för att aktivera caching.
                </div>
              )}
            </div>

            {/* Persistent Disk / Uploads Section */}
            <div className="bg-black/50 border border-gray-800 p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-500/10 flex items-center justify-center">
                    <HardDrive className="h-5 w-5 text-purple-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">
                      Persistent Disk
                    </h2>
                    <p className="text-sm text-gray-500">
                      {dbStats?.dataDir || "Ej konfigurerad"} •{" "}
                      {dbStats?.uploads?.fileCount || 0} filer •{" "}
                      {dbStats?.uploads?.totalSize || "0 B"}
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearUploads}
                  disabled={
                    actionLoading === "uploads" || !dbStats?.uploads?.fileCount
                  }
                  className={`gap-2 ${
                    confirmAction === "uploads"
                      ? "border-red-500 text-red-400"
                      : "border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800"
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
                  <h3 className="text-sm font-medium text-gray-400 mb-3">
                    Uppladdade filer ({dbStats.uploads.fileCount} st)
                  </h3>
                  <div className="max-h-40 overflow-y-auto space-y-1 text-sm">
                    {dbStats.uploads.files.map((file, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between py-1 text-gray-500"
                      >
                        <span className="truncate max-w-[250px]">
                          {file.name}
                        </span>
                        <span className="font-mono text-xs">{file.size}</span>
                      </div>
                    ))}
                    {dbStats.uploads.fileCount > 20 && (
                      <p className="text-gray-600 text-xs pt-2">
                        ...och {dbStats.uploads.fileCount - 20} filer till
                      </p>
                    )}
                  </div>
                </div>
              )}

              {dbStats?.dataDir && !dbStats.dataDir.includes("/var/data") && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm mt-4">
                  ⚠️ Persistent disk är inte konfigurerad. Lägg till
                  DATA_DIR=/var/data i miljövariabler på Render för att bevara
                  data mellan deploys.
                </div>
              )}
            </div>

            {/* Danger Zone */}
            <div className="bg-black/50 border border-red-500/30 p-6">
              <h2 className="text-lg font-semibold text-red-400 mb-4 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Farozon
              </h2>
              <p className="text-gray-400 text-sm mb-4">
                Detta raderar ALL data (förutom admin-kontot). Kan inte ångras!
              </p>
              <Button
                variant="outline"
                onClick={handleResetAll}
                disabled={actionLoading === "reset-all"}
                className={`gap-2 ${
                  confirmAction === "reset-all"
                    ? "border-red-500 text-red-400 bg-red-500/10"
                    : "border-red-500/50 text-red-400 hover:bg-red-500/10"
                }`}
              >
                {actionLoading === "reset-all" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : confirmAction === "reset-all" ? (
                  <AlertTriangle className="h-4 w-4" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                {confirmAction === "reset-all"
                  ? "Klicka igen för att bekräfta"
                  : "Återställ allt"}
              </Button>
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
  icon: any;
  label: string;
  value: number;
  color: string;
}) {
  const colors: Record<string, string> = {
    blue: "bg-blue-500/10 text-blue-400",
    green: "bg-teal-500/10 text-teal-400",
    purple: "bg-purple-500/10 text-purple-400",
    amber: "bg-amber-500/10 text-amber-400",
    pink: "bg-pink-500/10 text-pink-400",
    cyan: "bg-cyan-500/10 text-cyan-400",
  };

  return (
    <div className="bg-black/50 border border-gray-800 p-4">
      <div
        className={`w-10 h-10 ${colors[color]} flex items-center justify-center mb-3`}
      >
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
