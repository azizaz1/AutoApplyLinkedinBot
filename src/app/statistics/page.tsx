"use client"

import { useEffect, useState } from "react"

// ── Types ─────────────────────────────────────────────────────────────────────

type Overview = {
  total: number
  applied: number
  interviews: number
  failed: number
  rejected: number
  pending: number
  offers: number
  todayCount: number
  thisWeekCount: number
  avgMatchScore: number
  streak: number
  successRate: number
}

type StatsData = {
  overview: Overview
  byDay: { date: string; count: number }[]
  byStatus: { status: string; count: number; color: string }[]
  byPlatform: { platform: string; count: number }[]
  topCompanies: { company: string; count: number }[]
  recentActivity: { date: string; title: string; company: string; url: string | null; status: string }[]
}

// ── Bar Chart ─────────────────────────────────────────────────────────────────

function BarChart({ data }: { data: { date: string; count: number }[] }) {
  const max = Math.max(...data.map(d => d.count), 1)
  const W = 630, H = 88
  const gap = 2
  const barW = W / data.length - gap

  const labels: { x: number; label: string }[] = []
  data.forEach((d, i) => {
    if (i === 0 || i % 7 === 0 || i === data.length - 1) {
      const dt = new Date(d.date + "T00:00:00")
      labels.push({
        x: i * (W / data.length) + barW / 2,
        label: dt.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      })
    }
  })

  return (
    <svg viewBox={`0 0 ${W} ${H + 22}`} className="w-full" aria-label="Applications per day">
      {data.map((d, i) => {
        const bh = d.count > 0 ? Math.max((d.count / max) * H, 5) : 2
        const x = i * (W / data.length)
        const y = H - bh
        return (
          <g key={d.date}>
            <rect x={x} y={y} width={barW} height={bh} rx={3}
              fill={d.count > 0 ? "#f09b61" : "#e5ddd3"}
            />
            {d.count > 0 && d.count === max && (
              <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize={8} fill="#f09b61" fontWeight="600">
                {d.count}
              </text>
            )}
          </g>
        )
      })}
      {labels.map((l, i) => (
        <text key={i} x={l.x} y={H + 16} textAnchor="middle" fontSize={8.5} fill="#a09484">
          {l.label}
        </text>
      ))}
    </svg>
  )
}

// ── Donut Chart ───────────────────────────────────────────────────────────────

