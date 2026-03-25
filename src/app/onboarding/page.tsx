"use client"

import { signOut } from "next-auth/react"
import { useEffect, useMemo, useState } from "react"

const APPLICATION_ANSWERS_KEY = "autoapply_application_answers_v1"

type ProfileData = {
  fullName?: string | null
  currentTitle?: string | null
  cvFileName?: string | null
  cvFileUrl?: string | null
  skills?: string[]
  languages?: string[]
  summary?: string | null
  yearsExperience?: number | null
  desiredLocation?: string | null
  linkedinEnabled?: boolean
  tanitjobsEnabled?: boolean
  keejobEnabled?: boolean
}

type SettingsData = {
  desiredLocation?: string | null
  linkedinEmail?: string | null
  tanitjobsEmail?: string | null
  keejobEmail?: string | null
  linkedinEnabled?: boolean
  tanitjobsEnabled?: boolean
  keejobEnabled?: boolean
}

type StatsData = {
  total: number
  applied: number
  interview: number
  pending: number
}

type ApplicationAnswersForm = {
  phone: string
  city: string
  country: string
  baseCountry: string
  citizenship: string
  linkedinUrl: string
  portfolioUrl: string
  noticePeriod: string
  salaryExpectation: string
  referralSource: string
  workAuthorization: "yes" | "no"
  sponsorshipRequired: "yes" | "no"
  openToRelocation: "yes" | "no"
  remotePreference: "yes" | "no"
  livesInEurope: "yes" | "no"
  openToB2BContract: "yes" | "no"
  hasPersonalLaptop: "yes" | "no"
  workedBefore: "yes" | "no"
  inSanctionedTerritories: "yes" | "no"
}

function suggestTitles(profile: ProfileData | null) {
  if (!profile) return []

  const titles = new Set<string>()
  if (profile.currentTitle) titles.add(profile.currentTitle)

  const skills = (profile.skills || []).map((skill) => skill.toLowerCase())
  if (skills.some((skill) => skill.includes("angular") || skill.includes("react") || skill.includes("javascript"))) {
    titles.add("Frontend Engineer")
    titles.add("Frontend Developer")
  }
  if (skills.some((skill) => skill.includes("java") || skill.includes("spring"))) {
    titles.add("Java Developer")
    titles.add("Backend Engineer")
  }
  if (skills.some((skill) => skill.includes("node") || skill.includes("api"))) {
    titles.add("Full Stack Developer")
  }
  if (skills.some((skill) => skill.includes("support") || skill.includes("service client"))) {
    titles.add("Customer Support Specialist")
  }
  if (skills.some((skill) => skill.includes("cloud") || skill.includes("aws"))) {
    titles.add("Cloud Engineer")
  }

  return Array.from(titles).slice(0, 6)
}

function buildSuggestedAnswers(profile: ProfileData | null): ApplicationAnswersForm {
  const fullName = (profile?.fullName || "Med Aziz Azaiez").trim()
  const parts = fullName.split(/\s+/).filter(Boolean)
  const firstName = parts[0] || "Med"
  const country = profile?.desiredLocation && profile.desiredLocation !== "Worldwide" ? profile.desiredLocation : "Tunisia"

  return {
    phone: "+21600000000",
    city: "Tunis",
    country,
    baseCountry: country,
    citizenship: country === "France" ? "French" : "Tunisian",
    linkedinUrl: "https://linkedin.com/in/medazizazaiez",
    portfolioUrl: "https://linkedin.com/in/medazizazaiez",
    noticePeriod: "2 weeks",
    salaryExpectation: "2000",
    referralSource: "LinkedIn",
    workAuthorization: "yes",
    sponsorshipRequired: "no",
    openToRelocation: "yes",
    remotePreference: "yes",
    livesInEurope: country === "France" || country === "Germany" || country === "Italy" || country === "Spain" ? "yes" : "no",
    openToB2BContract: "yes",
    hasPersonalLaptop: "yes",
    workedBefore: "no",
    inSanctionedTerritories: "no",
  }
}

