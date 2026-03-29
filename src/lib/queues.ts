import { Queue, Worker, Job } from "bullmq"
import IORedis from "ioredis"

// ─── Redis connection ─────────────────────────────────────────────────────────

export const redis = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
})

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379"

// ─── Queue definitions ────────────────────────────────────────────────────────

export const scrapeQueue = new Queue("scrape-jobs", { connection: { url: redisUrl } })
export const applyQueue  = new Queue("apply-jobs",  { connection: { url: redisUrl } })

// ─── Job data types ───────────────────────────────────────────────────────────

export interface ScrapeJobData {
  userId: string
  platform: "LINKEDIN" | "TANITJOBS" | "KEEJOB"
  query: string
}

export interface ApplyJobData {
  userId: string
  applicationId: string
  platform: "LINKEDIN" | "TANITJOBS" | "KEEJOB"
  jobUrl: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Add a full scrape + apply run for a user across all enabled platforms */
export async function scheduleRun(userId: string, queries: string[]) {
  const platforms: Array<"LINKEDIN" | "TANITJOBS" | "KEEJOB"> = [
    "LINKEDIN",
    "TANITJOBS",
    "KEEJOB",
  ]
  for (const platform of platforms) {
    for (const query of queries) {
      await scrapeQueue.add(
        "scrape",
        { userId, platform, query } satisfies ScrapeJobData,
        { attempts: 3, backoff: { type: "exponential", delay: 5000 } }
      )
    }
  }
}
