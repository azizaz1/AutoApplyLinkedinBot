import { Queue } from "bullmq"

// ─── Queue definitions ────────────────────────────────────────────────────────

const connection = { url: process.env.REDIS_URL || "redis://localhost:6379" }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const scrapeQueue = new Queue("scrape-jobs", { connection: connection as any })
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const applyQueue  = new Queue("apply-jobs",  { connection: connection as any })

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
