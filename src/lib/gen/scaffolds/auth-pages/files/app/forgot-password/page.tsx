import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthForm } from "../../components/auth-form";

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <Card className="border-border bg-card w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">Återställ lösenord</CardTitle>
          <CardDescription>
            Formulärförhandsvisning. Ingen återställningslänk skickas innan en autentiseringstjänst
            ansluts.
          </CardDescription>
        </CardHeader>
        <AuthForm intent="reset-password" />
      </Card>
    </main>
  );
}
