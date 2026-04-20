import NextAuth from "next-auth"
import Google from "next-auth/providers/google"

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        token.provider = account.provider
      }
      if (profile && "email" in profile) {
        token.email = profile.email as string | undefined
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.email = token.email as string | undefined
      }
      return session
    },
  },
})
