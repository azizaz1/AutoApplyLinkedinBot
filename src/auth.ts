import NextAuth from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import Credentials from "next-auth/providers/credentials"
import { prisma } from "@/lib/prisma"
import { authConfig } from "@/auth.config"

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  providers: [
    ...authConfig.providers,
    // Override Credentials with full authorize logic (needs Prisma)
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email) return null
        let user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        })
        if (!user) {
          user = await prisma.user.create({
            data: { email: credentials.email as string, name: "User" },
          })
        }
        return user
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id
      return token
    },
    async session({ session, token }) {
      if (token.id) session.user.id = token.id as string
      return session
    },
  },
})
