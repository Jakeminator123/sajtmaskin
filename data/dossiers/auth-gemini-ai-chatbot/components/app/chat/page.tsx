import { auth, signIn, signOut } from "@/auth"
import { redirect } from "next/navigation"

export default async function ChatPage() {
  const session = await auth()

  if (!session?.user) {
    redirect("/api/auth/signin")
  }

  return (
    <main style={{ padding: 24 }}>
      <header style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1>Chat</h1>
          <p>Signed in as {session.user.email ?? "unknown user"}</p>
        </div>
        <form
          action={async () => {
            "use server"
            await signOut({ redirectTo: "/" })
          }}
        >
          <button type="submit">Sign out</button>
        </form>
      </header>

      <p>Render your chatbot UI here and post messages to /api/chat.</p>

      <form
        action={async () => {
          "use server"
          await signIn("google", { redirectTo: "/chat" })
        }}
      >
        <button type="submit">Re-authenticate</button>
      </form>
    </main>
  )
}
