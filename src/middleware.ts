import NextAuth from "next-auth"
import { authConfig } from "@/auth.config"

// Use lightweight config (no Prisma) so middleware stays Edge-compatible
export default NextAuth(authConfig).auth

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public/).*)"],
}
