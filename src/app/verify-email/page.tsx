import type { Metadata } from "next";
import { EmailVerificationForm } from "@/components/auth/email-verification-form";
import { sanitizeAuthReturnTo } from "@/lib/auth/auth-return";
import { URLS } from "@/lib/config";

export const metadata: Metadata = {
  title: "Bekräfta din e-post",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function VerifyEmailPage({ searchParams }: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const params = await searchParams;
  return <main className="flex min-h-screen items-center justify-center p-6">
    <EmailVerificationForm returnTo={sanitizeAuthReturnTo(params.returnTo, URLS.baseUrl) ?? "/"} />
  </main>;
}
