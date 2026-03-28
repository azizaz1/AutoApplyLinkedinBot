/**
 * Shared bot runner — used by both /api/run (SSE) and the scheduler (silent).
 * Collects job results and sends an email summary if notifications are enabled.
 */

import * as path from "node:path"
import { prisma } from "./prisma"
import { decrypt } from "./crypto"
import type { Platform, Profile } from "@prisma/client"
import type { JobEmailItem } from "./email"

type LogFn = (message: string, type?: string) => Promise<void> | void

async function saveAppliedResult(
  userId: string,
  profile: Profile,
  platform: Platform,
  result: { jobId: string; title: string; company: string; url?: string; location?: string }
) {
  const job = await prisma.job.upsert({
    where: { platform_externalId: { platform, externalId: result.jobId } },
    create: {
      platform,
      externalId: result.jobId,
      url: result.url || (platform === "LINKEDIN" ? `https://www.linkedin.com/jobs/view/${result.jobId}` : result.jobId),
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

export interface BotRunCounts {
  applied: number
  skipped: number
  failed: number
}

export async function runBotForUser(userId: string, onLog?: LogFn): Promise<BotRunCounts> {
  const counts: BotRunCounts = { applied: 0, skipped: 0, failed: 0 }
  const appliedJobs: JobEmailItem[] = []
  const skippedJobs: JobEmailItem[] = []
  const failedJobs:  JobEmailItem[] = []
  const log = (msg: string, type = "status") => onLog?.(msg, type)

  const profile = await prisma.profile.findUnique({ where: { userId } })
  if (!profile) { await log("Profile not found", "error"); return counts }

  const cvPath = profile.cvFileUrl
    ? path.join(process.cwd(), "public", profile.cvFileUrl.replace(/^\//, ""))
    : null
  if (!cvPath) { await log("CV not found", "error"); return counts }

  const platforms: Array<{ platform: Platform; email: string; password: string }> = []
  if (profile.linkedinEnabled && profile.linkedinEmail && profile.linkedinPassEnc)
    platforms.push({ platform: "LINKEDIN", email: profile.linkedinEmail, password: decrypt(profile.linkedinPassEnc) })
  if (profile.tanitjobsEnabled && profile.tanitjobsEmail && profile.tanitjobsPassEnc)
    platforms.push({ platform: "TANITJOBS", email: profile.tanitjobsEmail, password: decrypt(profile.tanitjobsPassEnc) })

  if (!platforms.length) { await log("No platforms enabled", "error"); return counts }

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
  }

  for (const config of platforms) {
    await log(`Starting ${config.platform} bot...`)

    if (config.platform === "LINKEDIN") {
      const { LinkedInBot } = await import("@/scrapers/linkedin")
      const bot = new LinkedInBot(
        config.email, config.password, cvPath, sharedProfile,
        async (result) => {
          if (result.status === "applied") {
            await saveAppliedResult(userId, profile, "LINKEDIN", result).catch(() => {})
          }
        },
        async (message, type) => log(message, type),
        undefined
      )
      const results = await bot.run(config.email, config.password)
      for (const r of results) {
        const url = `https://www.linkedin.com/jobs/view/${r.jobId}`
        if (r.status === "applied") {
          counts.applied++
          appliedJobs.push({ title: r.title, company: r.company, url, status: "applied" })
        } else if (r.status === "skipped" || r.status === "already_applied") {
          counts.skipped++
          skippedJobs.push({ title: r.title, company: r.company, url, status: "skipped", reason: r.reason })
        } else {
          counts.failed++
          failedJobs.push({ title: r.title, company: r.company, url, status: "failed", reason: r.reason })
        }
      }
    }

    if (config.platform === "TANITJOBS") {
      const { TanitJobsBot } = await import("@/scrapers/tanitjobs")
      const bot = new TanitJobsBot(
        config.email, config.password, cvPath, sharedProfile,
        async (result) => {
          if (result.status === "applied") {
            await saveAppliedResult(userId, profile, "TANITJOBS", result).catch(() => {})
          }
        },
        async (message, type) => log(message, type),
        undefined
      )
      const results = await bot.run()
      for (const r of results) {
        if (r.status === "applied") {
          counts.applied++
          appliedJobs.push({ title: r.title, company: r.company, status: "applied" })
        } else if (r.status === "skipped" || r.status === "already_applied") {
          counts.skipped++
          skippedJobs.push({ title: r.title, company: r.company, status: "skipped", reason: r.reason })
        } else {
          counts.failed++
          failedJobs.push({ title: r.title, company: r.company, status: "failed", reason: r.reason })
        }
      }
    }
  }

  // Send email notification if configured
  const p = profile as Profile & {
    notifyEnabled?: boolean
    notifyEmail?: string | null
    smtpHost?: string | null
    smtpPort?: number | null
    smtpUser?: string | null
    smtpPassEnc?: string | null
  }
  if (p.notifyEnabled && p.notifyEmail && p.smtpHost && p.smtpUser && p.smtpPassEnc) {
    try {
      const { sendRunSummaryEmail } = await import("./email")
      await sendRunSummaryEmail({
        to: p.notifyEmail,
        smtpHost: p.smtpHost,
        smtpPort: p.smtpPort ?? 587,
        smtpUser: p.smtpUser,
        smtpPassEnc: p.smtpPassEnc,
        applied: appliedJobs,
        skipped: skippedJobs,
        failed: failedJobs,
      })
      await log("Email notification sent")
    } catch (err) {
      await log(`Email send failed: ${err instanceof Error ? err.message : String(err)}`, "error")
    }
  }

  return counts
}
