import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { applyQueue } from "@/lib/queues"

/** GET /api/apply — list all applications for the current user */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status")

  const applications = await prisma.application.findMany({
    where: {
      userId: session.user.id,
      ...(status ? { status: status as never } : {}),
    },
    include: { job: true },
    orderBy: { createdAt: "desc" },
  })

  // Aggregate stats
  const stats = {
    total:     applications.length,
    applied:   applications.filter(a => a.status === "APPLIED").length,
    interview: applications.filter(a => a.status === "INTERVIEW").length,
    rejected:  applications.filter(a => a.status === "REJECTED").length,
    pending:   applications.filter(a => a.status === "PENDING").length,
  }

  return NextResponse.json({ applications, stats })
}

/** POST /api/apply — manually queue an application for a job */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { jobId } = await req.json()
  if (!jobId) {
    return NextResponse.json({ error: "jobId required" }, { status: 400 })
  }

  const job = await prisma.job.findUnique({ where: { id: jobId } })
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 })
  }

  // Check not already applied
  const existing = await prisma.application.findUnique({
    where: { userId_jobId: { userId: session.user.id, jobId } },
  })
  if (existing) {
    return NextResponse.json({ error: "Already applied" }, { status: 409 })
  }

  // Create application record
  const application = await prisma.application.create({
    data: {
      userId: session.user.id,
      jobId,
      matchScore: 0, // will be updated by worker
      status: "PENDING",
    },
  })

  // Queue the apply job
  await applyQueue.add("apply", {
    userId: session.user.id,
    applicationId: application.id,
    platform: job.platform,
    jobUrl: job.url,
  })

  return NextResponse.json({ success: true, application })
}

export const runtime = "nodejs"
