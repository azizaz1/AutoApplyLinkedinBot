import { PrismaClient, Platform } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  console.log("Seeding database…")

  // Create a demo user
  const user = await prisma.user.upsert({
    where: { email: "demo@autoapply.dev" },
    update: {},
    create: {
      email: "demo@autoapply.dev",
      name: "Demo User",
    },
  })

  // Create profile
  await prisma.profile.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      fullName: "Mohamed Ben Ali",
      currentTitle: "Full Stack Developer",
      summary: "Experienced full stack developer with 4 years building web and mobile apps using React, Node.js and Python.",
      yearsExperience: 4,
      skills: ["React", "Node.js", "TypeScript", "Python", "AWS", "Docker", "PostgreSQL", "Next.js", "REST API", "Git"],
      languages: ["Arabic", "French", "English"],
      desiredTitles: ["Software Engineer", "Full Stack Developer", "Frontend Engineer"],
      desiredLocation: "Tunis",
      jobCategories: ["web", "fullstack", "mobile"],
      linkedinEnabled: true,
      tanitjobsEnabled: true,
      keejobEnabled: false,
      autoApplyEnabled: false,
      minMatchScore: 75,
      maxApplicationsDay: 20,
    },
  })

  // Seed some sample jobs
  const jobs = [
    {
      platform: Platform.LINKEDIN,
      externalId: "li-001",
      url: "https://linkedin.com/jobs/view/li-001",
      title: "Senior Frontend Engineer",
      company: "Vermeg",
      location: "Tunis",
      category: "web",
      description: "We are looking for a Senior Frontend Engineer with 3+ years of React experience to join our growing team.",
    },
    {
      platform: Platform.TANITJOBS,
      externalId: "tn-001",
      url: "https://tanitjobs.com/job/tn-001",
      title: "Full Stack Developer (React / Node.js)",
      company: "Telnet",
      location: "Tunis",
      category: "fullstack",
      description: "Join our digital transformation team. Strong skills in React and Node.js required.",
    },
    {
      platform: Platform.LINKEDIN,
      externalId: "li-002",
      url: "https://linkedin.com/jobs/view/li-002",
      title: "ML Engineer — NLP",
      company: "InstaDeep",
      location: "Remote",
      category: "ai",
      description: "InstaDeep is hiring ML engineers with experience in NLP, transformers, and Python.",
    },
    {
      platform: Platform.KEEJOB,
      externalId: "kj-001",
      url: "https://keejob.com/offres/kj-001",
      title: "React Native Developer",
      company: "Proxym",
      location: "Sfax",
      category: "mobile",
      description: "Build cross-platform mobile apps with React Native for our fintech clients.",
    },
  ]

  for (const job of jobs) {
    await prisma.job.upsert({
      where: { platform_externalId: { platform: job.platform, externalId: job.externalId } },
      update: {},
      create: job,
    })
  }

  console.log(`✅ Seeded user: ${user.email}`)
  console.log(`✅ Seeded ${jobs.length} sample jobs`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