function DonutChart({ data }: { data: { status: string; count: number; color: string }[] }) {
  const R = 62, cx = 78, cy = 78
  const circ = 2 * Math.PI * R
  const total = data.reduce((s, d) => s + d.count, 0)

  let accumulated = 0
  const slices = data.map(d => {
    const dash = total > 0 ? (d.count / total) * circ : 0
    const s = { ...d, dash, dashOffset: circ - accumulated }
    accumulated += dash
    return s
  })

  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
      <svg viewBox="0 0 156 156" className="w-36 shrink-0 mx-auto sm:mx-0" aria-label="Status breakdown">
        {total === 0 ? (
          <circle cx={cx} cy={cy} r={R} fill="none" stroke="#e5ddd3" strokeWidth={24} />
        ) : slices.map(s => (
          <circle
            key={s.status}
            cx={cx} cy={cy} r={R}
            fill="none"
            stroke={s.color}
            strokeWidth={24}
            strokeDasharray={`${s.dash} ${circ - s.dash}`}
            strokeDashoffset={s.dashOffset}
            style={{ transform: "rotate(-90deg)", transformOrigin: `${cx}px ${cy}px` }}
          />
        ))}
        <text x={cx} y={cy - 7} textAnchor="middle" fontSize={26} fontWeight="700" fill="#1c231f">{total}</text>
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize={10} fill="#9d9080">total</text>
      </svg>
      <ul className="flex flex-col gap-2.5 min-w-0">
        {slices.map(s => (
          <li key={s.status} className="flex items-center gap-2.5 text-sm">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: s.color }} />
            <span className="font-medium text-[#3a3530] flex-1">{s.status}</span>
            <span className="text-[#7b715f] tabular-nums">{s.count}</span>
            <span className="text-[#b0a090] text-xs tabular-nums w-10 text-right">
              {total > 0 ? Math.round((s.count / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Platform Bar ──────────────────────────────────────────────────────────────

const PLATFORM_COLORS: Record<string, string> = {
  LINKEDIN:  "#0a66c2",
  TANITJOBS: "#f09b61",
  KEEJOB:    "#6da086",
}

function PlatformBar({ platform, count, max }: { platform: string; count: number; max: number }) {
  const pct = max > 0 ? (count / max) * 100 : 0
  const color = PLATFORM_COLORS[platform] ?? "#c8b99a"
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: color }} />
          <span className="text-sm font-medium text-[#2c2620]">{platform}</span>
        </div>
        <span className="text-sm text-[#7b715f] tabular-nums">{count} apps</span>
      </div>
      <div className="h-2 rounded-full bg-[#ece6dc] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  )
}

// ── Status color helper ───────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  APPLIED:   "#6da086",
  INTERVIEW: "#f09b61",
  OFFER:     "#4d9c73",
  PENDING:   "#b0a48a",
  FAILED:    "#e07070",
  REJECTED:  "#cc7777",
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function StatisticsPage() {
  const [data, setData] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/statistics")
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#f5f0e8]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-[#f09b61] border-t-transparent animate-spin" />
          <p className="text-sm text-[#7b715f]">Loading statistics…</p>
        </div>
      </main>
    )
  }

  if (!data) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#f5f0e8]">
        <p className="text-sm text-rose-600">Failed to load statistics. Try refreshing.</p>
      </main>
    )
  }

  const { overview, byDay, byStatus, byPlatform, topCompanies, recentActivity } = data
  const maxPlatform = Math.max(...byPlatform.map(p => p.count), 1)
  const maxDaily = Math.max(...byDay.map(d => d.count), 0)

  const kpis = [
    { label: "Total Applications", value: overview.total,         note: "all time" },
    { label: "Applied",            value: overview.applied,        note: `${overview.successRate}% interview rate` },
    { label: "Interviews",         value: overview.interviews,     note: overview.offers > 0 ? `${overview.offers} offer${overview.offers !== 1 ? "s" : ""}` : "so far" },
    { label: "Today",              value: overview.todayCount,     note: `${overview.thisWeekCount} this week` },
    { label: "Avg Match Score",    value: `${overview.avgMatchScore}%`, note: "across all jobs" },
    { label: "Active Streak",      value: `${overview.streak}d`,   note: "consecutive days" },
  ]

  return (
    <main className="min-h-screen bg-[#f5f0e8] px-4 py-6 md:px-8 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-5">

        {/* ── Hero ── */}
        <section className="relative overflow-hidden rounded-[32px] border border-black/5 bg-[#1f2a24] px-6 py-8 text-[#f8f3ea] shadow-[0_24px_70px_rgba(35,34,25,0.18)] md:px-10 md:py-10">
          <div className="absolute -left-10 top-0 h-40 w-40 rounded-full bg-[#f09b61]/20 blur-3xl pointer-events-none" />
          <div className="absolute right-0 top-0 h-52 w-52 rounded-full bg-[#6da086]/20 blur-3xl pointer-events-none" />

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.24em] text-[#d9cbb9]">
                Analytics
              </div>
              <h1 className="mt-5 text-3xl font-bold md:text-5xl">Statistics</h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[#d0c8ba] md:text-base">
                Your job search at a glance — progress, success rates, and daily activity.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 shrink-0">
              <a href="/dashboard"
                className="rounded-full bg-[#f09b61] px-5 py-2.5 text-sm font-medium text-[#1f2a24] transition-transform hover:-translate-y-0.5">
                Dashboard
              </a>
              <a href="/applications"
                className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-medium text-white/85 transition-colors hover:bg-white/8">
                All applications
              </a>
            </div>
          </div>
        </section>

        {/* ── KPI Cards ── */}
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {kpis.map(k => (
            <div key={k.label}
              className="rounded-[26px] border border-black/5 bg-[#fbf7f0]/90 p-5 shadow-[0_18px_40px_rgba(44,36,24,0.07)]">
              <p className="text-[10px] uppercase tracking-[0.22em] text-[#7b715f]">{k.label}</p>
              <p className="mt-3 text-4xl font-bold tracking-tight text-[#1c231f]">{k.value}</p>
              <p className="mt-1.5 text-xs text-[#a09080]">{k.note}</p>
            </div>
          ))}
        </section>

        {/* ── Bar chart ── */}
        <section className="rounded-[28px] border border-black/5 bg-[#fbf7f0]/90 p-6 shadow-[0_18px_40px_rgba(44,36,24,0.07)]">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-[#857866]">Activity</p>
              <h2 className="mt-1 text-xl font-semibold text-[#1f2a24]">Applications — last 30 days</h2>
            </div>
            <div className="shrink-0 rounded-2xl bg-[#f0e8da] px-4 py-2 text-right">
              <p className="text-[10px] text-[#8a7a68] uppercase tracking-wider">Best day</p>
              <p className="text-xl font-bold text-[#1c231f]">{maxDaily}</p>
            </div>
          </div>
          <BarChart data={byDay} />
        </section>

        {/* ── Donut + Top companies ── */}
        <section className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-[28px] border border-black/5 bg-[#fbf7f0]/90 p-6 shadow-[0_18px_40px_rgba(44,36,24,0.07)]">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[#857866]">Breakdown</p>
            <h2 className="mt-1 mb-6 text-xl font-semibold text-[#1f2a24]">Status distribution</h2>
            {byStatus.length > 0
              ? <DonutChart data={byStatus} />
              : <p className="text-sm text-[#9d9080]">No data yet — run the bot to start applying.</p>
            }
          </div>

          <div className="rounded-[28px] border border-black/5 bg-[#fbf7f0]/90 p-6 shadow-[0_18px_40px_rgba(44,36,24,0.07)]">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[#857866]">Companies</p>
            <h2 className="mt-1 mb-6 text-xl font-semibold text-[#1f2a24]">Top companies applied to</h2>
            {topCompanies.length > 0 ? (
              <ul className="space-y-3">
                {topCompanies.map((c, i) => (
                  <li key={c.company} className="flex items-center gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#f0e8da] text-[10px] font-bold text-[#7b6a55]">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#2c2620]">{c.company}</span>
                    <span className="text-xs text-[#8a7a68] tabular-nums shrink-0">{c.count} app{c.count !== 1 ? "s" : ""}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[#9d9080]">No applications yet.</p>
            )}
          </div>
        </section>

        {/* ── Platform breakdown ── */}
        {byPlatform.length > 0 && (
          <section className="rounded-[28px] border border-black/5 bg-[#fbf7f0]/90 p-6 shadow-[0_18px_40px_rgba(44,36,24,0.07)]">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[#857866]">Platforms</p>
            <h2 className="mt-1 mb-6 text-xl font-semibold text-[#1f2a24]">Applications by platform</h2>
            <div className="space-y-5">
              {byPlatform.map(p => (
                <PlatformBar key={p.platform} platform={p.platform} count={p.count} max={maxPlatform} />
              ))}
            </div>
          </section>
        )}

        {/* ── Recent activity timeline ── */}
        {recentActivity.length > 0 && (
          <section className="rounded-[28px] border border-black/5 bg-[#fbf7f0]/90 p-6 shadow-[0_18px_40px_rgba(44,36,24,0.07)]">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[#857866]">Timeline</p>
            <h2 className="mt-1 mb-6 text-xl font-semibold text-[#1f2a24]">Recent activity</h2>

            <ul className="relative space-y-0 before:absolute before:left-[11px] before:top-2 before:h-[calc(100%-18px)] before:w-px before:bg-[#e4dbd0]">
              {recentActivity.map((item, i) => {
                const color = STATUS_COLORS[item.status] ?? "#c8b99a"
                const dt = new Date(item.date)
                const dateStr = dt.toLocaleDateString("en-US", { month: "short", day: "numeric" })
                const timeStr = dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
                return (
                  <li key={i} className="relative flex gap-4 pb-5 last:pb-0">
                    {/* Dot */}
                    <span
                      className="relative mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-[#fbf7f0]"
                      style={{ background: color }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-white/80" />
                    </span>

                    {/* Content */}
                    <div className="min-w-0 flex-1 pt-0.5">
                      {item.url ? (
                        <a href={item.url} target="_blank" rel="noreferrer"
                          className="block truncate text-sm font-semibold text-[#1f2a24] hover:underline">
                          {item.title}
                        </a>
                      ) : (
                        <p className="truncate text-sm font-semibold text-[#1f2a24]">{item.title}</p>
                      )}
                      <p className="mt-0.5 truncate text-xs text-[#7b715f]">{item.company}</p>
                    </div>

                    {/* Status + date */}
                    <div className="shrink-0 text-right">
                      <span
                        className="rounded-full px-2.5 py-1 text-[10px] font-semibold"
                        style={{ background: `${color}22`, color }}
                      >
                        {item.status}
                      </span>
                      <p className="mt-1.5 text-[10px] text-[#a09080]">{dateStr}</p>
                      <p className="text-[10px] text-[#b8ab9a]">{timeStr}</p>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

      </div>
    </main>
  )
}
