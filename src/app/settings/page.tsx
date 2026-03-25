"use client"

import { useEffect, useState } from "react"

const COUNTRY_OPTIONS = [
  "Worldwide",
  "Tunisia",
  "France",
  "Germany",
  "Spain",
  "Italy",
  "United Kingdom",
  "Netherlands",
  "Belgium",
  "Switzerland",
  "Portugal",
  "Ireland",
  "Sweden",
  "Norway",
  "Denmark",
  "Poland",
  "Romania",
  "Czech Republic",
  "Austria",
  "Canada",
  "United States",
  "United Arab Emirates",
  "Saudi Arabia",
  "Qatar",
  "Kuwait",
  "Morocco",
  "Algeria",
  "Egypt",
  "Turkey",
  "India",
  "Remote",
]

const APPLICATION_ANSWERS_KEY = "autoapply_application_answers_v1"

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

type ApplicantToggleName =
  | "workAuthorization"
  | "sponsorshipRequired"
  | "openToRelocation"
  | "remotePreference"
  | "livesInEurope"
  | "openToB2BContract"
  | "hasPersonalLaptop"
  | "workedBefore"
  | "inSanctionedTerritories"

type SettingsForm = {
  linkedinEmail: string
  linkedinPassword: string
  tanitjobsEmail: string
  tanitjobsPassword: string
  keejobEmail: string
  keejobPassword: string
  linkedinEnabled: boolean
  tanitjobsEnabled: boolean
  keejobEnabled: boolean
  desiredLocation: string
  remoteOnly: boolean
  minMatchScore: number
  maxApplicationsDay: number
}

const DEFAULT_APPLICATION_ANSWERS: ApplicationAnswersForm = {
  phone: "+21600000000",
  city: "Tunis",
  country: "Tunisia",
  baseCountry: "Tunisia",
  citizenship: "Tunisian",
  linkedinUrl: "https://linkedin.com/in/medazizazaiez",
  portfolioUrl: "https://linkedin.com/in/medazizazaiez",
  noticePeriod: "2 weeks",
  salaryExpectation: "2000",
  referralSource: "LinkedIn",
  workAuthorization: "yes",
  sponsorshipRequired: "no",
  openToRelocation: "yes",
  remotePreference: "yes",
  livesInEurope: "no",
  openToB2BContract: "yes",
  hasPersonalLaptop: "yes",
  workedBefore: "no",
  inSanctionedTerritories: "no",
}

const DEFAULT_FORM: SettingsForm = {
  linkedinEmail: "",
  linkedinPassword: "",
  tanitjobsEmail: "",
  tanitjobsPassword: "",
  keejobEmail: "",
  keejobPassword: "",
  linkedinEnabled: true,
  tanitjobsEnabled: true,
  keejobEnabled: false,
  desiredLocation: "Tunisia",
  remoteOnly: false,
  minMatchScore: 75,
  maxApplicationsDay: 20,
}

function Toggle({ value, onChange }: { value: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={onChange}
      className={`relative inline-flex h-8 w-[60px] items-center rounded-full px-1 text-[10px] font-semibold uppercase tracking-[0.18em] transition-all focus:outline-none focus:ring-4 focus:ring-[#346959]/15 ${
        value ? "bg-[#346959] text-[#e9f5ef]" : "bg-[#d8cfbf] text-[#7a6f63]"
      }`}
    >
      <span
        className={`absolute left-1 top-1 h-6 w-6 rounded-full bg-white shadow-[0_6px_14px_rgba(31,42,36,0.16)] transition-transform ${
          value ? "translate-x-7" : "translate-x-0"
        }`}
      />
      <span className={`relative z-10 w-full ${value ? "pr-2 text-right" : "pl-2 text-left"}`}>
        {value ? "On" : "Off"}
      </span>
    </button>
  )
}

