/**
 * LinkedIn Auto-Apply Bot — CLI runner
 * 
 * Usage:
 *   npx tsx src/scripts/linkedin-run.ts
 * 
 * Or add your credentials to .env and run:
 *   npm run linkedin
 */

import { LinkedInBot } from "../scrapers/linkedin"
import { prisma } from "../lib/prisma"
import { decrypt } from "../lib/crypto"
import * as readline from "readline"
import path from "path"

async function saveAppliedResult(profile: NonNullable<Awaited<ReturnType<typeof prisma.profile.findFirst>>>, result: {
  jobId: string
  title: string
  company: string
  status: string
}) {
  if (result.status !== "applied") return

  const job = await prisma.job.upsert({
    where: {
      platform_externalId: {
        platform: "LINKEDIN",
        externalId: result.jobId,
      },
    },
    create: {
      platform: "LINKEDIN",
      externalId: result.jobId,
      url: `https://www.linkedin.com/jobs/view/${result.jobId}`,
      title: result.title,
      company: result.company,
      location: profile.desiredLocation || "Tunis",
    },
    update: {},
  })

  await prisma.application.upsert({
    where: {
      userId_jobId: {
        userId: profile.userId,
        jobId: job.id,
      },
    },
    create: {
      userId: profile.userId,
      jobId: job.id,
      matchScore: 80,
      status: "APPLIED",
      appliedAt: new Date(),
    },
    update: {
      status: "APPLIED",
      appliedAt: new Date(),
    },
  })
}

// ─── Get credentials ──────────────────────────────────────────────────────────

async function askQuestion(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close()
      resolve(answer)
    })
  })
}

async function main() {
  console.log("═══════════════════════════════════════")
  console.log("  AutoApply — LinkedIn Bot")
  console.log("═══════════════════════════════════════\n")

  // Try to get credentials from DB first
  let email    = process.env.LINKEDIN_EMAIL    || ""
  let password = process.env.LINKEDIN_PASSWORD || ""
  let cvPath   = process.env.CV_PATH           || ""

  // Get user profile from DB
  const profile = await prisma.profile.findFirst({
    where: { linkedinEnabled: true },
    include: { user: true },
  })

  if (profile) {
    console.log(`👤 Found profile: ${profile.fullName || profile.user.email}`)

    if (profile.linkedinEmail) email = profile.linkedinEmail
    if (profile.linkedinPassEnc) {
      try { password = decrypt(profile.linkedinPassEnc) } catch {}
    }
    if (profile.cvFileUrl) {
      cvPath = path.join(process.cwd(), "public", profile.cvFileUrl.replace("/", ""))
    }
  }

  // Ask for missing credentials interactively
  if (!email) {
    email = await askQuestion("LinkedIn email: ")
  }
  if (!password) {
    password = await askQuestion("LinkedIn password: ")
  }
  if (!cvPath) {
    cvPath = await askQuestion("Path to your CV PDF (e.g. C:\\Users\\you\\cv.pdf): ")
  }

  console.log(`\n📧 Email:   ${email}`)
  console.log(`📄 CV:      ${cvPath}`)
  console.log(`\nStarting in 3 seconds... (Ctrl+C to cancel)\n`)
  await new Promise(r => setTimeout(r, 3000))

  // Run the bot
  const bot = new LinkedInBot(email, password, cvPath, profile ? {
    fullName: profile.fullName,
    currentTitle: profile.currentTitle,
    summary: profile.summary,
    yearsExperience: profile.yearsExperience,
    skills: profile.skills,
    languages: profile.languages,
    desiredTitles: profile.desiredTitles,
    desiredLocation: profile.desiredLocation,
    remoteOnly: profile.remoteOnly,
  } : undefined, async (result) => {
    if (!profile || result.status !== "applied") return
    try {
      await saveAppliedResult(profile, result)
      console.log(`💾 Saved to dashboard: ${result.title}`)
    } catch (err) {
      console.error(`Failed to save ${result.title}:`, err)
    }
  })
  const results = await bot.run(email, password)

  // Save results to database
  if (profile && results.length > 0) {
    console.log("\n💾 Saving results to database...")

    for (const result of results) {
      if (result.status !== "applied") continue

      try {
        await saveAppliedResult(profile, result)
      } catch (err) {
        console.error(`Failed to save ${result.title}:`, err)
      }
    }

    console.log("✅ Results saved to dashboard!")
  }

  // Print summary table
  console.log("\n═══════════════════════════════════════")
  console.log("  Summary")
  console.log("═══════════════════════════════════════")
  console.table(
    results.map(r => ({
      Status:  r.status,
      Title:   r.title.slice(0, 30),
      Company: r.company.slice(0, 20),
      Reason:  r.reason || "",
    }))
  )

  await prisma.$disconnect()
  process.exit(0)
}

main().catch(err => {
  console.error("Bot crashed:", err)
  process.exit(1)
})
