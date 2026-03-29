import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// Routes that don't require authentication
const PUBLIC_PREFIXES = ["/login", "/api/auth", "/api/extension", "/_next", "/favicon.ico", "/public"]

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const isPublic = PUBLIC_PREFIXES.some(p => pathname.startsWith(p))
  if (isPublic) return NextResponse.next()

  // NextAuth v5 changed cookie prefix from "next-auth" to "authjs"
  const hasSession =
    req.cookies.has("authjs.session-token") ||
    req.cookies.has("__Secure-authjs.session-token") ||
    req.cookies.has("next-auth.session-token") ||
    req.cookies.has("__Secure-next-auth.session-token")

  if (!hasSession) {
    const loginUrl = new URL("/login", req.url)
    loginUrl.searchParams.set("callbackUrl", pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public/).*)"],
}
