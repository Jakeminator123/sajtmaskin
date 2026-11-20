import type { Metadata } from "next";
import { PasswordResetForm } from "@/components/auth/password-reset-form";

export const metadata: Metadata = {
  title: "Välj nytt lösenord",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function PasswordResetPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const status =
    params.status === "invalid" ? "invalid" : params.status === "error" ? "error" : "ready";
  return (
    <main id="main-content" className="bg-background flex min-h-screen items-center justify-center p-6">
      <PasswordResetForm status={status} />
    </main>
  );
}
