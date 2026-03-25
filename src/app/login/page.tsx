"use client"

import { signIn } from "next-auth/react"
import { useState } from "react"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    await signIn("credentials", { email, password: "demo", callbackUrl: "/onboarding" })
    setLoading(false)
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(240,155,97,0.18),_transparent_28%),linear-gradient(180deg,#f6f1e8_0%,#efe6d9_100%)] px-4 py-6 md:px-8 lg:px-10">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-7xl gap-6 lg:grid-cols-[1.08fr_0.92fr]">
        <section className="relative overflow-hidden rounded-[34px] border border-black/5 bg-[#1f2a24] px-6 py-7 text-[#f8f3ea] shadow-[0_24px_70px_rgba(35,34,25,0.18)] md:px-10 md:py-10">
          <div className="absolute -left-14 top-0 h-44 w-44 rounded-full bg-[#f09b61]/25 blur-3xl" />
          <div className="absolute right-0 top-10 h-56 w-56 rounded-full bg-[#6da086]/20 blur-3xl" />
          <div className="absolute bottom-0 left-20 h-36 w-36 rounded-full bg-[#d9b17d]/15 blur-3xl" />

          <div className="relative flex h-full flex-col justify-between">
            <div>
              <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.24em] text-[#d9cbb9]">
                AI job application copilot
              </div>
              <h1 className="mt-6 max-w-2xl text-4xl font-bold leading-tight md:text-6xl">
                Land more applications with less chaos.
              </h1>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-[#d8d1c4] md:text-base">
                Upload your CV, let AI shape your candidate profile, and manage your auto-apply workflow from one polished command center instead of juggling tabs, forms, and repetitive edits.
              </p>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              <div className="rounded-[24px] border border-white/10 bg-white/8 p-4 backdrop-blur-sm">
                <p className="text-xs uppercase tracking-[0.18em] text-[#d7cab8]">Transparent</p>
                <p className="mt-2 text-sm leading-6 text-[#f4ede2]">
                  See what the bot applies to, what it filled, and where it needs your attention.
                </p>
              </div>
              <div className="rounded-[24px] border border-white/10 bg-white/8 p-4 backdrop-blur-sm">
                <p className="text-xs uppercase tracking-[0.18em] text-[#d7cab8]">AI-guided</p>
                <p className="mt-2 text-sm leading-6 text-[#f4ede2]">
                  Groq-powered suggestions turn your CV into search targets and better form answers.
                </p>
              </div>
              <div className="rounded-[24px] border border-white/10 bg-white/8 p-4 backdrop-blur-sm">
                <p className="text-xs uppercase tracking-[0.18em] text-[#d7cab8]">In control</p>
                <p className="mt-2 text-sm leading-6 text-[#f4ede2]">
                  Run, pause, resume, and review from a dashboard built like a mission control panel.
                </p>
              </div>
            </div>

            <div className="mt-8 rounded-[28px] border border-white/10 bg-white/6 p-5 backdrop-blur-sm">
              <p className="text-xs uppercase tracking-[0.2em] text-[#d7cab8]">Inside the platform</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-black/10 p-4">
                  <p className="text-3xl font-bold text-white">Live</p>
                  <p className="mt-2 text-sm text-[#ddd4c8]">Bot feed, applied jobs, and saved activity in one place.</p>
                </div>
                <div className="rounded-2xl bg-black/10 p-4">
                  <p className="text-3xl font-bold text-white">Guided</p>
                  <p className="mt-2 text-sm text-[#ddd4c8]">A simpler onboarding flow that gets new users ready faster.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="flex items-center">
          <div className="w-full rounded-[34px] border border-black/5 bg-[#fbf7f0]/95 p-6 shadow-[0_24px_70px_rgba(44,36,24,0.12)] md:p-8">
            <div className="mb-8">
              <p className="text-xs uppercase tracking-[0.22em] text-[#857866]">Welcome back</p>
              <h2 className="mt-2 text-3xl font-semibold text-[#1f2a24]">Sign in to your cockpit</h2>
              <p className="mt-3 text-sm leading-6 text-[#6b6257]">
                Start with a social login or jump in with your test email to continue onboarding.
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => signIn("google", { callbackUrl: "/onboarding" })}
                className="flex w-full items-center justify-center gap-3 rounded-2xl bg-[#1f2a24] px-4 py-3.5 text-sm font-medium text-white shadow-[0_18px_28px_rgba(31,42,36,0.16)] transition-all hover:-translate-y-0.5 hover:bg-[#253229]"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                  <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
                  <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
                  <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
                  <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
                </svg>
                Continue with Google
              </button>

              <p className="rounded-2xl border border-[#e7dccd] bg-white/70 px-4 py-3 text-xs leading-6 text-[#7f7467]">
                Fastest setup: continue with Google, then upload your CV and finish onboarding in a few steps.
              </p>
            </div>

            <div className="my-6 flex items-center gap-3">
              <hr className="flex-1 border-[#e2d8ca]" />
              <span className="text-xs uppercase tracking-[0.2em] text-[#9a8f82]">email fallback</span>
              <hr className="flex-1 border-[#e2d8ca]" />
            </div>

            <form onSubmit={handleEmail} className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-[#7c6f60]">Email</span>
                <input
                  type="email"
                  placeholder="you@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded-2xl border border-[#ddd2c2] bg-white/80 px-4 py-3 text-sm text-[#1f2a24] outline-none transition focus:border-[#346959] focus:ring-4 focus:ring-[#346959]/10"
                />
              </label>

              <button
                type="submit"
                disabled={loading}
                className={`w-full rounded-2xl border py-3 text-sm font-medium transition-all ${
                  loading
                    ? "cursor-not-allowed border-[#dbcab6] bg-[#eadbc8] text-[#7e6757]"
                    : "border-[#d8ccbc] bg-white text-[#1f2a24] hover:-translate-y-0.5 hover:bg-[#fffdf9]"
                }`}
              >
                {loading ? "Signing in..." : "Continue with email"}
              </button>
            </form>

            <div className="mt-6 rounded-[24px] bg-[#f4e4cf] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[#8a5c3e]">What happens next</p>
              <div className="mt-3 space-y-2 text-sm text-[#6f5445]">
                <p>1. Upload your CV and let AI parse your profile.</p>
                <p>2. Connect the job platforms you want to use.</p>
                <p>3. Seed your form answers and launch from the dashboard.</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
