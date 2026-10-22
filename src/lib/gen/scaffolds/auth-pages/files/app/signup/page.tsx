import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthForm } from "../../components/auth-form";

export default function SignupPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <Card className="border-border bg-card w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">Skapa konto</CardTitle>
          <CardDescription>
            Formulärförhandsvisning. Inget konto skapas innan en autentiseringstjänst ansluts.
          </CardDescription>
        </CardHeader>
        <AuthForm intent="signup" />
      </Card>
    </main>
  );
}
