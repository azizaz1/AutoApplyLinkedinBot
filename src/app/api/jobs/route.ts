import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { scheduleRun } from "@/lib/queues"

/** GET /api/jobs — return jobs with match scores for this user */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const category = searchParams.get("category")
  const platform = searchParams.get("platform")
  const page  = parseInt(searchParams.get("page")  || "1")
  const limit = parseInt(searchParams.get("limit") || "20")

  const where: Record<string, unknown> = {}
  if (category) where.category = category
  if (platform) where.platform = platform

  const jobs = await prisma.job.findMany({
    where,
    include: {
      applications: {
        where: { userId: session.user.id },
        select: { id: true, status: true, matchScore: true },
      },
    },
    orderBy: { scrapedAt: "desc" },
    skip: (page - 1) * limit,
    take: limit,
  })

  const total = await prisma.job.count({ where })

  return NextResponse.json({ jobs, total, page, limit })
}

/** POST /api/jobs/run — trigger a scrape + auto-apply run */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const profile = await prisma.profile.findUnique({
    where: { userId: session.user.id },
  })

  if (!profile) {
    return NextResponse.json({ error: "Upload your CV first" }, { status: 400 })
  }

  const queries = [
    ...(profile.desiredTitles.length ? profile.desiredTitles : [profile.currentTitle || "Software Engineer"]),
  ]

  await scheduleRun(session.user.id, queries)

  return NextResponse.json({ success: true, message: "Run started", queries })
}

export const runtime = "nodejs"
