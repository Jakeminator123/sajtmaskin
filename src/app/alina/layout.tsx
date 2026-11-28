import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getAdminUserForPage } from "@/lib/auth/admin";
import { hostedAlina } from "@/lib/avatar/alina-hosted";

export const dynamic = "force-dynamic";
export const metadata = { title: "Alinas studio", robots: { index: false, follow: false } };

export default async function AlinaLayout({ children }: { children: React.ReactNode }) {
  if (!hostedAlina()) {
    const host = (await headers()).get("host") ?? "";
    if (process.env.NODE_ENV === "development" && /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host))
      return children;
    notFound();
  }
  const access = await getAdminUserForPage();
  if (access.ok) return children;
  return (
    <main className="mx-auto max-w-lg px-6 py-24">
      <h1 className="text-2xl font-semibold">Alinas studio</h1>
      {access.reason === "denied" ? (
        <p className="mt-4">Studion kräver ett administratörskonto.{" "}
          <Link className="underline" href="/?login=required&returnTo=%2Falina">Logga in på Sajtmaskin</Link>
        </p>
      ) : <p className="mt-4">Inloggningen kunde inte kontrolleras. Försök igen om en stund.</p>}
    </main>
  );
}
