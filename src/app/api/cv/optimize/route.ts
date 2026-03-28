import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { optimizeCV, scoreJobMatch } from "@/lib/claude"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const { mode, jobTitle, jobDescription } = body // mode: "score" | "match"

  const profile = await prisma.profile.findUnique({ where: { userId: session.user.id } })
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 })
  if (!profile.cvFileUrl) return NextResponse.json({ error: "No CV uploaded" }, { status: 400 })

  const cv = {
    fullName: profile.fullName || "",
    currentTitle: profile.currentTitle || "",
    summary: profile.summary || "",
    yearsExperience: profile.yearsExperience || 0,
    skills: profile.skills || [],
    languages: profile.languages || [],
    education: (profile.education as { degree: string; school: string; year?: number }[]) || [],
    experience: (profile.experience as { title: string; company: string; from: string; to: string; description: string }[]) || [],
  }

  if (mode === "score") {
    const result = await optimizeCV(cv, jobTitle)
    return NextResponse.json(result)
  }

  if (mode === "match") {
    if (!jobTitle || !jobDescription)
      return NextResponse.json({ error: "jobTitle and jobDescription required" }, { status: 400 })
    const result = await scoreJobMatch(jobTitle, jobDescription, {
      currentTitle: cv.currentTitle,
      skills: cv.skills,
      yearsExperience: cv.yearsExperience,
      summary: cv.summary,
    })
    return NextResponse.json(result)
  }

  return NextResponse.json({ error: "Invalid mode" }, { status: 400 })
}
