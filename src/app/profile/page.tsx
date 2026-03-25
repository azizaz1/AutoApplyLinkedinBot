"use client"

import { useCallback, useState } from "react"
import { useDropzone } from "react-dropzone"

interface ParsedProfile {
  fullName?: string
  currentTitle?: string
  skills?: string[]
  summary?: string
  yearsExperience?: number
  languages?: string[]
}

export default function ProfilePage() {
  const [uploading, setUploading] = useState(false)
  const [profile, setProfile] = useState<ParsedProfile | null>(null)
  const [error, setError] = useState<string | null>(null)

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (!file) return

    setUploading(true)
    setError(null)

    const formData = new FormData()
    formData.append("cv", file)

    try {
      const res = await fetch("/api/cv", { method: "POST", body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Upload failed")
      setProfile(data.parsed)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setUploading(false)
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
    disabled: uploading,
  })

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <section className="relative overflow-hidden rounded-[32px] border border-black/5 bg-[#1f2a24] px-6 py-7 text-[#f8f3ea] shadow-[0_24px_70px_rgba(35,34,25,0.18)] md:px-10 md:py-10">
          <div className="absolute -left-10 top-0 h-40 w-40 rounded-full bg-[#f09b61]/20 blur-3xl" />
          <div className="absolute right-0 top-0 h-52 w-52 rounded-full bg-[#6da086]/20 blur-3xl" />

          <div className="relative grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <a href="/dashboard" className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.22em] text-[#d9cbb9]">
                Back to dashboard
              </a>
              <h1 className="mt-5 text-3xl font-bold md:text-5xl">CV intelligence studio</h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-[#d8d1c4] md:text-base">
                Drop in a CV, parse it with AI, and turn your resume into structured automation-ready candidate data.
              </p>
            </div>

            <div className="rounded-[26px] border border-white/10 bg-white/8 p-5 backdrop-blur-sm">
              <p className="text-xs uppercase tracking-[0.18em] text-[#d7cab8]">Upload format</p>
              <p className="mt-2 text-3xl font-bold text-white">PDF only</p>
              <p className="mt-2 text-sm text-[#d8d1c4]">
                One file, parsed into title, summary, experience, languages, and skills.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_0.95fr]">
          <div className="rounded-[28px] border border-black/5 bg-[#fbf7f0]/90 p-5 shadow-[0_18px_40px_rgba(44,36,24,0.08)] md:p-6">
            <p className="text-xs uppercase tracking-[0.18em] text-[#7c6f60]">Upload zone</p>
            <h2 className="mt-2 text-2xl font-semibold text-[#1f2a24]">Drop your latest CV</h2>
            <p className="mt-2 text-sm leading-6 text-[#6f675b]">
              We’ll extract your current title, work summary, detected skills, and language profile automatically.
            </p>

            <div
              {...getRootProps()}
              className={`mt-6 rounded-[28px] border-2 border-dashed p-10 text-center transition-all ${
                isDragActive
                  ? "border-[#346959] bg-[#e8f0eb]"
                  : "border-[#ddd2c2] bg-white/75 hover:border-[#c8b9a6]"
              } ${uploading ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}
            >
              <input {...getInputProps()} />
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-[24px] bg-[#f4e4cf] text-4xl">
                document
              </div>

              {uploading ? (
                <div>
                  <p className="text-lg font-semibold text-[#1f2a24]">Parsing your CV with AI...</p>
                  <p className="mt-2 text-sm text-[#786f65]">Building a structured profile from your resume now.</p>
                </div>
              ) : isDragActive ? (
                <div>
                  <p className="text-lg font-semibold text-[#1f2a24]">Drop your CV here</p>
                  <p className="mt-2 text-sm text-[#786f65]">Release the file to start parsing.</p>
                </div>
              ) : (
                <div>
                  <p className="text-lg font-semibold text-[#1f2a24]">Drag and drop your CV here</p>
                  <p className="mt-2 text-sm text-[#786f65]">PDF only. One file. Ready for automation in seconds.</p>
                </div>
              )}
            </div>

            {error && (
              <div className="mt-5 rounded-[20px] border border-[#edc1bd] bg-[#fff0ef] px-4 py-3 text-sm text-[#a2453b]">
                {error}
              </div>
            )}
          </div>

          <div className="space-y-6">
            {profile ? (
              <section className="rounded-[28px] border border-black/5 bg-[#fbf7f0]/90 p-5 shadow-[0_18px_40px_rgba(44,36,24,0.08)] md:p-6">
                <div className="mb-5 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#d9efe6] text-lg text-[#2d6e57]">
                    ok
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-[#7c6f60]">Parsed result</p>
                    <h2 className="text-xl font-semibold text-[#1f2a24]">CV profile ready</h2>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl bg-white/75 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-[#857866]">Name</p>
                    <p className="mt-2 text-sm font-semibold text-[#1f2a24]">{profile.fullName || "Not detected"}</p>
                  </div>
                  <div className="rounded-2xl bg-white/75 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-[#857866]">Current title</p>
                    <p className="mt-2 text-sm font-semibold text-[#1f2a24]">{profile.currentTitle || "Not detected"}</p>
                  </div>
                  <div className="rounded-2xl bg-white/75 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-[#857866]">Experience</p>
                    <p className="mt-2 text-sm font-semibold text-[#1f2a24]">
                      {profile.yearsExperience != null ? `${profile.yearsExperience} years` : "Not detected"}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white/75 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-[#857866]">Languages</p>
                    <p className="mt-2 text-sm font-semibold text-[#1f2a24]">
                      {profile.languages?.length ? profile.languages.join(", ") : "Not detected"}
                    </p>
                  </div>
                </div>

                {profile.summary && (
                  <div className="mt-5 rounded-[22px] bg-[#f4e4cf] p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-[#8a5c3e]">Summary</p>
                    <p className="mt-2 text-sm leading-6 text-[#5e483b]">{profile.summary}</p>
                  </div>
                )}

                {profile.skills?.length ? (
                  <div className="mt-5">
                    <p className="text-xs uppercase tracking-[0.16em] text-[#857866]">Skills detected</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {profile.skills.map((skill) => (
                        <span
                          key={skill}
                          className="rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-[#5f564d]"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="mt-6 flex flex-wrap gap-3">
                  <a
                    href="/onboarding"
                    className="inline-flex rounded-full bg-[#1f2a24] px-5 py-2.5 text-sm font-medium text-white transition-transform hover:-translate-y-0.5"
                  >
                    Continue onboarding
                  </a>
                  <a
                    href="/settings"
                    className="inline-flex rounded-full border border-[#cda37f] px-5 py-2.5 text-sm font-medium text-[#6d4329] transition-colors hover:bg-white/35"
                  >
                    Review settings
                  </a>
                </div>
              </section>
            ) : (
              <section className="rounded-[28px] border border-black/5 bg-[#f4e4cf] p-5 shadow-[0_18px_40px_rgba(44,36,24,0.08)] md:p-6">
                <p className="text-xs uppercase tracking-[0.18em] text-[#8a5c3e]">What happens next</p>
                <h2 className="mt-2 text-xl font-semibold text-[#332118]">Your CV becomes a job-ready profile</h2>
                <div className="mt-5 space-y-3 text-sm text-[#6f5445]">
                  <div className="rounded-2xl bg-white/45 p-4">1. Upload your PDF resume.</div>
                  <div className="rounded-2xl bg-white/45 p-4">2. Parse your experience, title, and skills with AI.</div>
                  <div className="rounded-2xl bg-white/45 p-4">3. Use that profile to power automated applications.</div>
                </div>
              </section>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
