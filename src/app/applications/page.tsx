"use client"

import { signOut } from "next-auth/react"
import { useEffect, useMemo, useState } from "react"

type Stats = {
  total: number
  applied: number
  interview: number
  pending: number
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

export default function ApplicationsPage() {
  const [applications, setApplications] = useState<ApplicationItem[]>([])
  const [stats, setStats] = useState<Stats>({ total: 0, applied: 0, interview: 0, pending: 0 })
  const [statusFilter, setStatusFilter] = useState("ALL")

  useEffect(() => {
    async function loadData() {
      const res = await fetch("/api/apply")
      const data = await res.json()
      if (data?.applications) setApplications(data.applications)
      if (data?.stats) setStats(data.stats)
    }

    loadData()
  }, [])

  const filteredApplications = useMemo(() => {
    if (statusFilter === "ALL") return applications
    return applications.filter((application) => application.status === statusFilter)
  }, [applications, statusFilter])

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <section className="relative overflow-hidden rounded-[32px] border border-black/5 bg-[#1f2a24] px-6 py-7 text-[#f8f3ea] shadow-[0_24px_70px_rgba(35,34,25,0.18)] md:px-10 md:py-10">
          <div className="absolute -left-10 top-0 h-40 w-40 rounded-full bg-[#f09b61]/20 blur-3xl" />
          <div className="absolute right-0 top-0 h-52 w-52 rounded-full bg-[#6da086]/20 blur-3xl" />

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.24em] text-[#d9cbb9]">
                Application history
              </div>
              <h1 className="mt-5 text-3xl font-bold md:text-5xl">All your saved applications</h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-[#d8d1c4] md:text-base">
                Browse your full application history with more room, better status visibility, and a cleaner layout than the dashboard preview.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <a
                href="/dashboard"
                className="rounded-full bg-[#f09b61] px-5 py-2.5 text-sm font-medium text-[#1f2a24] transition-transform hover:-translate-y-0.5"
              >
                Back to dashboard
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
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Total Saved", value: stats.total },
            { label: "Applied", value: stats.applied },
            { label: "Interviews", value: stats.interview },
            { label: "Pending", value: stats.pending },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-[26px] border border-black/5 bg-[#fbf7f0]/90 p-5 shadow-[0_18px_40px_rgba(44,36,24,0.08)]"
            >
              <p className="text-xs uppercase tracking-[0.2em] text-[#7b715f]">{item.label}</p>
              <p className="mt-4 text-4xl font-bold text-[#1c231f]">{item.value}</p>
            </div>
          ))}
        </section>

        <section className="mt-6 rounded-[28px] border border-black/5 bg-[#fbf7f0]/90 p-5 shadow-[0_18px_40px_rgba(44,36,24,0.08)] md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-[#857866]">Saved jobs</p>
              <h2 className="mt-2 text-2xl font-semibold text-[#1f2a24]">Complete application archive</h2>
            </div>

            <div className="flex flex-wrap gap-2">
              {["ALL", "APPLIED", "INTERVIEW", "PENDING"].map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className={`rounded-full px-4 py-2 text-xs font-medium transition-all ${
                    statusFilter === status
                      ? "bg-[#1f2a24] text-white"
                      : "bg-white text-[#5f564d] hover:bg-[#f2ebe0]"
                  }`}
                >
                  {status === "ALL" ? "All" : status}
                </button>
              ))}
            </div>
          </div>

          {filteredApplications.length > 0 ? (
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {filteredApplications.map((application) => (
                <div
                  key={application.id}
                  className="rounded-[22px] border border-[#eee5d8] bg-white/80 p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-base font-semibold leading-6 text-[#20231f]">
                        {application.job?.title || "Untitled job"}
                      </p>
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#6a6258]">
                        {application.job?.company || "Unknown company"}
                        {application.job?.location ? ` · ${application.job.location}` : ""}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
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

                  <div className="mt-4 flex items-center justify-between gap-4 text-xs text-[#80776d]">
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
            <div className="mt-6 rounded-[20px] border border-dashed border-[#d9cfbf] bg-white/55 p-5 text-sm text-[#6f675b]">
              No applications match this filter yet.
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
