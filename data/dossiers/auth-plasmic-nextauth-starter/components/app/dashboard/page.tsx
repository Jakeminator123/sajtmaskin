import { auth } from "@/components/auth";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const session = await auth();

  if (!session) {
    redirect("/signin");
  }

  return (
    <main>
      <h1>Dashboard</h1>
      <p>Signed in as {session.user?.email}</p>
    </main>
  );
}
