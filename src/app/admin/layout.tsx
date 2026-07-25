import { redirect } from "next/navigation";
import { getAdminUserForPage } from "@/lib/auth/admin";
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
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdminUserForPage();

  if (!admin) {
    redirect("/");
  }

  return <AdminShell adminEmail={admin.email ?? "admin"}>{children}</AdminShell>;
}
