import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { getAdminUserForPage } from "@/lib/auth/admin";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AdminShell } from "./components/admin-shell";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Adminpanel — Sajtmaskin",
  robots: { index: false, follow: false },
};

/**
 * Server-side gate for the whole admin console.
 *
 * `src/proxy.ts` already redirects non-admins away from `/admin*`; this is the
 * second, explicit check next to the data itself (same predicate as the API
 * guard, `isAdminEmailEdge` via `getAdminUserForPage`). It replaces the old
 * client-side `localStorage["admin-auth"]` login form, which forced admins to
 * log in a second time without protecting anything.
 *
 * A failed *check* (database down) is not treated as "denied" — see the
 * `unavailable` branch below.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const access = await getAdminUserForPage();

  if (!access.ok && access.reason === "denied") {
    redirect("/");
  }

  if (!access.ok) {
    return (
      <div className="bg-background flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-lg space-y-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Kan inte verifiera din inloggning just nu</AlertTitle>
            <AlertDescription>
              <p>
                Adminpanelen kunde inte läsa ditt konto — oftast betyder det att databasen inte
                svarar. Du är inte utloggad. Försök igen om en stund.
              </p>
            </AlertDescription>
          </Alert>
          <p className="text-muted-foreground font-mono text-xs break-words">{access.message}</p>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/admin">Försök igen</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/">Till appen</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <AdminShell adminEmail={access.user.email ?? "admin"}>{children}</AdminShell>;
}
