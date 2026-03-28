"use client"

import { signOut } from "next-auth/react"
import { useEffect, useState } from "react"

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const DAY_FULL   = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

type ScheduleRun = {
  id: string
  startedAt: string
  finishedAt: string | null
  applied: number
  skipped: number
  failed: number
  status: "running" | "done" | "error"
  errorMsg: string | null
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

function getNextRun(time: string, days: number[]): string {
  if (!days.length) return "—"
  const now = new Date()
  const [hh, mm] = time.split(":").map(Number)
  for (let i = 0; i < 8; i++) {
    const candidate = new Date(now)
    candidate.setDate(now.getDate() + i)
    candidate.setHours(hh, mm, 0, 0)
    if (candidate > now && days.includes(candidate.getDay())) {
      return candidate.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    }
  }
  return "—"
}

export default function SchedulePage() {
  const [enabled, setEnabled]   = useState(false)
  const [time, setTime]         = useState("09:00")
  const [days, setDays]         = useState<number[]>([1, 2, 3, 4, 5])
  const [lastRunAt, setLastRunAt] = useState<string | null>(null)
  const [runs, setRuns]         = useState<ScheduleRun[]>([])
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    async function load() {
      const [schedRes, runsRes] = await Promise.all([
        fetch("/api/schedule"),
        fetch("/api/schedule/runs"),
      ])
      const sched = await schedRes.json()
      const runData = await runsRes.json()
      setEnabled(sched.enabled ?? false)
      setTime(sched.time ?? "09:00")
      setDays(sched.days ?? [1, 2, 3, 4, 5])
      setLastRunAt(sched.lastRunAt ?? null)
      if (Array.isArray(runData)) setRuns(runData)
      setLoading(false)
    }
    load()
  }, [])

  function toggleDay(d: number) {
    setDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort())
  }

  async function save() {
    setSaving(true)
    setSaved(false)
    await fetch("/api/schedule", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled, time, days }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const nextRun = enabled && days.length ? getNextRun(time, days) : null

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#6da086] border-t-transparent" />
      </main>
    )
  }

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 lg:px-10">
      <div className="mx-auto max-w-4xl space-y-6">

        {/* Header */}
        <section className="relative overflow-hidden rounded-[32px] border border-black/5 bg-[#1f2a24] px-6 py-7 text-[#f8f3ea] shadow-[0_24px_70px_rgba(35,34,25,0.18)] md:px-10 md:py-10">
          <div className="absolute -left-10 top-0 h-40 w-40 rounded-full bg-[#f09b61]/20 blur-3xl" />
          <div className="absolute right-0 top-0 h-52 w-52 rounded-full bg-[#6da086]/20 blur-3xl" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.24em] text-[#d9cbb9]">
                Automation
              </div>
              <h1 className="mt-5 text-3xl font-bold md:text-5xl">Daily Scheduler</h1>
              <p className="mt-4 max-w-xl text-sm leading-6 text-[#d8d1c4] md:text-base">
                Set a daily time and the bot will run automatically — no need to start it manually.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <a
                href="/dashboard"
                className="rounded-full bg-[#f09b61] px-5 py-2.5 text-sm font-medium text-[#1f2a24] transition-transform hover:-translate-y-0.5"
              >
                Dashboard
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

        {/* Schedule config card */}
        <section className="rounded-[28px] border border-black/5 bg-[#fbf7f0]/90 p-6 shadow-[0_18px_40px_rgba(44,36,24,0.08)] md:p-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-[#857866]">Auto-run</p>
              <h2 className="mt-1 text-xl font-semibold text-[#1f2a24]">Schedule settings</h2>
            </div>
            {/* Enable toggle */}
            <button
              type="button"
              onClick={() => setEnabled((v) => !v)}
              className={`relative h-7 w-12 rounded-full transition-colors ${enabled ? "bg-[#6da086]" : "bg-[#d9cfbf]"}`}
            >
              <span
                className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${enabled ? "left-6" : "left-1"}`}
              />
            </button>
          </div>

          <div className={`mt-6 space-y-6 transition-opacity ${enabled ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
            {/* Time picker */}
            <div>
              <label className="block text-sm font-medium text-[#4a4238]">Run time</label>
              <div className="mt-2 flex items-center gap-3">
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="rounded-2xl border border-[#ddd4c4] bg-white px-4 py-3 text-base font-semibold text-[#1f2a24] focus:outline-none focus:ring-2 focus:ring-[#6da086]/40"
                />
                <span className="text-sm text-[#7b715f]">every selected day</span>
              </div>
            </div>

            {/* Day selector */}
            <div>
              <label className="block text-sm font-medium text-[#4a4238]">Days of the week</label>
              <div className="mt-3 flex flex-wrap gap-2">
                {DAY_LABELS.map((label, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleDay(i)}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
                      days.includes(i)
                        ? "bg-[#1f2a24] text-white"
                        : "bg-white border border-[#ddd4c4] text-[#5f564d] hover:bg-[#f2ebe0]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Next run info */}
            {nextRun && (
              <div className="rounded-[18px] bg-[#edf4ef] px-5 py-4">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#346959]">Next scheduled run</p>
                <p className="mt-1 text-base font-semibold text-[#1f2a24]">{nextRun}</p>
                {days.length > 0 && (
                  <p className="mt-0.5 text-xs text-[#5a7d6a]">
                    Repeats every {days.map((d) => DAY_FULL[d]).join(", ")} at {time}
                  </p>
                )}
              </div>
            )}

            {!enabled && (
              <div className="rounded-[18px] bg-[#f4e4cf]/60 px-5 py-4">
                <p className="text-sm text-[#81573d]">Scheduler is disabled. Toggle it on to activate.</p>
              </div>
            )}
          </div>

          {/* Last run */}
          {lastRunAt && (
            <p className="mt-5 text-xs text-[#9a9080]">Last run: {formatTime(lastRunAt)}</p>
          )}

          {/* Save button */}
          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-full bg-[#1f2a24] px-7 py-3 text-sm font-medium text-white transition-transform hover:-translate-y-0.5 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save schedule"}
            </button>
            {saved && <span className="text-sm text-[#6da086] font-medium">Saved!</span>}
          </div>
        </section>

        {/* Run history */}
        <section className="rounded-[28px] border border-black/5 bg-[#fbf7f0]/90 p-6 shadow-[0_18px_40px_rgba(44,36,24,0.08)] md:p-8">
          <p className="text-xs uppercase tracking-[0.22em] text-[#857866]">History</p>
          <h2 className="mt-1 text-xl font-semibold text-[#1f2a24]">Recent automated runs</h2>

          {runs.length === 0 ? (
            <div className="mt-6 rounded-[20px] border border-dashed border-[#d9cfbf] bg-white/55 p-5 text-sm text-[#6f675b]">
              No runs yet. Once the scheduler fires, results will appear here.
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {runs.map((run) => (
                <div
                  key={run.id}
                  className="flex flex-col gap-3 rounded-[20px] border border-[#eee5d8] bg-white/80 p-5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#1f2a24]">{formatTime(run.startedAt)}</p>
                    {run.finishedAt && (
                      <p className="mt-0.5 text-xs text-[#7b715f]">
                        Finished {formatTime(run.finishedAt)}
                      </p>
                    )}
                    {run.errorMsg && (
                      <p className="mt-1 text-xs text-red-500">{run.errorMsg}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {run.status === "running" && (
                      <span className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                        Running
                      </span>
                    )}
                    {run.status === "done" && (
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">Done</span>
                    )}
                    {run.status === "error" && (
                      <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-medium text-rose-600">Error</span>
                    )}
                    <div className="flex gap-3 text-sm">
                      <span className="font-semibold text-[#346959]">{run.applied} applied</span>
                      <span className="text-[#9a9080]">{run.skipped} skipped</span>
                      {run.failed > 0 && <span className="text-rose-500">{run.failed} failed</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </main>
  )
}
