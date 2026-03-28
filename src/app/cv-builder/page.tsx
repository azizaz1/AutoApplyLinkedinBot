"use client"

import { useEffect, useRef, useState } from "react"

interface ExpEntry { title: string; company: string; from: string; to: string; description: string }
interface EduEntry { degree: string; school: string; year?: number | string }

interface CVData {
  fullName: string
  currentTitle: string
  email: string
  phone: string
  location: string
  linkedin: string
  summary: string
  skills: string[]
  languages: string[]
  experience: ExpEntry[]
  education: EduEntry[]
}

const empty: CVData = {
  fullName: "", currentTitle: "", email: "", phone: "", location: "", linkedin: "",
  summary: "",
  skills: [],
  languages: [],
  experience: [],
  education: [],
}

// ─── ATS Preview ─────────────────────────────────────────────────────────────

function ATSPreview({ cv }: { cv: CVData }) {
  return (
    <div id="ats-cv" className="bg-white font-['Arial',sans-serif] text-[#111] text-[13px] leading-[1.5] p-8 min-h-[297mm] w-full">
      {/* Header */}
      <div className="border-b-2 border-[#111] pb-3 mb-4">
        <h1 className="text-[22px] font-bold uppercase tracking-wide">{cv.fullName || "Your Name"}</h1>
        <p className="text-[14px] font-semibold mt-0.5">{cv.currentTitle || "Your Title"}</p>
        <div className="flex flex-wrap gap-x-4 mt-2 text-[12px] text-[#333]">
          {cv.email && <span>{cv.email}</span>}
          {cv.phone && <span>{cv.phone}</span>}
          {cv.location && <span>{cv.location}</span>}
          {cv.linkedin && <span>{cv.linkedin}</span>}
        </div>
      </div>

      {/* Summary */}
      {cv.summary && (
        <div className="mb-4">
          <h2 className="text-[13px] font-bold uppercase tracking-widest border-b border-[#999] pb-0.5 mb-2">Summary</h2>
          <p className="text-[12.5px] leading-[1.6] whitespace-pre-line">{cv.summary}</p>
        </div>
      )}

      {/* Experience */}
      {cv.experience.length > 0 && (
        <div className="mb-4">
          <h2 className="text-[13px] font-bold uppercase tracking-widest border-b border-[#999] pb-0.5 mb-2">Experience</h2>
          <div className="space-y-4">
            {cv.experience.map((e, i) => (
              <div key={i}>
                <div className="flex justify-between items-baseline">
                  <span className="font-bold text-[13px]">{e.title || "Job Title"}</span>
                  <span className="text-[11.5px] text-[#555]">{e.from}{e.to ? ` – ${e.to}` : ""}</span>
                </div>
                <p className="text-[12px] font-semibold text-[#333]">{e.company}</p>
                <p className="mt-1 text-[12px] leading-[1.6] whitespace-pre-line text-[#222]">{e.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Education */}
      {cv.education.length > 0 && (
        <div className="mb-4">
          <h2 className="text-[13px] font-bold uppercase tracking-widest border-b border-[#999] pb-0.5 mb-2">Education</h2>
          <div className="space-y-2">
            {cv.education.map((e, i) => (
              <div key={i} className="flex justify-between">
                <div>
                  <span className="font-bold text-[13px]">{e.degree}</span>
                  <span className="text-[12px] text-[#333]"> — {e.school}</span>
                </div>
                {e.year && <span className="text-[11.5px] text-[#555]">{e.year}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Skills */}
      {cv.skills.length > 0 && (
        <div className="mb-4">
          <h2 className="text-[13px] font-bold uppercase tracking-widest border-b border-[#999] pb-0.5 mb-2">Skills</h2>
          <p className="text-[12.5px]">{cv.skills.join(" · ")}</p>
        </div>
      )}

      {/* Languages */}
      {cv.languages.length > 0 && (
        <div className="mb-4">
          <h2 className="text-[13px] font-bold uppercase tracking-widest border-b border-[#999] pb-0.5 mb-2">Languages</h2>
          <p className="text-[12.5px]">{cv.languages.join(" · ")}</p>
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CVBuilderPage() {
  const [cv, setCV] = useState<CVData>(empty)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [enhancing, setEnhancing] = useState<string | null>(null) // "summary" | "exp-N"
  const [skillInput, setSkillInput] = useState("")
  const [langInput, setLangInput] = useState("")
  const printRef = useRef<HTMLDivElement>(null)

  // Load existing profile
  useEffect(() => {
    fetch("/api/cv").then(r => r.json()).then(({ profile }) => {
      if (profile) {
        setCV(prev => ({
          ...prev,
          fullName: profile.fullName || "",
          currentTitle: profile.currentTitle || "",
          summary: profile.summary || "",
          skills: profile.skills || [],
          languages: profile.languages || [],
          education: (profile.education as EduEntry[]) || [],
          experience: (profile.experience as ExpEntry[]) || [],
        }))
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  function set(field: keyof CVData, value: unknown) {
    setCV(prev => ({ ...prev, [field]: value }))
    setSaved(false)
  }

  async function save() {
    setSaving(true)
    await fetch("/api/cv", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: cv.fullName, currentTitle: cv.currentTitle,
        summary: cv.summary, skills: cv.skills, languages: cv.languages,
        education: cv.education, experience: cv.experience,
      }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  function downloadPDF() {
    window.print()
  }

  async function enhance(type: "summary" | "exp", idx?: number) {
    const key = type === "summary" ? "summary" : `exp-${idx}`
    setEnhancing(key)
    const text = type === "summary" ? cv.summary : cv.experience[idx!]?.description
    const context = type === "exp" ? { title: cv.experience[idx!]?.title, company: cv.experience[idx!]?.company } : undefined
    const res = await fetch("/api/cv/enhance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section: type === "summary" ? "summary" : "experience_description", text, context }),
    })
    const data = await res.json()
    if (data.enhanced) {
      if (type === "summary") set("summary", data.enhanced)
      else {
        const updated = [...cv.experience]
        updated[idx!] = { ...updated[idx!], description: data.enhanced }
        set("experience", updated)
      }
    }
    setEnhancing(null)
  }

  // Experience helpers
  function addExp() {
    set("experience", [...cv.experience, { title: "", company: "", from: "", to: "Present", description: "" }])
  }
  function updateExp(i: number, field: keyof ExpEntry, val: string) {
    const updated = [...cv.experience]
    updated[i] = { ...updated[i], [field]: val }
    set("experience", updated)
  }
  function removeExp(i: number) {
    set("experience", cv.experience.filter((_, idx) => idx !== i))
  }

  // Education helpers
  function addEdu() {
    set("education", [...cv.education, { degree: "", school: "", year: "" }])
  }
  function updateEdu(i: number, field: keyof EduEntry, val: string) {
    const updated = [...cv.education]
    updated[i] = { ...updated[i], [field]: val }
    set("education", updated)
  }
  function removeEdu(i: number) {
    set("education", cv.education.filter((_, idx) => idx !== i))
  }

  // Skills
  function addSkill() {
    const v = skillInput.trim()
    if (v && !cv.skills.includes(v)) set("skills", [...cv.skills, v])
    setSkillInput("")
  }
  function removeSkill(s: string) { set("skills", cv.skills.filter(x => x !== s)) }

  // Languages
  function addLang() {
    const v = langInput.trim()
    if (v && !cv.languages.includes(v)) set("languages", [...cv.languages, v])
    setLangInput("")
  }
  function removeLang(s: string) { set("languages", cv.languages.filter(x => x !== s)) }

  const inputCls = "w-full rounded-xl border border-[#e0d5c6] bg-white/80 px-3 py-2 text-sm text-[#1f2a24] outline-none placeholder:text-[#b5a898] focus:border-[#346959]"
  const labelCls = "block text-xs uppercase tracking-[0.15em] text-[#7c6f60] mb-1"
  const sectionCls = "rounded-[24px] border border-black/5 bg-[#fbf7f0]/90 p-5 shadow-[0_12px_30px_rgba(44,36,24,0.07)]"

  if (loading) return (
    <main className="min-h-screen flex items-center justify-center">
      <p className="text-sm text-[#7c6f60]">Loading your CV...</p>
    </main>
  )

  return (
    <>
      {/* Print styles — only the ATS CV prints */}
      <style>{`
        @media print {
          body > * { display: none !important; }
          #print-target { display: block !important; }
          #print-target { position: fixed; top: 0; left: 0; width: 100%; }
          #ats-cv { padding: 16mm !important; }
        }
      `}</style>

      {/* Hidden print target */}
      <div id="print-target" style={{ display: "none" }} ref={printRef}>
        <ATSPreview cv={cv} />
      </div>

      <main className="min-h-screen px-4 py-6 md:px-8">
        <div className="mx-auto max-w-7xl">

          {/* Header */}
          <section className="relative overflow-hidden rounded-[32px] border border-black/5 bg-[#1f2a24] px-6 py-7 text-[#f8f3ea] shadow-[0_24px_70px_rgba(35,34,25,0.18)] md:px-10 md:py-8">
            <div className="absolute -left-10 top-0 h-40 w-40 rounded-full bg-[#f09b61]/20 blur-3xl" />
            <div className="absolute right-0 top-0 h-52 w-52 rounded-full bg-[#6da086]/20 blur-3xl" />
            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <a href="/dashboard" className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.22em] text-[#d9cbb9]">
                  Back to dashboard
                </a>
                <h1 className="mt-4 text-2xl font-bold md:text-3xl">ATS CV Builder</h1>
                <p className="mt-2 text-sm text-[#d8d1c4]">Build a clean, ATS-optimized resume. No fancy design — just the content that gets you past filters.</p>
              </div>
              <div className="flex shrink-0 gap-3">
                <button
                  onClick={save}
                  disabled={saving}
                  className="rounded-full border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-50"
                >
                  {saving ? "Saving..." : saved ? "Saved!" : "Save"}
                </button>
                <button
                  onClick={downloadPDF}
                  className="rounded-full bg-[#f8f3ea] px-5 py-2.5 text-sm font-semibold text-[#1f2a24] transition-transform hover:-translate-y-0.5"
                >
                  Download PDF
                </button>
              </div>
            </div>
          </section>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_0.85fr]">
            {/* ── LEFT: Editor ── */}
            <div className="space-y-5">

              {/* Personal Info */}
              <div className={sectionCls}>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7c6f60] mb-4">Personal Info</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {([
                    ["fullName", "Full Name", "Jane Smith"],
                    ["currentTitle", "Job Title", "Senior Software Engineer"],
                    ["email", "Email", "jane@example.com"],
                    ["phone", "Phone", "+1 555 000 0000"],
                    ["location", "Location", "Tunis, Tunisia"],
                    ["linkedin", "LinkedIn URL", "linkedin.com/in/jane"],
                  ] as [keyof CVData, string, string][]).map(([field, label, placeholder]) => (
                    <div key={field}>
                      <label className={labelCls}>{label}</label>
                      <input
                        value={cv[field] as string}
                        onChange={e => set(field, e.target.value)}
                        placeholder={placeholder}
                        className={inputCls}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Summary */}
              <div className={sectionCls}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7c6f60]">Professional Summary</p>
                  <button
                    onClick={() => enhance("summary")}
                    disabled={enhancing === "summary" || !cv.summary}
                    className="rounded-full bg-[#1f2a24] px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
                  >
                    {enhancing === "summary" ? "Enhancing..." : "AI Enhance"}
                  </button>
                </div>
                <textarea
                  value={cv.summary}
                  onChange={e => set("summary", e.target.value)}
                  placeholder="Results-driven software engineer with 5+ years building scalable web applications..."
                  rows={5}
                  className={`${inputCls} resize-none`}
                />
              </div>

              {/* Experience */}
              <div className={sectionCls}>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7c6f60]">Experience</p>
                  <button
                    onClick={addExp}
                    className="rounded-full bg-[#1f2a24] px-3 py-1 text-xs font-medium text-white"
                  >
                    + Add
                  </button>
                </div>
                <div className="space-y-5">
                  {cv.experience.map((e, i) => (
                    <div key={i} className="rounded-2xl border border-[#ede5d8] bg-white/60 p-4">
                      <div className="grid gap-2 sm:grid-cols-2 mb-2">
                        <div>
                          <label className={labelCls}>Title</label>
                          <input value={e.title} onChange={ev => updateExp(i, "title", ev.target.value)} placeholder="Software Engineer" className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>Company</label>
                          <input value={e.company} onChange={ev => updateExp(i, "company", ev.target.value)} placeholder="Acme Corp" className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>From</label>
                          <input value={e.from} onChange={ev => updateExp(i, "from", ev.target.value)} placeholder="Jan 2022" className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>To</label>
                          <input value={e.to} onChange={ev => updateExp(i, "to", ev.target.value)} placeholder="Present" className={inputCls} />
                        </div>
                      </div>
                      <div className="flex items-center justify-between mb-1">
                        <label className={labelCls}>Description</label>
                        <button
                          onClick={() => enhance("exp", i)}
                          disabled={enhancing === `exp-${i}` || !e.description}
                          className="rounded-full bg-[#1f2a24] px-3 py-0.5 text-xs font-medium text-white disabled:opacity-40"
                        >
                          {enhancing === `exp-${i}` ? "Enhancing..." : "AI Enhance"}
                        </button>
                      </div>
                      <textarea
                        value={e.description}
                        onChange={ev => updateExp(i, "description", ev.target.value)}
                        placeholder="Led development of... Reduced load time by 40%..."
                        rows={4}
                        className={`${inputCls} resize-none`}
                      />
                      <button onClick={() => removeExp(i)} className="mt-2 text-xs text-[#a2453b] hover:underline">Remove</button>
                    </div>
                  ))}
                  {cv.experience.length === 0 && (
                    <p className="text-sm text-[#b5a898] text-center py-4">No experience entries yet. Click + Add above.</p>
                  )}
                </div>
              </div>

              {/* Education */}
              <div className={sectionCls}>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7c6f60]">Education</p>
                  <button onClick={addEdu} className="rounded-full bg-[#1f2a24] px-3 py-1 text-xs font-medium text-white">+ Add</button>
                </div>
                <div className="space-y-3">
                  {cv.education.map((e, i) => (
                    <div key={i} className="rounded-2xl border border-[#ede5d8] bg-white/60 p-4">
                      <div className="grid gap-2 sm:grid-cols-3">
                        <div>
                          <label className={labelCls}>Degree</label>
                          <input value={e.degree} onChange={ev => updateEdu(i, "degree", ev.target.value)} placeholder="B.S. Computer Science" className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>School</label>
                          <input value={e.school} onChange={ev => updateEdu(i, "school", ev.target.value)} placeholder="MIT" className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>Year</label>
                          <input value={e.year?.toString() || ""} onChange={ev => updateEdu(i, "year", ev.target.value)} placeholder="2020" className={inputCls} />
                        </div>
                      </div>
                      <button onClick={() => removeEdu(i)} className="mt-2 text-xs text-[#a2453b] hover:underline">Remove</button>
                    </div>
                  ))}
                  {cv.education.length === 0 && (
                    <p className="text-sm text-[#b5a898] text-center py-4">No education entries yet.</p>
                  )}
                </div>
              </div>

              {/* Skills */}
              <div className={sectionCls}>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7c6f60] mb-3">Skills</p>
                <div className="flex gap-2 mb-3">
                  <input
                    value={skillInput}
                    onChange={e => setSkillInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addSkill()}
                    placeholder="React, Node.js, Python..."
                    className={`${inputCls} flex-1`}
                  />
                  <button onClick={addSkill} className="rounded-xl bg-[#1f2a24] px-4 text-sm font-medium text-white">Add</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {cv.skills.map(s => (
                    <span key={s} className="flex items-center gap-1.5 rounded-full bg-white/80 border border-[#e0d5c6] px-3 py-1 text-xs text-[#5f564d]">
                      {s}
                      <button onClick={() => removeSkill(s)} className="text-[#a0897a] hover:text-[#a2453b]">×</button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Languages */}
              <div className={sectionCls}>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7c6f60] mb-3">Languages</p>
                <div className="flex gap-2 mb-3">
                  <input
                    value={langInput}
                    onChange={e => setLangInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addLang()}
                    placeholder="English, Arabic, French..."
                    className={`${inputCls} flex-1`}
                  />
                  <button onClick={addLang} className="rounded-xl bg-[#1f2a24] px-4 text-sm font-medium text-white">Add</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {cv.languages.map(l => (
                    <span key={l} className="flex items-center gap-1.5 rounded-full bg-white/80 border border-[#e0d5c6] px-3 py-1 text-xs text-[#5f564d]">
                      {l}
                      <button onClick={() => removeLang(l)} className="text-[#a0897a] hover:text-[#a2453b]">×</button>
                    </span>
                  ))}
                </div>
              </div>

            </div>

            {/* ── RIGHT: ATS Preview ── */}
            <div className="sticky top-6 self-start">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.18em] text-[#7c6f60]">ATS Preview</p>
                <span className="rounded-full bg-[#d9efe6] px-3 py-1 text-xs font-medium text-[#2d6e57]">ATS-ready</span>
              </div>
              <div className="overflow-auto rounded-[24px] border border-black/5 shadow-[0_18px_40px_rgba(44,36,24,0.1)]" style={{ maxHeight: "85vh" }}>
                <ATSPreview cv={cv} />
              </div>
              <p className="mt-3 text-center text-xs text-[#9a8e82]">Click "Download PDF" to save — use browser print dialog</p>
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
