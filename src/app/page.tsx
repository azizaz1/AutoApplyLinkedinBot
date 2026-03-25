import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"

export default async function Home() {
  const session = await auth()
  if (session?.user?.id) {
    const profile = await prisma.profile.findUnique({
      where: { userId: session.user.id },
      select: { cvFileUrl: true, currentTitle: true, linkedinEnabled: true, tanitjobsEnabled: true, keejobEnabled: true },
    })

    const hasCv = Boolean(profile?.cvFileUrl)
    const hasPlatformEnabled = Boolean(profile?.linkedinEnabled || profile?.tanitjobsEnabled || profile?.keejobEnabled)

    if (!hasCv || !profile?.currentTitle || !hasPlatformEnabled) {
      redirect("/onboarding")
    }

    redirect("/dashboard")
  }
  redirect("/login")
}
