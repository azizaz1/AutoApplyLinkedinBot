import type { Metadata } from "next"
import { Space_Grotesk } from "next/font/google"
import { SessionProvider } from "next-auth/react"
import { auth } from "@/auth"
import "./globals.css"

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "AutoApply — Apply to jobs automatically",
  description: "Upload your CV and auto-apply to software engineering jobs on LinkedIn, TanitJobs and Keejob",
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  return (
    <html lang="en">
      <body className={spaceGrotesk.className}>
        <SessionProvider session={session}>
          {children}
        </SessionProvider>
      </body>
    </html>
  )
}
