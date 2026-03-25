/**
 * Background worker — run separately with: npm run worker
 * Processes two queues:
 *   1. scrape-jobs  — scrapes job listings from platforms
 *   2. apply-jobs   — auto-applies to individual jobs
 */

import { Worker } from "bullmq"
import { redis, ScrapeJobData, ApplyJobData } from "../lib/queues"
import { prisma } from "../lib/prisma"
import { scoreJobMatch } from "../lib/claude"
import { decrypt } from "../lib/crypto"

// ─── Import platform scrapers (implemented in next phase) ────────────────────
// import { scrapeLinkedIn }  from "../scrapers/linkedin"
// import { scrapeTanitJobs } from "../scrapers/tanitjobs"
// import { scrapeKeejob }    from "../scrapers/keejob"

// ─── Scrape Worker ────────────────────────────────────────────────────────────

const scrapeWorker = new Worker<ScrapeJobData>(
  "scrape-jobs",
  async (job) => {
    const { userId, platform, query } = job.data
    console.log(`[scrape] ${platform} | "${query}" | user: ${userId}`)

    const profile = await prisma.profile.findUnique({ where: { userId } })
    if (!profile) throw new Error("Profile not found")

    // TODO: call real scraper in next phase
    // const rawJobs = await scraper(query, credentials)
    const rawJobs: Array<{
      externalId: string
      url: string
      title: string
      company: string
      location: string
      description: string
      category: string
    }> = [] // placeholder

    let applied = 0

    for (const raw of rawJobs) {
      // Upsert job
      const dbJob = await prisma.job.upsert({
        where: { platform_externalId: { platform, externalId: raw.externalId } },
        create: { platform, ...raw },
        update: { title: raw.title, description: raw.description },
      })

      // Score match
      const match = await scoreJobMatch(raw.title, raw.description, {
        currentTitle: profile.currentTitle || "",
        skills: profile.skills,
        yearsExperience: profile.yearsExperience || 0,
        summary: profile.summary || "",
      })

      // Create application if score is above threshold and auto-apply is on
      if (
        match.score >= (profile.minMatchScore || 75) &&
        profile.autoApplyEnabled &&
        match.shouldApply
      ) {
        const existing = await prisma.application.findUnique({
          where: { userId_jobId: { userId, jobId: dbJob.id } },
        })
        if (!existing) {
          await prisma.application.create({
            data: { userId, jobId: dbJob.id, matchScore: match.score, status: "PENDING" },
          })
          applied++
        }
      }
    }

    console.log(`[scrape] done — ${rawJobs.length} jobs found, ${applied} queued for apply`)
    return { jobsFound: rawJobs.length, queued: applied }
  },
  { connection: redis, concurrency: 2 }
)

// ─── Apply Worker ─────────────────────────────────────────────────────────────

const applyWorker = new Worker<ApplyJobData>(
  "apply-jobs",
  async (job) => {
    const { userId, applicationId, platform, jobUrl } = job.data
    console.log(`[apply] ${platform} | ${jobUrl} | user: ${userId}`)

    const profile = await prisma.profile.findUnique({ where: { userId } })
    if (!profile) throw new Error("Profile not found")

    try {
      // TODO: call real auto-apply bot in next phase
      // Credentials example:
      // const email = profile.linkedinEmail
      // const pass  = decrypt(profile.linkedinPassEnc!)
      // await linkedinApply({ email, pass, jobUrl, cvPath: profile.cvFileUrl! })

      // Mark as applied
      await prisma.application.update({
        where: { id: applicationId },
        data: { status: "APPLIED", appliedAt: new Date() },
      })

      console.log(`[apply] success — ${applicationId}`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      await prisma.application.update({
        where: { id: applicationId },
        data: { status: "FAILED", errorMsg: msg },
      })
      throw err
    }
  },
  { connection: redis, concurrency: 1 } // apply one at a time to avoid bot detection
)

// ─── Graceful shutdown ────────────────────────────────────────────────────────

process.on("SIGTERM", async () => {
  await scrapeWorker.close()
  await applyWorker.close()
  await prisma.$disconnect()
  process.exit(0)
})

console.log("✅ Workers started — listening for jobs")
console.log("   Queues: scrape-jobs, apply-jobs")
