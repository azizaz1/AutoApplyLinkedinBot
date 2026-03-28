"use client"

import { signOut } from "next-auth/react"
import { useEffect, useMemo, useRef, useState } from "react"

const APPLICATION_ANSWERS_KEY = "autoapply_application_answers_v1"

type Stats = {
  total: number
  applied: number
  interview: number
  pending: number
}

type LogEntry = {
  type: string
  message: string
  time: string
}

type ApplicationItem = {
  id: string
  status: string
  createdAt: string
  appliedAt?: string | null
  matchScore?: number | null
  job?: {
    title?: string | null
    company?: string | null
    location?: string | null
    url?: string | null
    platform?: string | null
  } | null
}


export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({ total: 0, applied: 0, interview: 0, pending: 0 })
  const [running, setRunning] = useState(false)
  const [log, setLog] = useState<LogEntry[]>([])
  const [profile, setProfile] = useState<any>(null)
  const [applications, setApplications] = useState<ApplicationItem[]>([])
  const [progress, setProgress] = useState(0)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadData() }, [])
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [log])

  async function loadData() {
    const [cvRes, appRes] = await Promise.all([fetch("/api/cv"), fetch("/api/apply")])
    const { profile: p } = await cvRes.json()
    const { stats: s, applications: a } = await appRes.json()
    if (p) setProfile(p)
    if (s) setStats(s)
    if (a) setApplications(a)
  }

  function addLog(type: string, message: string) {
    setLog((entries) => [...entries, { type, message, time: new Date().toLocaleTimeString() }])
  }

  async function stopAutoApply() {
    try {
      await fetch("/api/run", { method: "DELETE" })
      addLog("done", "Stop requested. Finishing current step...")
    } catch {
      addLog("error", "Failed to send stop request")
    }
  }

  async function runAutoApply() {
    if (running) return
    setRunning(true)
    setLog([])
    setProgress(0)
    addLog("status", "Starting auto-apply bot...")

    try {
      let applicationAnswers = null
      try {
        const raw = window.localStorage.getItem(APPLICATION_ANSWERS_KEY)
        applicationAnswers = raw ? JSON.parse(raw) : null
      } catch {}

      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationAnswers }),
      })
      if (!res.ok) {
        const err = await res.json()
        addLog("error", err.error || "Failed to start")
        setRunning(false)
        return
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let applied = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const lines = decoder.decode(value).split("\n")
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue

          try {
            const data = JSON.parse(line.slice(6))
            addLog(data.type, data.message)

            if (data.type === "applied") {
              applied++
              setProgress(Math.min(applied * 8, 100))
              setStats((current) => ({
                ...current,
                total: current.total + 1,
                applied: current.applied + 1,
              }))
            }

            if (data.type === "saved") {
              loadData()
            }

            if (data.type === "done") {
              setProgress(100)
              loadData()
            }
          } catch {}
        }
      }
    } catch {
      addLog("error", "Connection lost")
    }

    setRunning(false)
  }

  const logColor = (type: string) => ({
    applied: "text-emerald-300",
    error: "text-rose-300",
    skipped: "text-stone-400",
    done: "text-amber-200 font-medium",
    saved: "text-sky-300",
  }[type] || "text-stone-300")

  const heroLabel = running ? "Live run in progress" : "Ready to launch"
  const heroTitle = profile?.fullName ? `Automation cockpit for ${profile.fullName.split(" ")[0]}` : "Automation cockpit"
  const skillsPreview = profile?.skills?.slice(0, 6) || []
  const recentApplications = applications.slice(0, 6)
  const statCards = useMemo(() => ([
    {
      label: "Total Sent",
      value: stats.total,
      accent: "from-[#346959] to-[#4d8d74]",
      note: "All applications recorded for this account",
    },
    {
      label: "Applied",
      value: stats.applied,
      accent: "from-[#e37042] to-[#f09b61]",
      note: "Successful submissions delivered to employers",
    },
    {
      label: "Interviews",
      value: stats.interview,
      accent: "from-[#7b5338] to-[#ab7b58]",
      note: "Applications that progressed to interview stage",
    },
    {
      label: "Pending",
      value: stats.pending,
      accent: "from-[#40526b] to-[#667b96]",
      note: "Queued or still waiting for a next action",
    },
  ]), [stats])

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <section className="relative overflow-hidden rounded-[32px] border border-black/5 bg-[#1f2a24] px-6 py-7 text-[#f8f3ea] shadow-[0_24px_70px_rgba(35,34,25,0.18)] md:px-10 md:py-10">
          <div className="absolute -left-10 top-0 h-40 w-40 rounded-full bg-[#f09b61]/20 blur-3xl" />
          <div className="absolute right-0 top-0 h-52 w-52 rounded-full bg-[#6da086]/20 blur-3xl" />
          <div className="absolute bottom-0 right-20 h-36 w-36 rounded-full bg-[#d9b17d]/10 blur-3xl" />

          <div className="relative grid gap-8 lg:grid-cols-[1.4fr_0.8fr]">
            <div>
              <div className="mb-4 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.24em] text-[#d9cbb9]">
                {heroLabel}
              </div>
              <h1 className="max-w-2xl text-3xl font-bold leading-tight md:text-5xl">
                {heroTitle}
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-[#d8d1c4] md:text-base">
                A sharper command center for job automation. Track live bot behavior, recent applications,
                and your candidate signal from one place without burying the important parts.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <a
                  href="/settings"
                  className="rounded-full bg-[#f09b61] px-5 py-2.5 text-sm font-medium text-[#1f2a24] transition-transform hover:-translate-y-0.5"
                >
                  Open Settings
                </a>
                <a
                  href="/profile"
                  className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-medium text-white/90 transition-colors hover:bg-white/8"
                >
                  Update CV
                </a>
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-medium text-white/90 transition-colors hover:bg-white/8"
                >
                  Log out
                </button>
              </div>

              <div className="mt-8 flex flex-wrap gap-2">
                {skillsPreview.length > 0 ? skillsPreview.map((skill: string) => (
                  <span
                    key={skill}
                    className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs text-[#ede6dc]"
                  >
                    {skill}
                  </span>
                )) : (
                  <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs text-[#ede6dc]">
                    Upload your CV to personalize the cockpit
                  </span>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <div className="rounded-[26px] border border-white/10 bg-white/8 p-5 backdrop-blur-sm">
                <p className="text-xs uppercase tracking-[0.22em] text-[#d7cab8]">Candidate Signal</p>
                <p className="mt-3 text-2xl font-semibold text-white">
                  {profile?.currentTitle || "Profile not parsed yet"}
                </p>
                <p className="mt-2 text-sm text-[#d6cec1]">
                  {profile ? `${profile.skills?.length || 0} skills detected` : "No CV intelligence loaded yet"}
                </p>
              </div>

              <div className="rounded-[26px] border border-white/10 bg-[#f8f3ea] p-5 text-[#1f2a24]">
                <p className="text-xs uppercase tracking-[0.22em] text-[#7b715f]">Momentum</p>
                <p className="mt-2 text-4xl font-bold">{stats.applied}</p>
                <p className="mt-2 text-sm text-[#5c5448]">
                  Applications already landed for this account.
                </p>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#e7ded1]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#346959] to-[#f09b61] transition-all duration-500"
                    style={{ width: `${Math.min(Math.max(progress, stats.applied * 10), 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {statCards.map((card) => (
            <div
              key={card.label}
              className="group relative overflow-hidden rounded-[26px] border border-black/5 bg-[#fbf7f0]/90 p-5 shadow-[0_18px_40px_rgba(44,36,24,0.08)]"
            >
              <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${card.accent}`} />
              <p className="text-xs uppercase tracking-[0.2em] text-[#7b715f]">{card.label}</p>
              <p className="mt-4 text-4xl font-bold text-[#1c231f]">{card.value}</p>
              <p className="mt-3 text-sm leading-6 text-[#655c52]">{card.note}</p>
            </div>
          ))}
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
          <div className="space-y-6">
            {/* Chrome Extension card */}
            <div className="rounded-[28px] border border-black/5 bg-[#1f2a24] p-5 text-[#f8f3ea] shadow-[0_18px_40px_rgba(44,36,24,0.12)] md:p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-[#a0bfb4]">LinkedIn Automation</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Chrome Extension</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[#d8d1c4]">
                    The LinkedIn bot runs via your browser extension — no server needed. It reads your profile from this app and saves every application back here automatically.
                  </p>
                </div>
                <a
                  href="/settings"
                  className="shrink-0 rounded-full border border-white/15 px-5 py-2.5 text-sm font-medium text-white/90 transition-colors hover:bg-white/8"
                >
                  App Settings →
                </a>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {[
                  { step: "1", title: "Load extension", desc: "Open chrome://extensions, enable Dev mode, click Load unpacked, select the chrome-extension folder." },
                  { step: "2", title: "Configure popup", desc: "Click the extension icon. Set App URL, Extension Secret, search query, phone, city, salary in Settings tab." },
                  { step: "3", title: "Run", desc: "Switch to Run tab, click Start Auto-Apply. The bot opens LinkedIn, finds Easy Apply jobs and applies automatically." },
                ].map((item) => (
                  <div key={item.step} className="rounded-[20px] border border-white/10 bg-white/6 p-4">
                    <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-[#f09b61] text-xs font-bold text-[#1f2a24]">
                      {item.step}
                    </div>
                    <p className="text-sm font-semibold text-white">{item.title}</p>
                    <p className="mt-1 text-xs leading-5 text-[#c8c0b4]">{item.desc}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-[18px] border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-[#a0bfb4]">Extension Secret</p>
                <p className="mt-1 font-mono text-sm text-[#f09b61]">autoapply-ext-secret-change-me</p>
                <p className="mt-2 text-xs text-[#9d968e]">Set this in the extension popup Settings tab and keep it matching your <code className="rounded bg-white/10 px-1">.env</code> EXTENSION_SECRET.</p>
              </div>
            </div>

            {/* TanitJobs bot */}
            <div className="rounded-[28px] border border-black/5 bg-[#fbf7f0]/90 p-5 shadow-[0_18px_40px_rgba(44,36,24,0.08)] md:p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-[#857866]">TanitJobs Bot</p>
                  <h2 className="mt-2 text-2xl font-semibold text-[#1f2a24]">Server-side runner</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6b6257]">
                    Runs TanitJobs applications directly from the server via Playwright. Set your credentials in Settings before running.
                  </p>
                </div>

                <button
                  onClick={running ? stopAutoApply : runAutoApply}
                  className={`shrink-0 rounded-full px-6 py-3 text-sm font-medium transition-all ${
                    running
                      ? "bg-[#a64632] text-white shadow-[0_12px_24px_rgba(166,70,50,0.24)] hover:-translate-y-0.5"
                      : "bg-[#1f2a24] text-white shadow-[0_12px_24px_rgba(31,42,36,0.2)] hover:-translate-y-0.5"
                  }`}
                >
                  {running ? "Stop bot" : "Run TanitJobs bot"}
                </button>
              </div>

              <div className="mt-6 rounded-[24px] bg-[#1d1e1c] p-4 text-sm text-white shadow-inner md:p-5">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${running ? "bg-emerald-400 animate-pulse" : "bg-stone-500"}`} />
                    <span className="text-xs uppercase tracking-[0.24em] text-[#b6ad9f]">
                      {running ? "Bot is live" : "Awaiting launch"}
                    </span>
                  </div>
                  <span className="text-xs text-[#978f84]">{progress}% progress</span>
                </div>

                <div className="mb-4 h-2 overflow-hidden rounded-full bg-white/8">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#346959] via-[#7ca48f] to-[#f09b61] transition-all duration-500"
                    style={{ width: `${Math.max(progress, 4)}%` }}
                  />
                </div>

                <div
                  ref={logRef}
                  className="max-h-[300px] space-y-2 overflow-y-auto rounded-[18px] border border-white/6 bg-black/20 p-3 font-mono text-xs"
                >
                  {log.length > 0 ? log.map((entry, index) => (
                    <div key={`${entry.time}-${index}`} className="flex gap-3">
                      <span className="shrink-0 text-[#7c766c]">{entry.time}</span>
                      <span className={logColor(entry.type)}>{entry.message}</span>
                    </div>
                  )) : (
                    <div className="text-[#8d867a]">
                      Start a TanitJobs run to stream application steps and save events here.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {profile?.cvFileName && (
              <div className="overflow-hidden rounded-[28px] border border-black/5 bg-[#f4e4cf] p-5 shadow-[0_18px_40px_rgba(44,36,24,0.08)] md:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-[#8a5c3e]">CV Intelligence</p>
                    <h3 className="mt-2 text-xl font-semibold text-[#332118]">{profile.cvFileName}</h3>
                    <p className="mt-2 text-sm text-[#6f5445]">
                      Parsed {profile.cvParsedAt ? new Date(profile.cvParsedAt).toLocaleDateString() : "recently"} with{" "}
                      {profile.skills?.length || 0} skill tags detected.
                    </p>
                  </div>
                  <a
                    href="/profile"
                    className="rounded-full border border-[#cda37f] px-4 py-2 text-xs font-medium text-[#6d4329] transition-colors hover:bg-white/35"
                  >
                    Update
                  </a>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  {(profile.skills?.slice(0, 10) || []).map((skill: string) => (
                    <span
                      key={skill}
                      className="rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-[#5c4336]"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <a
                href="/optimize"
                className="block rounded-[28px] border border-black/5 bg-[#1f2a24] p-5 shadow-[0_18px_40px_rgba(44,36,24,0.08)] transition-transform hover:-translate-y-0.5"
              >
                <p className="text-xs uppercase tracking-[0.22em] text-[#a0bfb4]">Feature</p>
                <h3 className="mt-2 text-lg font-semibold text-white">CV Optimizer</h3>
                <p className="mt-1 text-sm text-[#d8d1c4]">Score your resume and check job match.</p>
                <span className="mt-3 inline-flex rounded-full bg-white/10 px-4 py-1.5 text-xs font-medium text-white">Open →</span>
              </a>
              <a
                href="/cv-builder"
                className="block rounded-[28px] border border-black/5 bg-[#346959] p-5 shadow-[0_18px_40px_rgba(44,36,24,0.08)] transition-transform hover:-translate-y-0.5"
              >
                <p className="text-xs uppercase tracking-[0.22em] text-[#a0d4bc]">Feature</p>
                <h3 className="mt-2 text-lg font-semibold text-white">ATS CV Builder</h3>
                <p className="mt-1 text-sm text-[#c8efe4]">Build & download an ATS-ready resume.</p>
                <span className="mt-3 inline-flex rounded-full bg-white/10 px-4 py-1.5 text-xs font-medium text-white">Build CV →</span>
              </a>
            </div>

            <div className="rounded-[28px] border border-black/5 bg-[#fbf7f0]/90 p-5 shadow-[0_18px_40px_rgba(44,36,24,0.08)] md:p-6">
              <p className="text-xs uppercase tracking-[0.22em] text-[#857866]">Quick Links</p>
              <h3 className="mt-2 text-xl font-semibold text-[#1f2a24]">Tools &amp; Pages</h3>
              <div className="mt-5 space-y-3">
                {[
                  { href: "/profile", label: "Profile / CV Upload", desc: "Upload CV — extension reads it for form filling." },
                  { href: "/cv-builder", label: "ATS CV Builder", desc: "Build and download an ATS-optimized resume." },
                  { href: "/optimize", label: "CV Optimizer", desc: "Score your CV and match it against job descriptions." },
                  { href: "/applications", label: "All Applications", desc: "Full history of every job the bots applied to." },
                  { href: "/statistics", label: "Statistics", desc: "Charts and trends across your application history." },
                  { href: "/settings", label: "App Settings", desc: "Credentials, location preferences, and form answers." },
                ].map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    className="flex items-center justify-between rounded-[20px] border border-[#eee5d8] bg-white/75 p-4 transition-transform hover:-translate-y-0.5"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[#20231f]">{link.label}</p>
                      <p className="mt-0.5 text-xs text-[#6f675b]">{link.desc}</p>
                    </div>
                    <span className="text-[#9d8f80]">→</span>
                  </a>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-black/5 bg-[#fbf7f0]/90 p-5 shadow-[0_18px_40px_rgba(44,36,24,0.08)] md:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-[#857866]">Recent Activity</p>
                  <h3 className="mt-2 text-xl font-semibold text-[#1f2a24]">Recent applied jobs</h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-[#ece4d7] px-3 py-1 text-xs font-medium text-[#675f54]">
                    {applications.length} saved
                  </span>
                  <a
                    href="/applications"
                    className="rounded-full border border-[#ddd2c2] bg-white px-3 py-1 text-xs font-medium text-[#346959] transition-colors hover:bg-[#f6efe5]"
                  >
                    View all
                  </a>
                  <a
                    href="/statistics"
                    className="rounded-full border border-[#ddd2c2] bg-white px-3 py-1 text-xs font-medium text-[#5a6a8a] transition-colors hover:bg-[#f6efe5]"
                  >
                    Statistics
                  </a>
                  <a
                    href="/schedule"
                    className="rounded-full border border-[#ddd2c2] bg-white px-3 py-1 text-xs font-medium text-[#81573d] transition-colors hover:bg-[#f6efe5]"
                  >
                    Scheduler
                  </a>
                </div>
              </div>

              {recentApplications.length > 0 ? (
                <div className="mt-5 space-y-3">
                  {recentApplications.map((application) => (
                    <div
                      key={application.id}
                      className="rounded-[20px] border border-[#eee5d8] bg-white/75 p-4 transition-transform hover:-translate-y-0.5"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 pr-2 text-sm font-semibold leading-5 text-[#20231f]">
                            {application.job?.title || "Untitled job"}
                          </p>
                          <p className="mt-1 line-clamp-2 pr-2 text-xs leading-5 text-[#6a6258]">
                            {application.job?.company || "Unknown company"}
                            {application.job?.location ? ` · ${application.job.location}` : ""}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {application.job?.platform && (
                              <span className="rounded-full bg-[#f4e4cf] px-2.5 py-1 text-[11px] font-medium text-[#81573d]">
                                {application.job.platform}
                              </span>
                            )}
                            {typeof application.matchScore === "number" && (
                              <span className="rounded-full bg-[#edf4ef] px-2.5 py-1 text-[11px] font-medium text-[#346959]">
                                Match {application.matchScore}%
                              </span>
                            )}
                          </div>
                        </div>
                        <span className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-medium ${
                          application.status === "APPLIED"
                            ? "bg-emerald-50 text-emerald-700"
                            : application.status === "INTERVIEW"
                              ? "bg-amber-50 text-amber-700"
                              : application.status === "PENDING"
                                ? "bg-stone-100 text-stone-600"
                                : "bg-rose-50 text-rose-600"
                        }`}>
                          {application.status}
                        </span>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-4 text-xs text-[#80776d]">
                        <span className="min-w-0 truncate">
                          {application.appliedAt
                            ? `Applied ${new Date(application.appliedAt).toLocaleString()}`
                            : `Created ${new Date(application.createdAt).toLocaleString()}`}
                        </span>
                        {application.job?.url && (
                          <a
                            href={application.job.url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-[#346959] hover:underline"
                          >
                            View job
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-5 rounded-[20px] border border-dashed border-[#d9cfbf] bg-white/55 p-5 text-sm text-[#6f675b]">
                  Your saved applications will appear here once the bot lands its first submission.
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
