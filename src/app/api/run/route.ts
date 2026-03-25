import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/crypto"
import type { Platform, Profile } from "@prisma/client"
import * as path from "path"

export const dynamic = "force-dynamic"
const stopRequests = new Map<string, boolean>()

async function saveAppliedResult(userId: string, profile: Profile, platform: Platform, result: {
  jobId: string
  title: string
  company: string
  status: string
  url?: string
  location?: string
}) {
  if (result.status !== "applied") return

  const job = await prisma.job.upsert({
    where: { platform_externalId: { platform, externalId: result.jobId } },
    create: {
      platform,
      externalId: result.jobId,
      url:
        result.url ||
        (platform === "LINKEDIN"
          ? `https://www.linkedin.com/jobs/view/${result.jobId}`
          : result.jobId),
      title: result.title,
      company: result.company,
      location: result.location || profile.desiredLocation || "Tunis",
    },
    update: {},
  })

  await prisma.application.upsert({
    where: { userId_jobId: { userId, jobId: job.id } },
    create: { userId, jobId: job.id, matchScore: 80, status: "APPLIED", appliedAt: new Date() },
    update: { status: "APPLIED", appliedAt: new Date() },
  })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id
  stopRequests.set(userId, false)

  const profile = await prisma.profile.findUnique({ where: { userId } })
  let applicationAnswers: Record<string, unknown> = {}

  try {
    const body = await req.json()
    if (body?.applicationAnswers && typeof body.applicationAnswers === "object") {
      applicationAnswers = body.applicationAnswers
    }
  } catch {}

  if (!profile) return NextResponse.json({ error: "Upload your CV first" }, { status: 400 })
  const cvPath   = profile.cvFileUrl ? path.join(process.cwd(), "public", profile.cvFileUrl.replace(/^\//, "")) : null

  if (!cvPath) return NextResponse.json({ error: "CV file not found" }, { status: 400 })

  const enabledPlatforms: Array<{
    platform: Platform
    email: string
    password: string
  }> = []

  if (profile.linkedinEnabled && profile.linkedinEmail && profile.linkedinPassEnc) {
    enabledPlatforms.push({
      platform: "LINKEDIN",
      email: profile.linkedinEmail,
      password: decrypt(profile.linkedinPassEnc),
    })
  }

  if (profile.tanitjobsEnabled && profile.tanitjobsEmail && profile.tanitjobsPassEnc) {
    enabledPlatforms.push({
      platform: "TANITJOBS",
      email: profile.tanitjobsEmail,
      password: decrypt(profile.tanitjobsPassEnc),
    })
  }

  if (!enabledPlatforms.length) {
    return NextResponse.json(
      { error: "Enable at least one platform and add its credentials in Settings first" },
      { status: 400 }
    )
  }

  const stream  = new TransformStream()
  const writer  = stream.writable.getWriter()
  const encoder = new TextEncoder()

  const send = async (data: object) => {
    await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
  }

  ;(async () => {
    try {
      await send({ type: "status", message: "Starting bot..." })
      await send({
        type: "status",
        message: `Using search country: ${profile.desiredLocation || "Worldwide"}${profile.remoteOnly ? " (remote only)" : ""}`,
      })
      let appliedCount = 0

      const sharedProfile = {
        fullName: profile.fullName,
        currentTitle: profile.currentTitle,
        summary: profile.summary,
        yearsExperience: profile.yearsExperience,
        skills: profile.skills,
        languages: profile.languages,
        desiredTitles: profile.desiredTitles,
        desiredLocation: profile.desiredLocation,
        remoteOnly: profile.remoteOnly,
        phone: typeof applicationAnswers.phone === "string" ? applicationAnswers.phone : undefined,
        city: typeof applicationAnswers.city === "string" ? applicationAnswers.city : undefined,
        country: typeof applicationAnswers.country === "string" ? applicationAnswers.country : undefined,
        baseCountry: typeof applicationAnswers.baseCountry === "string" ? applicationAnswers.baseCountry : undefined,
        citizenship: typeof applicationAnswers.citizenship === "string" ? applicationAnswers.citizenship : undefined,
        linkedinUrl: typeof applicationAnswers.linkedinUrl === "string" ? applicationAnswers.linkedinUrl : undefined,
        portfolioUrl: typeof applicationAnswers.portfolioUrl === "string" ? applicationAnswers.portfolioUrl : undefined,
        noticePeriod: typeof applicationAnswers.noticePeriod === "string" ? applicationAnswers.noticePeriod : undefined,
        salaryExpectation: typeof applicationAnswers.salaryExpectation === "string" ? applicationAnswers.salaryExpectation : undefined,
        referralSource: typeof applicationAnswers.referralSource === "string" ? applicationAnswers.referralSource : undefined,
        workAuthorization: typeof applicationAnswers.workAuthorization === "string" ? applicationAnswers.workAuthorization : undefined,
        sponsorshipRequired: typeof applicationAnswers.sponsorshipRequired === "string" ? applicationAnswers.sponsorshipRequired : undefined,
        openToRelocation: typeof applicationAnswers.openToRelocation === "string" ? applicationAnswers.openToRelocation : undefined,
        remotePreference: typeof applicationAnswers.remotePreference === "string" ? applicationAnswers.remotePreference : undefined,
        livesInEurope: typeof applicationAnswers.livesInEurope === "string" ? applicationAnswers.livesInEurope : undefined,
        openToB2BContract: typeof applicationAnswers.openToB2BContract === "string" ? applicationAnswers.openToB2BContract : undefined,
        hasPersonalLaptop: typeof applicationAnswers.hasPersonalLaptop === "string" ? applicationAnswers.hasPersonalLaptop : undefined,
        workedBefore: typeof applicationAnswers.workedBefore === "string" ? applicationAnswers.workedBefore : undefined,
        inSanctionedTerritories: typeof applicationAnswers.inSanctionedTerritories === "string" ? applicationAnswers.inSanctionedTerritories : undefined,
      }

      for (const config of enabledPlatforms) {
        if (stopRequests.get(userId) === true) break

        await send({ type: "status", message: `Starting ${config.platform} bot...` })

        if (config.platform === "LINKEDIN") {
          const { LinkedInBot } = await import("@/scrapers/linkedin")
          const bot = new LinkedInBot(
            config.email,
            config.password,
            cvPath,
            sharedProfile,
            async (result) => {
              if (result.status === "applied") {
                try {
                  await saveAppliedResult(userId, profile, "LINKEDIN", result)
                  await send({ type: "saved", message: `Saved to dashboard: ${result.title}` })
                } catch (err) {
                  await send({
                    type: "error",
                    message: `Failed to save ${result.title}: ${err instanceof Error ? err.message : String(err)}`,
                  })
                }
              }
            },
            async (message, type = "status") => {
              await send({ type, message })
            },
            async () => stopRequests.get(userId) === true
          )

          await send({ type: "status", message: "Logging into LinkedIn..." })
          const results = await bot.run(config.email, config.password)

          for (const result of results) {
            if (result.status === "applied") {
              appliedCount++
              try {
                await saveAppliedResult(userId, profile, "LINKEDIN", result)
              } catch (err) {
                await send({
                  type: "error",
                  message: `Failed to save ${result.title}: ${err instanceof Error ? err.message : String(err)}`,
                })
              }
              await send({ type: "applied", message: `Applied to ${result.title} at ${result.company}`, count: appliedCount })
            } else if (result.status === "skipped") {
              await send({
                type: "skipped",
                message: `Skipped: ${result.title}${result.reason ? ` (${result.reason})` : ""}`,
              })
            } else if (result.status === "failed") {
              await send({
                type: "error",
                message: `Failed: ${result.title}${result.reason ? ` (${result.reason})` : ""}`,
              })
            } else if (result.status === "already_applied") {
              await send({
                type: "status",
                message: `Already applied: ${result.title}`,
              })
            }
          }
          continue
        }

        if (config.platform === "TANITJOBS") {
          const { TanitJobsBot } = await import("@/scrapers/tanitjobs")
          const bot = new TanitJobsBot(
            config.email,
            config.password,
            cvPath,
            sharedProfile,
            async (result) => {
              if (result.status === "applied") {
                try {
                  await saveAppliedResult(userId, profile, "TANITJOBS", result)
                  await send({ type: "saved", message: `Saved to dashboard: ${result.title}` })
                } catch (err) {
                  await send({
                    type: "error",
                    message: `Failed to save ${result.title}: ${err instanceof Error ? err.message : String(err)}`,
                  })
                }
              }
            },
            async (message, type = "status") => {
              await send({ type, message })
            },
            async () => stopRequests.get(userId) === true
          )

          await send({ type: "status", message: "Logging into TanitJobs..." })
          const results = await bot.run()

          for (const result of results) {
            if (result.status === "applied") {
              appliedCount++
              try {
                await saveAppliedResult(userId, profile, "TANITJOBS", result)
              } catch (err) {
                await send({
                  type: "error",
                  message: `Failed to save ${result.title}: ${err instanceof Error ? err.message : String(err)}`,
                })
              }
              await send({ type: "applied", message: `Applied to ${result.title} at ${result.company}`, count: appliedCount })
            } else if (result.status === "skipped") {
              await send({
                type: "skipped",
                message: `Skipped: ${result.title}${result.reason ? ` (${result.reason})` : ""}`,
              })
            } else if (result.status === "failed") {
              await send({
                type: "error",
                message: `Failed: ${result.title}${result.reason ? ` (${result.reason})` : ""}`,
              })
            } else if (result.status === "already_applied") {
              await send({
                type: "status",
                message: `Already applied: ${result.title}`,
              })
            }
          }
          continue
        }

      }
      await send({ type: "done", message: `Done! Applied to ${appliedCount} jobs`, totalApplied: appliedCount })
    } catch (err) {
      await send({ type: "error", message: err instanceof Error ? err.message : "Unknown error" })
    } finally {
      stopRequests.delete(userId)
      await writer.close()
    }
  })()

  return new Response(stream.readable, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
  })
}

export async function DELETE() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  stopRequests.set(session.user.id, true)
  return NextResponse.json({ success: true })
}
