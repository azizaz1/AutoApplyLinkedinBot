import type { NextAuthConfig } from "next-auth"
import Google from "next-auth/providers/google"
import GitHub from "next-auth/providers/github"
import Credentials from "next-auth/providers/credentials"

// Lightweight config used by middleware (Edge-compatible — no Prisma/jose heavy imports)
export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
  },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID!,
      clientSecret: process.env.AUTH_GITHUB_SECRET!,
    }),
    Credentials({ name: "credentials", credentials: {} }),
  ],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isPublic = nextUrl.pathname.startsWith("/login") || nextUrl.pathname.startsWith("/api/auth")
      if (!isLoggedIn && !isPublic) {
        const loginUrl = new URL("/login", nextUrl)
        loginUrl.searchParams.set("callbackUrl", nextUrl.pathname)
        return Response.redirect(loginUrl)
      }
      return true
    },
  },
}
