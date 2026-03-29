import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// CORS headers so the extension (running on linkedin.com) can call this
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Extension-Secret",
  }
}

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders() })
}

function getSecret() {
  return process.env.EXTENSION_SECRET || ""
}

function checkSecret(req: NextRequest): boolean {
  const secret = getSecret()
  if (!secret) return false
  return req.headers.get("X-Extension-Secret") === secret
}

// Preflight
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() })
}

// GET — return profile data for the extension
export async function GET(req: NextRequest) {
  if (!checkSecret(req)) return unauthorized()

  // Find the user whose secret matches (single-user setup: get first profile)
  const profile = await prisma.profile.findFirst({
    select: {
      fullName: true,
      currentTitle: true,
      summary: true,
      yearsExperience: true,
      skills: true,
      languages: true,
      desiredTitles: true,
      desiredLocation: true,
      remoteOnly: true,
      cvFileUrl: true,
      userId: true,
    },
  })

  return NextResponse.json({ profile }, { headers: corsHeaders() })
}

// POST — save an application result from the extension
export async function POST(req: NextRequest) {
  if (!checkSecret(req)) return unauthorized()

  const body = await req.json()
  const { jobId, title, company, url, status, userId: bodyUserId } = body

  if (!jobId || !title || !company) {
    return NextResponse.json({ error: "jobId, title, company required" }, { status: 400, headers: corsHeaders() })
  }

  // Use userId from request body if provided, otherwise fall back to first profile
  let profile: { userId: string; desiredLocation: string | null } | null = null
  if (bodyUserId) {
    profile = await prisma.profile.findUnique({
      where: { userId: bodyUserId },
      select: { userId: true, desiredLocation: true },
    })
  }
  if (!profile) {
    profile = await prisma.profile.findFirst({
      select: { userId: true, desiredLocation: true },
    })
  }

  if (!profile) {
    return NextResponse.json({ error: "No profile found" }, { status: 404, headers: corsHeaders() })
  }

  try {
    const job = await prisma.job.upsert({
      where: { platform_externalId: { platform: "LINKEDIN", externalId: jobId } },
      create: {
        platform: "LINKEDIN",
        externalId: jobId,
        url: url || `https://www.linkedin.com/jobs/view/${jobId}`,
        title,
        company,
        location: profile.desiredLocation || "Remote",
      },
      update: {},
    })

    await prisma.application.upsert({
      where: { userId_jobId: { userId: profile.userId, jobId: job.id } },
      create: { userId: profile.userId, jobId: job.id, matchScore: 80, status: "APPLIED", appliedAt: new Date() },
      update: { status: "APPLIED", appliedAt: new Date() },
    })

    return NextResponse.json({ success: true }, { headers: corsHeaders() })
  } catch (err) {
    console.error("Extension save error:", err)
    return NextResponse.json({ error: "Failed to save" }, { status: 500, headers: corsHeaders() })
  }
}

export const runtime = "nodejs"