function Field<K extends keyof SettingsForm>({
  label,
  name,
  type = "text",
  value,
  onChange,
}: {
  label: string
  name: K
  type?: string
  value: SettingsForm[K]
  onChange: (name: K, value: SettingsForm[K]) => void
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-[#7c6f60]">{label}</span>
      <input
        type={type}
        placeholder={type === "password" ? "........" : ""}
        value={String(value)}
        onChange={(e) => onChange(name, e.target.value as SettingsForm[K])}
        className="w-full rounded-2xl border border-[#ddd2c2] bg-white/80 px-4 py-3 text-sm text-[#1f2a24] outline-none transition focus:border-[#346959] focus:ring-4 focus:ring-[#346959]/10"
      />
    </label>
  )
}

function SelectField<K extends keyof SettingsForm>({
  label,
  name,
  options,
  value,
  onChange,
}: {
  label: string
  name: K
  options: string[]
  value: SettingsForm[K]
  onChange: (name: K, value: SettingsForm[K]) => void
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-[#7c6f60]">{label}</span>
      <select
        value={String(value)}
        onChange={(e) => onChange(name, e.target.value as SettingsForm[K])}
        className="w-full rounded-2xl border border-[#ddd2c2] bg-white/80 px-4 py-3 text-sm text-[#1f2a24] outline-none transition focus:border-[#346959] focus:ring-4 focus:ring-[#346959]/10"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  )
}

function PlatformCard({
  code,
  title,
  accent,
  enabled,
  onToggle,
  children,
}: {
  code: string
  title: string
  accent: string
  enabled: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <section className="rounded-[26px] border border-black/5 bg-[#fbf7f0]/90 p-5 shadow-[0_18px_40px_rgba(44,36,24,0.08)] md:p-6">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-bold ${accent}`}>
            {code}
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[#7d7264]">Platform</p>
            <h2 className="text-lg font-semibold text-[#1f2a24]">{title}</h2>
          </div>
        </div>
        <Toggle value={enabled} onChange={onToggle} />
      </div>
      <div className="grid gap-4">{children}</div>
    </section>
  )
}

function ApplicantField<K extends keyof ApplicationAnswersForm>({
  label,
  name,
  value,
  onChange,
}: {
  label: string
  name: K
  value: ApplicationAnswersForm[K]
  onChange: (name: K, value: ApplicationAnswersForm[K]) => void
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-[#7c6f60]">{label}</span>
      <input
        type="text"
        value={String(value)}
        onChange={(e) => onChange(name, e.target.value as ApplicationAnswersForm[K])}
        className="w-full rounded-2xl border border-[#ddd2c2] bg-white/80 px-4 py-3 text-sm text-[#1f2a24] outline-none transition focus:border-[#346959] focus:ring-4 focus:ring-[#346959]/10"
      />
    </label>
  )
}

function ApplicantToggle({
  label,
  name,
  value,
  onChange,
}: {
  label: string
  name: ApplicantToggleName
  value: "yes" | "no"
  onChange: (name: ApplicantToggleName, value: "yes" | "no") => void
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-white/70 p-4">
      <div>
        <p className="text-sm font-medium text-[#1f2a24]">{label}</p>
        <p className="mt-1 text-xs text-[#7c6f60]">Used by Groq and fallbacks when forms ask this directly.</p>
      </div>
      <Toggle value={value === "yes"} onChange={() => onChange(name, value === "yes" ? "no" : "yes")} />
    </div>
  )
}

export default function SettingsPage() {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [form, setForm] = useState<SettingsForm>(DEFAULT_FORM)
  const [applicationAnswers, setApplicationAnswers] = useState<ApplicationAnswersForm>(DEFAULT_APPLICATION_ANSWERS)

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then(({ profile }) => {
        if (!profile) return
        setForm((current) => ({
          ...current,
          linkedinEmail: profile.linkedinEmail ?? current.linkedinEmail,
          tanitjobsEmail: profile.tanitjobsEmail ?? current.tanitjobsEmail,
          keejobEmail: profile.keejobEmail ?? current.keejobEmail,
          linkedinEnabled: profile.linkedinEnabled ?? current.linkedinEnabled,
          tanitjobsEnabled: profile.tanitjobsEnabled ?? current.tanitjobsEnabled,
          keejobEnabled: profile.keejobEnabled ?? current.keejobEnabled,
          desiredLocation: profile.desiredLocation ?? current.desiredLocation,
          remoteOnly: profile.remoteOnly ?? current.remoteOnly,
          minMatchScore: profile.minMatchScore ?? current.minMatchScore,
          maxApplicationsDay: profile.maxApplicationsDay ?? current.maxApplicationsDay,
        }))
      })

    try {
      const raw = window.localStorage.getItem(APPLICATION_ANSWERS_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as Partial<ApplicationAnswersForm>
      setApplicationAnswers((current) => ({ ...current, ...parsed }))
    } catch {}
  }, [])

  const setField = <K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const setApplicationAnswer = <K extends keyof ApplicationAnswersForm>(key: K, value: ApplicationAnswersForm[K]) => {
    setApplicationAnswers((current) => ({ ...current, [key]: value }))
  }

  const setApplicantToggle = (key: ApplicantToggleName, value: "yes" | "no") => {
    setApplicationAnswers((current) => ({ ...current, [key]: value }))
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
    window.localStorage.setItem(APPLICATION_ANSWERS_KEY, JSON.stringify(applicationAnswers))
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <section className="relative overflow-hidden rounded-[32px] border border-black/5 bg-[#1f2a24] px-6 py-7 text-[#f8f3ea] shadow-[0_24px_70px_rgba(35,34,25,0.18)] md:px-10 md:py-10">
          <div className="absolute -left-10 top-0 h-40 w-40 rounded-full bg-[#f09b61]/20 blur-3xl" />
          <div className="absolute right-0 top-0 h-52 w-52 rounded-full bg-[#6da086]/20 blur-3xl" />

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <a href="/dashboard" className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.22em] text-[#d9cbb9]">
                Back to dashboard
              </a>
              <h1 className="mt-5 text-3xl font-bold md:text-5xl">Automation settings</h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-[#d8d1c4] md:text-base">
                Tune account access, sourcing channels, and application velocity from one clean control surface.
              </p>
            </div>

            <div className="rounded-[24px] border border-white/10 bg-white/8 p-5 backdrop-blur-sm">
              <p className="text-xs uppercase tracking-[0.18em] text-[#d7cab8]">Run profile</p>
              <p className="mt-2 text-3xl font-bold text-white">{form.maxApplicationsDay}</p>
              <p className="mt-2 text-sm text-[#d8d1c4]">Max applications per day with a {form.minMatchScore}% quality threshold.</p>
            </div>
          </div>
        </section>

        <form onSubmit={handleSave} className="mt-6 space-y-6">
          <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-6">
              <PlatformCard
                code="in"
                title="LinkedIn"
                accent="bg-[#dce9f8] text-[#27558a]"
                enabled={form.linkedinEnabled}
                onToggle={() => setField("linkedinEnabled", !form.linkedinEnabled)}
              >
                <Field label="Email" name="linkedinEmail" type="email" value={form.linkedinEmail} onChange={setField} />
                <Field label="Password" name="linkedinPassword" type="password" value={form.linkedinPassword} onChange={setField} />
              </PlatformCard>

              <PlatformCard
                code="TJ"
                title="TanitJobs"
                accent="bg-[#d9efe6] text-[#2d6e57]"
                enabled={form.tanitjobsEnabled}
                onToggle={() => setField("tanitjobsEnabled", !form.tanitjobsEnabled)}
              >
                <Field label="Email" name="tanitjobsEmail" type="email" value={form.tanitjobsEmail} onChange={setField} />
                <Field label="Password" name="tanitjobsPassword" type="password" value={form.tanitjobsPassword} onChange={setField} />
              </PlatformCard>

              <PlatformCard
                code="KJ"
                title="Keejob"
                accent="bg-[#f6e6cf] text-[#8d5a1f]"
                enabled={form.keejobEnabled}
                onToggle={() => setField("keejobEnabled", !form.keejobEnabled)}
              >
                <Field label="Email" name="keejobEmail" type="email" value={form.keejobEmail} onChange={setField} />
                <Field label="Password" name="keejobPassword" type="password" value={form.keejobPassword} onChange={setField} />
              </PlatformCard>
            </div>

            <div className="space-y-6">
              <section className="rounded-[26px] border border-black/5 bg-[#fbf7f0]/90 p-5 shadow-[0_18px_40px_rgba(44,36,24,0.08)] md:p-6">
                <p className="text-xs uppercase tracking-[0.18em] text-[#7c6f60]">Preferences</p>
                <h2 className="mt-2 text-xl font-semibold text-[#1f2a24]">Application filters</h2>

                <div className="mt-5 space-y-5">
                  <SelectField
                    label="Preferred country"
                    name="desiredLocation"
                    options={COUNTRY_OPTIONS}
                    value={form.desiredLocation}
                    onChange={setField}
                  />

                  <div className="rounded-2xl bg-white/70 p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs uppercase tracking-[0.16em] text-[#7c6f60]">Min match score</span>
                      <strong className="text-sm text-[#1f2a24]">{form.minMatchScore}%</strong>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="95"
                      value={form.minMatchScore}
                      onChange={(e) => setField("minMatchScore", parseInt(e.target.value))}
                      className="w-full accent-[#346959]"
                    />
                    <div className="mt-1 flex justify-between text-xs text-[#8a7e6d]">
                      <span>Broader reach</span>
                      <span>Stricter quality</span>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-white/70 p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs uppercase tracking-[0.16em] text-[#7c6f60]">Max applications per day</span>
                      <strong className="text-sm text-[#1f2a24]">{form.maxApplicationsDay}</strong>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="50"
                      value={form.maxApplicationsDay}
                      onChange={(e) => setField("maxApplicationsDay", parseInt(e.target.value))}
                      className="w-full accent-[#f09b61]"
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-2xl bg-white/70 p-4">
                    <div>
                      <p className="text-sm font-medium text-[#1f2a24]">Remote-only mode</p>
                      <p className="mt-1 text-xs text-[#7c6f60]">Focus automation on remote opportunities only.</p>
                    </div>
                    <Toggle value={form.remoteOnly} onChange={() => setField("remoteOnly", !form.remoteOnly)} />
                  </div>
                </div>
              </section>

              <section className="rounded-[26px] border border-black/5 bg-[#fbf7f0]/90 p-5 shadow-[0_18px_40px_rgba(44,36,24,0.08)] md:p-6">
                <p className="text-xs uppercase tracking-[0.18em] text-[#7c6f60]">Applicant Answers</p>
                <h2 className="mt-2 text-xl font-semibold text-[#1f2a24]">Common form answers</h2>
                <p className="mt-2 text-sm leading-6 text-[#6b6257]">
                  Fill the answers you want Groq and the bot to use when forms ask common questions. Already-filled form fields are left alone.
                </p>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <ApplicantField label="Phone" name="phone" value={applicationAnswers.phone} onChange={setApplicationAnswer} />
                  <ApplicantField label="City" name="city" value={applicationAnswers.city} onChange={setApplicationAnswer} />
                  <ApplicantField label="Country" name="country" value={applicationAnswers.country} onChange={setApplicationAnswer} />
                  <ApplicantField label="Base Country" name="baseCountry" value={applicationAnswers.baseCountry} onChange={setApplicationAnswer} />
                  <ApplicantField label="Citizenship" name="citizenship" value={applicationAnswers.citizenship} onChange={setApplicationAnswer} />
                  <ApplicantField label="LinkedIn URL" name="linkedinUrl" value={applicationAnswers.linkedinUrl} onChange={setApplicationAnswer} />
                  <ApplicantField label="Portfolio URL" name="portfolioUrl" value={applicationAnswers.portfolioUrl} onChange={setApplicationAnswer} />
                  <ApplicantField label="Notice Period" name="noticePeriod" value={applicationAnswers.noticePeriod} onChange={setApplicationAnswer} />
                  <ApplicantField label="Salary Expectation" name="salaryExpectation" value={applicationAnswers.salaryExpectation} onChange={setApplicationAnswer} />
                  <ApplicantField label="Referral Source" name="referralSource" value={applicationAnswers.referralSource} onChange={setApplicationAnswer} />
                </div>

                <div className="mt-5 space-y-3">
                  <ApplicantToggle label="Work authorization" name="workAuthorization" value={applicationAnswers.workAuthorization} onChange={setApplicantToggle} />
                  <ApplicantToggle label="Visa sponsorship required" name="sponsorshipRequired" value={applicationAnswers.sponsorshipRequired} onChange={setApplicantToggle} />
                  <ApplicantToggle label="Open to relocation" name="openToRelocation" value={applicationAnswers.openToRelocation} onChange={setApplicantToggle} />
                  <ApplicantToggle label="Remote preference" name="remotePreference" value={applicationAnswers.remotePreference} onChange={setApplicantToggle} />
                  <ApplicantToggle label="Lives in Europe" name="livesInEurope" value={applicationAnswers.livesInEurope} onChange={setApplicantToggle} />
                  <ApplicantToggle label="Open to B2B contract" name="openToB2BContract" value={applicationAnswers.openToB2BContract} onChange={setApplicantToggle} />
                  <ApplicantToggle label="Has personal laptop / PC" name="hasPersonalLaptop" value={applicationAnswers.hasPersonalLaptop} onChange={setApplicantToggle} />
                  <ApplicantToggle label="Worked with this company before" name="workedBefore" value={applicationAnswers.workedBefore} onChange={setApplicantToggle} />
                  <ApplicantToggle label="In sanctioned territories" name="inSanctionedTerritories" value={applicationAnswers.inSanctionedTerritories} onChange={setApplicantToggle} />
                </div>
              </section>

              <section className="rounded-[26px] border border-black/5 bg-[#f4e4cf] p-5 shadow-[0_18px_40px_rgba(44,36,24,0.08)] md:p-6">
                <p className="text-xs uppercase tracking-[0.18em] text-[#8a5c3e]">Save changes</p>
                <h2 className="mt-2 text-xl font-semibold text-[#332118]">Lock in this configuration</h2>
                <p className="mt-3 text-sm leading-6 text-[#6f5445]">
                  Store platform credentials and preference tuning for the current account.
                </p>

                <button
                  type="submit"
                  disabled={saving}
                  className={`mt-5 w-full rounded-2xl px-5 py-3 text-sm font-medium transition-all ${
                    saving
                      ? "cursor-not-allowed bg-[#d9c1ab] text-[#7e6757]"
                      : saved
                        ? "bg-[#346959] text-white"
                        : "bg-[#1f2a24] text-white hover:-translate-y-0.5"
                  }`}
                >
                  {saving ? "Saving..." : saved ? "Saved successfully" : "Save settings"}
                </button>
              </section>
            </div>
          </div>
        </form>
      </div>
    </main>
  )
}