export default function OnboardingPage() {
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [settings, setSettings] = useState<SettingsData | null>(null)
  const [stats, setStats] = useState<StatsData>({ total: 0, applied: 0, interview: 0, pending: 0 })
  const [answersReady, setAnswersReady] = useState(false)
  const [seeded, setSeeded] = useState(false)

  useEffect(() => {
    async function loadData() {
      const [cvRes, settingsRes, applyRes] = await Promise.all([
        fetch("/api/cv"),
        fetch("/api/settings"),
        fetch("/api/apply"),
      ])

      const [{ profile: cvProfile }, { profile: settingsProfile }, { stats: applyStats }] = await Promise.all([
        cvRes.json(),
        settingsRes.json(),
        applyRes.json(),
      ])

      if (cvProfile) setProfile(cvProfile)
      if (settingsProfile) setSettings(settingsProfile)
      if (applyStats) setStats(applyStats)

      try {
        const raw = window.localStorage.getItem(APPLICATION_ANSWERS_KEY)
        setAnswersReady(Boolean(raw))
      } catch {
        setAnswersReady(false)
      }
    }

    loadData()
  }, [])

  const suggestedTitles = useMemo(() => suggestTitles(profile), [profile])

  const steps = useMemo(() => {
    const hasCv = Boolean(profile?.cvFileUrl)
    const hasPreferences = Boolean(settings?.desiredLocation)
    const hasPlatform = Boolean(settings?.linkedinEnabled || settings?.tanitjobsEnabled || settings?.keejobEnabled)
    const hasAnswers = answersReady
    const hasRun = stats.total > 0

    return [
      {
        title: "Upload your CV",
        done: hasCv,
        href: "/profile",
        description: hasCv ? `CV parsed: ${profile?.cvFileName || "resume uploaded"}` : "Upload one PDF to generate your candidate profile.",
      },
      {
        title: "Connect your platforms",
        done: hasPlatform,
        href: "/settings",
        description: hasPlatform ? "At least one platform is enabled." : "Add LinkedIn or another platform before running the bot.",
      },
      {
        title: "Review preferences",
        done: hasPreferences,
        href: "/settings",
        description: hasPreferences ? `Search country: ${settings?.desiredLocation}` : "Pick the country and automation style you want.",
      },
      {
        title: "Prepare AI answers",
        done: hasAnswers,
        href: "/settings",
        description: hasAnswers ? "Applicant answers are ready for forms." : "Seed common answers so Groq can fill forms more confidently.",
      },
      {
        title: "Launch your first run",
        done: hasRun,
        href: "/dashboard",
        description: hasRun ? `${stats.applied} applications already recorded.` : "When the checklist is green, start from the dashboard.",
      },
    ]
  }, [answersReady, profile, settings, stats])

  const completedCount = steps.filter((step) => step.done).length
  const progressPercent = Math.round((completedCount / steps.length) * 100)

  function seedAnswersFromProfile() {
    const answers = buildSuggestedAnswers(profile)
    window.localStorage.setItem(APPLICATION_ANSWERS_KEY, JSON.stringify(answers))
    setAnswersReady(true)
    setSeeded(true)
    setTimeout(() => setSeeded(false), 2500)
  }

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <section className="relative overflow-hidden rounded-[32px] border border-black/5 bg-[#1f2a24] px-6 py-7 text-[#f8f3ea] shadow-[0_24px_70px_rgba(35,34,25,0.18)] md:px-10 md:py-10">
          <div className="absolute -left-10 top-0 h-40 w-40 rounded-full bg-[#f09b61]/20 blur-3xl" />
          <div className="absolute right-0 top-0 h-52 w-52 rounded-full bg-[#6da086]/20 blur-3xl" />

          <div className="relative grid gap-8 lg:grid-cols-[1.3fr_0.7fr]">
            <div>
              <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.24em] text-[#d9cbb9]">
                Guided onboarding
              </div>
              <h1 className="mt-5 max-w-3xl text-3xl font-bold leading-tight md:text-5xl">
                Set up your job copilot in one smooth flow
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-[#d8d1c4] md:text-base">
                Upload your CV, let AI shape your profile, seed your common form answers, and move into the dashboard with a much cleaner setup path.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <a
                  href={steps.find((step) => !step.done)?.href || "/dashboard"}
                  className="rounded-full bg-[#f09b61] px-5 py-2.5 text-sm font-medium text-[#1f2a24] transition-transform hover:-translate-y-0.5"
                >
                  Continue onboarding
                </a>
                <a
                  href="/dashboard"
                  className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-medium text-white/90 transition-colors hover:bg-white/8"
                >
                  Skip to dashboard
                </a>
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-medium text-white/90 transition-colors hover:bg-white/8"
                >
                  Log out
                </button>
              </div>
            </div>

            <div className="rounded-[26px] border border-white/10 bg-white/8 p-5 backdrop-blur-sm">
              <p className="text-xs uppercase tracking-[0.22em] text-[#d7cab8]">Readiness</p>
              <p className="mt-2 text-4xl font-bold text-white">{progressPercent}%</p>
              <p className="mt-2 text-sm text-[#d8d1c4]">
                {completedCount} of {steps.length} onboarding steps completed.
              </p>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#346959] to-[#f09b61] transition-all duration-500"
                  style={{ width: `${Math.max(progressPercent, 8)}%` }}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-[28px] border border-black/5 bg-[#fbf7f0]/90 p-5 shadow-[0_18px_40px_rgba(44,36,24,0.08)] md:p-6">
            <p className="text-xs uppercase tracking-[0.22em] text-[#857866]">Checklist</p>
            <h2 className="mt-2 text-2xl font-semibold text-[#1f2a24]">Your onboarding path</h2>

            <div className="mt-5 space-y-3">
              {steps.map((step, index) => (
                <a
                  key={step.title}
                  href={step.href}
                  className="flex items-start gap-4 rounded-[22px] border border-[#eadfce] bg-white/75 p-4 transition-transform hover:-translate-y-0.5"
                >
                  <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                    step.done ? "bg-[#346959] text-white" : "bg-[#ece4d7] text-[#6c6257]"
                  }`}>
                    {step.done ? "OK" : index + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <p className="text-sm font-semibold text-[#20231f]">{step.title}</p>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                        step.done ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-600"
                      }`}>
                        {step.done ? "Done" : "Pending"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-[#6f675b]">{step.description}</p>
                  </div>
                </a>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <section className="rounded-[28px] border border-black/5 bg-[#f4e4cf] p-5 shadow-[0_18px_40px_rgba(44,36,24,0.08)] md:p-6">
              <p className="text-xs uppercase tracking-[0.18em] text-[#8a5c3e]">AI suggestions</p>
              <h2 className="mt-2 text-xl font-semibold text-[#332118]">Suggested job targets from your CV</h2>
              <p className="mt-2 text-sm leading-6 text-[#6f5445]">
                These are good first targets based on your parsed profile. You can use them to guide your platform searches and settings.
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                {suggestedTitles.length ? suggestedTitles.map((title) => (
                  <span
                    key={title}
                    className="rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-[#5c4336]"
                  >
                    {title}
                  </span>
                )) : (
                  <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-[#5c4336]">
                    Upload your CV to unlock role suggestions
                  </span>
                )}
              </div>

              {profile?.summary && (
                <div className="mt-5 rounded-[20px] bg-white/45 p-4 text-sm leading-6 text-[#5e483b]">
                  {profile.summary}
                </div>
              )}
            </section>

            <section className="rounded-[28px] border border-black/5 bg-[#fbf7f0]/90 p-5 shadow-[0_18px_40px_rgba(44,36,24,0.08)] md:p-6">
              <p className="text-xs uppercase tracking-[0.18em] text-[#7c6f60]">Form answers</p>
              <h2 className="mt-2 text-xl font-semibold text-[#1f2a24]">Seed your common answers</h2>
              <p className="mt-2 text-sm leading-6 text-[#6b6257]">
                Save a starter answer pack in one click so Groq has cleaner defaults for salary, notice period, citizenship, and other common form questions.
              </p>

              <div className="mt-5 rounded-[22px] bg-white/75 p-4 text-sm text-[#5f564d]">
                <p><strong>Name:</strong> {profile?.fullName || "Will use your CV once uploaded"}</p>
                <p className="mt-2"><strong>Country:</strong> {settings?.desiredLocation || profile?.desiredLocation || "Tunisia"}</p>
                <p className="mt-2"><strong>Current title:</strong> {profile?.currentTitle || "Will be parsed from your CV"}</p>
              </div>

              <button
                type="button"
                onClick={seedAnswersFromProfile}
                className={`mt-5 rounded-full px-5 py-2.5 text-sm font-medium transition-all ${
                  seeded
                    ? "bg-[#346959] text-white"
                    : "bg-[#1f2a24] text-white hover:-translate-y-0.5"
                }`}
              >
                {seeded ? "Answer pack saved" : answersReady ? "Refresh answer pack from CV" : "Create answer pack from CV"}
              </button>

              <a
                href="/settings"
                className="mt-4 inline-flex text-sm font-medium text-[#346959] hover:underline"
              >
                Review or edit detailed answers in settings
              </a>
            </section>
          </div>
        </section>
      </div>
    </main>
  )
}
