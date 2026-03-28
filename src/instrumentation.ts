/**
 * Next.js instrumentation hook — runs once when the server starts.
 * Registers a cron job that checks every minute whether any user schedule should fire.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return

  const cron = await import("node-cron")
  const { prisma } = await import("./lib/prisma")
  const { runBotForUser } = await import("./lib/run-bot")

  // Active run set — prevents double-firing if the bot takes > 1 minute
  const running = new Set<string>()

  cron.schedule("* * * * *", async () => {
    try {
      const now = new Date()
      const currentDay = now.getDay()   // 0=Sun … 6=Sat
      const currentHH = now.getHours().toString().padStart(2, "0")
      const currentMM = now.getMinutes().toString().padStart(2, "0")
      const currentTime = `${currentHH}:${currentMM}`

      const schedules = await prisma.schedule.findMany({
        where: { enabled: true },
      })

      for (const schedule of schedules) {
        if (!schedule.days.includes(currentDay)) continue
        if (schedule.time !== currentTime) continue
        if (running.has(schedule.userId)) continue

        // Don't re-run if already ran in the last 55 minutes (clock drift guard)
        if (schedule.lastRunAt) {
          const diffMs = now.getTime() - schedule.lastRunAt.getTime()
          if (diffMs < 55 * 60 * 1000) continue
        }

        running.add(schedule.userId)
        console.log(`[scheduler] Firing run for user ${schedule.userId} at ${currentTime}`)

        // Create a run record
        const run = await prisma.scheduleRun.create({
          data: { userId: schedule.userId },
        })

        // Update lastRunAt immediately so it doesn't double-fire
        await prisma.schedule.update({
          where: { userId: schedule.userId },
          data: { lastRunAt: now },
        })

        // Run bot in background (non-blocking)
        runBotForUser(schedule.userId, async (message) => {
          console.log(`[scheduler:${schedule.userId}] ${message}`)
        })
          .then(async (counts) => {
            await prisma.scheduleRun.update({
              where: { id: run.id },
              data: { finishedAt: new Date(), applied: counts.applied, skipped: counts.skipped, failed: counts.failed, status: "done" },
            })
            console.log(`[scheduler] Done for user ${schedule.userId} — applied: ${counts.applied}`)
          })
          .catch(async (err) => {
            const msg = err instanceof Error ? err.message : String(err)
            await prisma.scheduleRun.update({
              where: { id: run.id },
              data: { finishedAt: new Date(), status: "error", errorMsg: msg },
            }).catch(() => {})
            console.error(`[scheduler] Error for user ${schedule.userId}:`, msg)
          })
          .finally(() => running.delete(schedule.userId))
      }
    } catch (err) {
      console.error("[scheduler] Cron tick error:", err)
    }
  })

  console.log("[scheduler] Cron registered — checking every minute")
}
