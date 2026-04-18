import { auth, signIn } from "@/components/auth";
import { redirect } from "next/navigation";

export default async function SignInPage() {
  const session = await auth();

  if (session) {
    redirect("/dashboard");
  }

  return (
    <main style={{ display: "grid", minHeight: "100vh", placeItems: "center" }}>
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/dashboard" });
        }}
      >
        <button type="submit">Continue with Google</button>
      </form>
    </main>
  );
}
