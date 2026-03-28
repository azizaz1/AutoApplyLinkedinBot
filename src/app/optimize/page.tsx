"use client"

import { useState } from "react"

interface CVScore {
  overall: number
  sections: { summary: number; skills: number; experience: number; education: number }
  suggestions: string[]
  missingKeywords: string[]
  strengths: string[]
}

interface MatchResult {
  score: number
  reason: string
  shouldApply: boolean
}

function ScoreRing({ value, size = 120 }: { value: number; size?: number }) {
  const r = (size - 16) / 2
  const circ = 2 * Math.PI * r
  const filled = ((100 - value) / 100) * circ
  const color = value >= 75 ? "#346959" : value >= 50 ? "#c97d2e" : "#c0392b"
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e8e0d4" strokeWidth={8} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={8}
        strokeDasharray={circ} strokeDashoffset={filled}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.8s ease" }}
      />
      <text
        x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central"
        className="rotate-90" style={{ transform: `rotate(90deg)`, transformOrigin: `${size / 2}px ${size / 2}px` }}
        fill={color} fontSize={size === 120 ? 26 : 18} fontWeight={700}
      >
        {value}
      </text>
    </svg>
  )
}

function SectionBar({ label, value }: { label: string; value: number }) {
  const color = value >= 75 ? "bg-[#346959]" : value >= 50 ? "bg-[#c97d2e]" : "bg-[#c0392b]"
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs font-medium text-[#5f564d]">
        <span className="capitalize">{label}</span>
        <span>{value}/100</span>
      </div>
      <div className="h-2 rounded-full bg-[#e8e0d4]">
        <div
          className={`h-2 rounded-full ${color} transition-all duration-700`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  )
}

export default function OptimizePage() {
  const [tab, setTab] = useState<"score" | "match">("score")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [score, setScore] = useState<CVScore | null>(null)
  const [match, setMatch] = useState<MatchResult | null>(null)
  const [targetRole, setTargetRole] = useState("")
  const [jobTitle, setJobTitle] = useState("")
  const [jobDesc, setJobDesc] = useState("")

  async function runScore() {
    setLoading(true); setError(null); setScore(null)
    try {
      const res = await fetch("/api/cv/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "score", jobTitle: targetRole }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed")
      setScore(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  async function runMatch() {
    if (!jobTitle || !jobDesc) { setError("Fill in both fields"); return }
    setLoading(true); setError(null); setMatch(null)
    try {
      const res = await fetch("/api/cv/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "match", jobTitle, jobDescription: jobDesc }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed")
      setMatch(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 lg:px-10">
      <div className="mx-auto max-w-5xl">

        {/* Header */}
        <section className="relative overflow-hidden rounded-[32px] border border-black/5 bg-[#1f2a24] px-6 py-7 text-[#f8f3ea] shadow-[0_24px_70px_rgba(35,34,25,0.18)] md:px-10 md:py-10">
          <div className="absolute -left-10 top-0 h-40 w-40 rounded-full bg-[#f09b61]/20 blur-3xl" />
          <div className="absolute right-0 top-0 h-52 w-52 rounded-full bg-[#6da086]/20 blur-3xl" />
          <div className="relative">
            <a href="/dashboard" className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.22em] text-[#d9cbb9]">
              Back to dashboard
            </a>
            <h1 className="mt-5 text-3xl font-bold md:text-4xl">CV Optimizer</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[#d8d1c4]">
              Score your resume with AI, find gaps, and check how well you match any job description.
            </p>
          </div>
        </section>

        {/* Tabs */}
        <div className="mt-6 flex gap-2">
          {(["score", "match"] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(null) }}
              className={`rounded-full px-5 py-2 text-sm font-medium transition-all ${
                tab === t
                  ? "bg-[#1f2a24] text-white shadow"
                  : "border border-black/10 bg-white/60 text-[#5f564d] hover:bg-white"
              }`}
            >
              {t === "score" ? "CV Score" : "Job Match"}
            </button>
          ))}
        </div>

        {/* CV Score tab */}
        {tab === "score" && (
          <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1.4fr]">
            <div className="rounded-[28px] border border-black/5 bg-[#fbf7f0]/90 p-6 shadow-[0_18px_40px_rgba(44,36,24,0.08)]">
              <p className="text-xs uppercase tracking-[0.18em] text-[#7c6f60]">Target role (optional)</p>
              <input
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
                placeholder="e.g. Senior Software Engineer"
                className="mt-3 w-full rounded-2xl border border-[#e0d5c6] bg-white/80 px-4 py-3 text-sm text-[#1f2a24] outline-none placeholder:text-[#b5a898] focus:border-[#346959]"
              />
              <p className="mt-2 text-xs text-[#9a8e82]">Leave blank for a general CV analysis</p>
              <button
                onClick={runScore}
                disabled={loading}
                className="mt-5 w-full rounded-full bg-[#1f2a24] py-3 text-sm font-medium text-white transition-transform hover:-translate-y-0.5 disabled:opacity-60"
              >
                {loading ? "Analyzing..." : "Analyze My CV"}
              </button>
              {error && <p className="mt-3 rounded-2xl bg-[#fff0ef] px-4 py-2 text-sm text-[#a2453b]">{error}</p>}

              {score && (
                <div className="mt-6 text-center">
                  <div className="flex justify-center">
                    <ScoreRing value={score.overall} size={130} />
                  </div>
                  <p className="mt-2 text-sm font-semibold text-[#1f2a24]">Overall Score</p>
                  <p className="text-xs text-[#7c6f60]">
                    {score.overall >= 75 ? "Strong CV" : score.overall >= 50 ? "Needs improvement" : "Needs significant work"}
                  </p>
                  <div className="mt-5 space-y-3">
                    {Object.entries(score.sections).map(([k, v]) => (
                      <SectionBar key={k} label={k} value={v} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {score ? (
              <div className="space-y-5">
                {/* Strengths */}
                <div className="rounded-[28px] border border-black/5 bg-[#d9efe6] p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#2d6e57]">Strengths</p>
                  <ul className="mt-3 space-y-2">
                    {score.strengths.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-[#1f3c30]">
                        <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-[#346959] text-center text-xs leading-5 text-white">{i + 1}</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Suggestions */}
                <div className="rounded-[28px] border border-black/5 bg-[#fbf7f0]/90 p-5 shadow-[0_18px_40px_rgba(44,36,24,0.08)]">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7c6f60]">How to improve</p>
                  <ul className="mt-3 space-y-3">
                    {score.suggestions.map((s, i) => (
                      <li key={i} className="flex items-start gap-3 rounded-2xl bg-white/70 px-4 py-3 text-sm text-[#3d3529]">
                        <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-[#f4e4cf] text-center text-xs font-bold leading-5 text-[#8a5c3e]">{i + 1}</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Missing keywords */}
                {score.missingKeywords.length > 0 && (
                  <div className="rounded-[28px] border border-black/5 bg-[#fff8f0] p-5 shadow-[0_18px_40px_rgba(44,36,24,0.08)]">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8a5c3e]">Missing keywords</p>
                    <p className="mt-1 text-xs text-[#9a7060]">Add these to your CV to rank higher in ATS systems</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {score.missingKeywords.map((kw) => (
                        <span key={kw} className="rounded-full border border-[#f0d8c0] bg-white px-3 py-1 text-xs text-[#7a4a28]">
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center rounded-[28px] border border-dashed border-[#ddd2c2] bg-[#fbf7f0]/60 p-10 text-center">
                <div>
                  <p className="text-3xl">📄</p>
                  <p className="mt-3 text-sm font-medium text-[#5f564d]">Your score will appear here</p>
                  <p className="mt-1 text-xs text-[#9a8e82]">Make sure you've uploaded a CV first</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Job Match tab */}
        {tab === "match" && (
          <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1fr]">
            <div className="rounded-[28px] border border-black/5 bg-[#fbf7f0]/90 p-6 shadow-[0_18px_40px_rgba(44,36,24,0.08)]">
              <p className="text-xs uppercase tracking-[0.18em] text-[#7c6f60]">Job title</p>
              <input
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="e.g. Backend Engineer"
                className="mt-3 w-full rounded-2xl border border-[#e0d5c6] bg-white/80 px-4 py-3 text-sm text-[#1f2a24] outline-none placeholder:text-[#b5a898] focus:border-[#346959]"
              />
              <p className="mt-4 text-xs uppercase tracking-[0.18em] text-[#7c6f60]">Job description</p>
              <textarea
                value={jobDesc}
                onChange={(e) => setJobDesc(e.target.value)}
                placeholder="Paste the full job description here..."
                rows={10}
                className="mt-3 w-full rounded-2xl border border-[#e0d5c6] bg-white/80 px-4 py-3 text-sm text-[#1f2a24] outline-none placeholder:text-[#b5a898] focus:border-[#346959] resize-none"
              />
              <button
                onClick={runMatch}
                disabled={loading}
                className="mt-4 w-full rounded-full bg-[#1f2a24] py-3 text-sm font-medium text-white transition-transform hover:-translate-y-0.5 disabled:opacity-60"
              >
                {loading ? "Checking match..." : "Check Match"}
              </button>
              {error && <p className="mt-3 rounded-2xl bg-[#fff0ef] px-4 py-2 text-sm text-[#a2453b]">{error}</p>}
            </div>

            {match ? (
              <div className="space-y-5">
                <div className="rounded-[28px] border border-black/5 bg-[#fbf7f0]/90 p-6 shadow-[0_18px_40px_rgba(44,36,24,0.08)]">
                  <p className="text-xs uppercase tracking-[0.18em] text-[#7c6f60]">Match result</p>
                  <div className="mt-4 flex items-center gap-5">
                    <ScoreRing value={match.score} size={100} />
                    <div>
                      <p className="text-2xl font-bold text-[#1f2a24]">{match.score}% match</p>
                      <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                        match.shouldApply
                          ? "bg-[#d9efe6] text-[#2d6e57]"
                          : "bg-[#fff0ef] text-[#a2453b]"
                      }`}>
                        {match.shouldApply ? "Good fit — apply!" : "Not a strong match"}
                      </span>
                    </div>
                  </div>
                  <div className="mt-5 rounded-2xl bg-white/70 p-4 text-sm leading-6 text-[#3d3529]">
                    {match.reason}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center rounded-[28px] border border-dashed border-[#ddd2c2] bg-[#fbf7f0]/60 p-10 text-center">
                <div>
                  <p className="text-3xl">🎯</p>
                  <p className="mt-3 text-sm font-medium text-[#5f564d]">Paste a job description to check your fit</p>
                  <p className="mt-1 text-xs text-[#9a8e82]">We'll compare it against your CV profile</p>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </main>
  )
}
