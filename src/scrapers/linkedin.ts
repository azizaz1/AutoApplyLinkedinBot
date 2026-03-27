import { chromium, Browser, Page } from "playwright"
import * as path from "path"
import * as fs from "fs"
import {
  askGroqForFieldAnswer,
  generateFrenchCoverLetter,
  suggestJobTitlesFromProfile,
  type GroqApplicantProfile,
} from "../lib/groq-apply"

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_JOB_TITLES = [
  "Centre d'appel", "Call Center Agent", "Customer Service Representative",
  "Teleconseiller", "Teleconseiller Francophone", "Customer Support Specialist",
  "Agent Support Client", "Customer Advisor", "Call Center Representative",
  "Customer Care Agent", "Customer Experience Specialist", "Service Client",
  "Conseiller Client", "Conseiller Clientele", "Agent Centre d'Appel",
  "Charge Clientele", "Inbound Call Center Agent", "Outbound Call Center Agent",
  "Bilingual Customer Support", "French Customer Service", "Support Client Francophone",
  "Teleoperateur", "Agent Relation Client", "Agent Relation Clientele",
  "Conseiller Commercial", "Commercial Sedentaire", "Inside Sales Representative",
  "Sales Development Representative", "Appointment Setter", "Lead Generation Specialist",
  "Support Technique", "Technical Support Agent", "Help Desk Agent",
  "IT Support Specialist", "Back Office Agent", "Back Office Executive",
  "Chat Support Agent", "Email Support Agent", "Client Success Specialist",
  "Customer Success Associate", "Customer Onboarding Specialist",
  "Retention Specialist", "Collections Agent", "Receptionist", "Virtual Assistant",
]

const WORLDWIDE_LOCATION = "Worldwide"
const MAX_APPLIES_PER_RUN = 20
const DELAY_BETWEEN_JOBS = 3000
const USE_GROQ_FOR_COMPLEX_FORMS = true

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LinkedInJob {
  id: string
  title: string
  company: string
  location: string
  url: string
  isEasyApply: boolean
}

export interface ApplyResult {
  jobId: string
  title: string
  company: string
  status: "applied" | "skipped" | "failed" | "already_applied"
  reason?: string
}

interface ApplicationFlowResult {
  status: "applied" | "skipped"
  reason?: string
}

type ApplyResultHandler = (result: ApplyResult) => Promise<void> | void
type LogHandler = (message: string, type?: string) => Promise<void> | void
type StopHandler = () => boolean | Promise<boolean>

export interface LinkedInBotProfile extends GroqApplicantProfile {
  phone?: string | null
  linkedinUrl?: string | null
  portfolioUrl?: string | null
  city?: string | null
  country?: string | null
  baseCountry?: string | null
  citizenship?: string | null
  noticePeriod?: string | null
  minSalary?: number | null
  salaryExpectation?: string | null
  referralSource?: string | null
  workAuthorization?: string | null
  sponsorshipRequired?: string | null
  openToRelocation?: string | null
  remotePreference?: string | null
  livesInEurope?: string | null
  openToB2BContract?: string | null
  hasPersonalLaptop?: string | null
  workedBefore?: string | null
  inSanctionedTerritories?: string | null
}

interface ApplicationAnswers {
  firstName: string
  lastName: string
  fullName: string
  phone: string
  city: string
  country: string
  baseCountry: string
  citizenship: string
  yearsExperience: string
  currentCompany: string
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeText(value: string | null | undefined): string {
  return (value || "").replace(/\s+/g, " ").trim()
}

function dedupeRepeatedText(value: string): string {
  const text = normalizeText(value)
  const half = text.length / 2
  if (!text || !Number.isInteger(half)) return text
  const first = text.slice(0, half).trim()
  const second = text.slice(half).trim()
  return first && first === second ? first : text
}

function looksLikePlaceholderValue(value: string): boolean {
  const lowered = normalizeText(value).toLowerCase()
  if (!lowered) return true
  return ["select", "select...", "select an option", "choose", "choose an option", "--", "---"].includes(lowered)
}

function fallbackCoverLetter(profile?: LinkedInBotProfile, job?: { title: string; company: string }) {
  const fullName = normalizeText(profile?.fullName) || "Med Aziz Azaiez"
  const currentTitle = normalizeText(profile?.currentTitle) || "professionnel polyvalent"
  const skills = (profile?.skills || []).slice(0, 5).map((v) => normalizeText(v)).filter(Boolean).join(", ")
  return `Bonjour,\n\nJe souhaite proposer ma candidature pour le poste de ${job?.title || "votre offre"} chez ${job?.company || "votre entreprise"}. Mon parcours en ${currentTitle}${skills ? `, avec des competences en ${skills},` : ""} me permet de contribuer rapidement avec serieux, adaptabilite et sens du service.\n\nJe suis motive, a l'aise dans les environnements exigeants et disponible pour echanger plus en detail sur ma motivation et la valeur que je peux apporter a votre equipe.\n\nCordialement,\n${fullName}`
}

function buildDefaultAnswers(email: string): ApplicationAnswers {
  const fullName = normalizeText(process.env.APPLICANT_FULL_NAME)
  const parts = fullName.split(" ").filter(Boolean)
  const firstName = normalizeText(process.env.APPLICANT_FIRST_NAME) || parts[0] || "Med"
  const lastName = normalizeText(process.env.APPLICANT_LAST_NAME) || parts.slice(1).join(" ") || "Aziz"
  return {
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`.trim(),
    phone: normalizeText(process.env.APPLICANT_PHONE) || "+21600000000",
    city: normalizeText(process.env.APPLICANT_CITY) || "Tunis",
    country: normalizeText(process.env.APPLICANT_COUNTRY) || "Tunisia",
    baseCountry: normalizeText(process.env.APPLICANT_BASE_COUNTRY) || normalizeText(process.env.APPLICANT_COUNTRY) || "Tunisia",
    citizenship: normalizeText(process.env.APPLICANT_CITIZENSHIP) || "Tunisian",
    yearsExperience: normalizeText(process.env.APPLICANT_YEARS_EXPERIENCE) || "4",
    currentCompany: normalizeText(process.env.APPLICANT_CURRENT_COMPANY) || "Confidential",
    linkedinUrl: normalizeText(process.env.APPLICANT_LINKEDIN_URL) || "https://linkedin.com/in/medazizazaiez",
    portfolioUrl: normalizeText(process.env.APPLICANT_PORTFOLIO_URL) || normalizeText(process.env.APPLICANT_LINKEDIN_URL) || "https://linkedin.com/in/medazizazaiez",
    noticePeriod: normalizeText(process.env.APPLICANT_NOTICE_PERIOD) || "2 weeks",
    salaryExpectation: normalizeText(process.env.APPLICANT_SALARY_EXPECTATION) || "2000",
    referralSource: normalizeText(process.env.APPLICANT_REFERRAL_SOURCE) || "LinkedIn",
    workAuthorization: process.env.APPLICANT_WORK_AUTH === "no" ? "no" : "yes",
    sponsorshipRequired: process.env.APPLICANT_SPONSORSHIP === "yes" ? "yes" : "no",
    openToRelocation: process.env.APPLICANT_RELOCATION === "no" ? "no" : "yes",
    remotePreference: process.env.APPLICANT_REMOTE === "no" ? "no" : "yes",
    livesInEurope: process.env.APPLICANT_LIVES_IN_EUROPE === "yes" ? "yes" : "no",
    openToB2BContract: process.env.APPLICANT_B2B === "no" ? "no" : "yes",
    hasPersonalLaptop: process.env.APPLICANT_HAS_PERSONAL_LAPTOP === "no" ? "no" : "yes",
    workedBefore: process.env.APPLICANT_WORKED_BEFORE === "yes" ? "yes" : "no",
    inSanctionedTerritories: process.env.APPLICANT_SANCTIONED_TERRITORIES === "yes" ? "yes" : "no",
  }
}

function buildAnswersFromProfile(email: string, profile?: LinkedInBotProfile): ApplicationAnswers {
  const fallback = buildDefaultAnswers(email)
  const fullName = normalizeText(profile?.fullName)
  const parts = fullName.split(" ").filter(Boolean)
  return {
    ...fallback,
    firstName: normalizeText(parts[0]) || fallback.firstName,
    lastName: normalizeText(parts.slice(1).join(" ")) || fallback.lastName,
    fullName: fullName || fallback.fullName,
    phone: normalizeText(profile?.phone) || fallback.phone,
    city: normalizeText(profile?.city) || fallback.city,
    country: normalizeText(profile?.country) || fallback.country,
    baseCountry: normalizeText(profile?.baseCountry) || fallback.baseCountry,
    citizenship: normalizeText(profile?.citizenship) || fallback.citizenship,
    yearsExperience: profile?.yearsExperience ? String(profile.yearsExperience) : fallback.yearsExperience,
    currentCompany: normalizeText(profile?.currentTitle) || fallback.currentCompany,
    linkedinUrl: normalizeText(profile?.linkedinUrl) || fallback.linkedinUrl,
    portfolioUrl: normalizeText(profile?.portfolioUrl) || fallback.portfolioUrl,
    noticePeriod: normalizeText(profile?.noticePeriod) || fallback.noticePeriod,
    salaryExpectation: normalizeText(profile?.salaryExpectation) || (profile?.minSalary ? String(profile.minSalary) : fallback.salaryExpectation),
    referralSource: normalizeText(profile?.referralSource) || fallback.referralSource,
    workAuthorization: profile?.workAuthorization === "no" ? "no" : fallback.workAuthorization,
    sponsorshipRequired: profile?.sponsorshipRequired === "yes" ? "yes" : fallback.sponsorshipRequired,
    openToRelocation: profile?.openToRelocation === "no" ? "no" : fallback.openToRelocation,
    remotePreference: profile?.remotePreference === "no" ? "no" : fallback.remotePreference,
    livesInEurope: profile?.livesInEurope === "yes" ? "yes" : fallback.livesInEurope,
    openToB2BContract: profile?.openToB2BContract === "no" ? "no" : fallback.openToB2BContract,
    hasPersonalLaptop: profile?.hasPersonalLaptop === "no" ? "no" : fallback.hasPersonalLaptop,
    workedBefore: profile?.workedBefore === "yes" ? "yes" : fallback.workedBefore,
    inSanctionedTerritories: profile?.inSanctionedTerritories === "yes" ? "yes" : fallback.inSanctionedTerritories,
  }
}

// ─── Bot ──────────────────────────────────────────────────────────────────────

export class LinkedInBot {
  private browser: Browser | null = null
  private page: Page | null = null
  private cvPath: string
  private email: string
  private password: string
  private storageStatePath = path.resolve(process.cwd(), ".playwright", "linkedin-storage-state.json")
  private answers: ApplicationAnswers
  private applicantProfile?: LinkedInBotProfile
  private onResult?: ApplyResultHandler
  private onLog?: LogHandler
  private shouldStop?: StopHandler
  private currentJobContext = { title: "", company: "", location: "" }
  /** When LinkedIn opens Easy Apply as a popup, this holds that popup page */
  private modalPage: Page | null = null
  private searchTitles: string[] = DEFAULT_JOB_TITLES
  private searchLocations: string[] = [WORLDWIDE_LOCATION]
  private results: ApplyResult[] = []

  constructor(
    email: string,
    password: string,
    cvPath: string,
    profile?: LinkedInBotProfile,
    onResult?: ApplyResultHandler,
    onLog?: LogHandler,
    shouldStop?: StopHandler,
  ) {
    this.email = email
    this.password = password
    this.cvPath = cvPath
    this.applicantProfile = profile
    this.onResult = onResult
    this.onLog = onLog
    this.shouldStop = shouldStop
    this.answers = buildAnswersFromProfile(email, profile)
  }

  // ── Utilities ──────────────────────────────────────────────────────────────

  private async log(message: string, type = "status") {
    console.log(message)
    if (this.onLog) await this.onLog(message, type)
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  private async isStopRequested() {
    return this.shouldStop ? Boolean(await this.shouldStop()) : false
  }

  private async safeClick(el: { click: (o?: { force?: boolean; timeout?: number }) => Promise<unknown>; scrollIntoViewIfNeeded?: () => Promise<void>; evaluate?: <T>(fn: (e: Element) => T) => Promise<T> }) {
    try { if (el.scrollIntoViewIfNeeded) await el.scrollIntoViewIfNeeded().catch(() => {}); await el.click({ timeout: 5000 }); return } catch {}
    try { await el.click({ force: true, timeout: 3000 }); return } catch {}
    if (el.evaluate) await el.evaluate((e) => (e as HTMLElement).click()).catch(() => {})
  }

  // ── Browser / Auth ─────────────────────────────────────────────────────────

  private async persistStorageState() {
    if (!this.page) return
    try {
      fs.mkdirSync(path.dirname(this.storageStatePath), { recursive: true })
      await this.page.context().storageState({ path: this.storageStatePath })
    } catch {}
  }

  private async isLoggedIn() {
    if (!this.page) return false
    const url = this.page.url().toLowerCase()
    if (url.includes("/login")) return false
    if (await this.isVerificationRequired()) return false
    return this.page.evaluate(() => {
      const hasNav = Boolean(document.querySelector("header.global-nav, .global-nav__content, [data-test-global-nav]"))
      const hasFeedLink = Boolean(document.querySelector("a[href*='/feed/'], a[href*='/mynetwork/']"))
      const hasMe = Boolean(document.querySelector(".global-nav__me, button[aria-label*='Me' i]"))
      const hasLoginForm = Boolean(document.querySelector("input[name='session_key'], input[name='session_password'], #username, #password"))
      return (hasNav || hasFeedLink || hasMe) && !hasLoginForm
    }).catch(() => false)
  }

  private async isVerificationRequired() {
    if (!this.page) return false
    const url = this.page.url().toLowerCase()
    if (url.includes("/checkpoint") || url.includes("/challenge") || url.includes("/captcha") || url.includes("/uas/account-restricted")) return true
    const text = await this.page.evaluate(() => document.body?.innerText?.replace(/\s+/g, " ").trim().toLowerCase() || "").catch(() => "")
    return text.includes("quick security check") || text.includes("security verification") || text.includes("captcha") || text.includes("verify your identity") || text.includes("vérification de sécurité") || text.includes("verification de securite")
  }

  private async waitForVerificationResolution() {
    if (!this.page) return false
    await this.log("LinkedIn verification required. Complete it manually in the open browser.", "error")
    for (let i = 0; i < 600; i++) {
      if (await this.isStopRequested()) return false
      await this.sleep(2000)
      if (!(await this.isVerificationRequired())) {
        await this.page.goto("https://www.linkedin.com/feed/", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {})
        await this.sleep(1000)
        if (!(await this.isVerificationRequired()) && (await this.isLoggedIn())) {
          await this.persistStorageState()
          await this.log("Verification completed. Resuming.", "status")
          return true
        }
      }
    }
    await this.log("Verification not completed in time. Stopping.", "error")
    return false
  }

  private async waitForManualLoginResolution() {
    if (!this.page) return false
    await this.log("LinkedIn needs manual login in the open browser.", "error")
    for (let i = 0; i < 600; i++) {
      if (await this.isStopRequested()) return false
      await this.sleep(2000)
      if (await this.isVerificationRequired()) { const ok = await this.waitForVerificationResolution(); if (!ok) return false }
      if (await this.isLoggedIn()) { await this.persistStorageState(); await this.log("Manual login completed. Resuming.", "status"); return true }
    }
    await this.log("Manual login not completed in time. Stopping.", "error")
    return false
  }

  private async ensureVerificationCleared() {
    if (!(await this.isVerificationRequired())) { if (await this.isLoggedIn()) await this.persistStorageState(); return true }
    return this.waitForVerificationResolution()
  }

  async launch() {
    await this.log("Launching browser...")
    this.browser = await chromium.launch({ headless: false, slowMo: 90, args: ["--start-maximized", "--disable-blink-features=AutomationControlled"] })
    const context = await this.browser.newContext({
      viewport: null,
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      storageState: fs.existsSync(this.storageStatePath) ? this.storageStatePath : undefined,
    })
    this.page = await context.newPage()
    await this.log("Browser ready")
  }

  async login(): Promise<boolean> {
    if (!this.page) throw new Error("Browser not launched")
    await this.log("Logging into LinkedIn...")

    await this.page.goto("https://www.linkedin.com/feed/", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {})
    await this.sleep(1000)
    if (await this.isLoggedIn()) { await this.log("Already logged in"); return true }

    await this.page.goto("https://www.linkedin.com/login", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {})
    await this.sleep(800)

    // Accept cookie banner
    for (const btn of await this.page.$$("button:visible").catch(() => [])) {
      const text = normalizeText(await btn.evaluate((el) => (el as HTMLElement).innerText || el.getAttribute("aria-label") || "").catch(() => "")).toLowerCase()
      if (!text || text.includes("reject") || text.includes("decline")) continue
      if (text.includes("accept") || text.includes("agree") || text.includes("allow") || text.includes("accepter")) { await this.safeClick(btn); await this.sleep(600); break }
    }

    if (await this.isVerificationRequired()) return this.waitForVerificationResolution()

    // Fill login form
    let emailInput: any = null
    for (const sel of ["input#username:visible", "input[name='session_key']:visible", "input[type='email']:visible"]) {
      emailInput = await this.page.$(sel).catch(() => null)
      if (emailInput) break
    }
    let passwordInput: any = null
    for (const sel of ["input#password:visible", "input[name='session_password']:visible", "input[type='password']:visible"]) {
      passwordInput = await this.page.$(sel).catch(() => null)
      if (passwordInput) break
    }

    if (emailInput && !passwordInput) {
      await emailInput.fill(this.email).catch(() => {})
      await this.page.keyboard.press("Enter").catch(() => {})
      await this.sleep(800)
      for (const sel of ["input#password:visible", "input[name='session_password']:visible", "input[type='password']:visible"]) {
        passwordInput = await this.page.$(sel).catch(() => null)
        if (passwordInput) break
      }
    }

    if (!emailInput || !passwordInput) return this.waitForManualLoginResolution()

    await emailInput.fill(this.email).catch(() => {})
    await passwordInput.fill(this.password).catch(() => {})

    let signInButton: any = null
    for (const sel of ["button[type='submit']:visible", "input[type='submit']:visible", "button:has-text('Sign in'):visible", "button:has-text('Log in'):visible"]) {
      signInButton = await this.page.$(sel).catch(() => null)
      if (signInButton) break
    }
    if (!signInButton) return this.waitForManualLoginResolution()

    await this.safeClick(signInButton)
    await this.page.waitForLoadState("domcontentloaded", { timeout: 60000 }).catch(() => {})
    await this.sleep(1500)

    if (await this.isLoggedIn()) { await this.persistStorageState(); await this.log("Logged in successfully"); return true }
    if (await this.isVerificationRequired()) {
      const ok = await this.waitForVerificationResolution()
      if (ok && (await this.isLoggedIn())) { await this.persistStorageState(); await this.log("Logged in successfully"); return true }
    }
    return this.waitForManualLoginResolution()
  }

  // ── Job Search ─────────────────────────────────────────────────────────────

  private getFallbackSearchTitles() {
    const desired = (this.applicantProfile?.desiredTitles || []).map((v) => normalizeText(v)).filter(Boolean)
    return desired.length ? Array.from(new Set(desired)) : DEFAULT_JOB_TITLES
  }

  private getSearchLocations() {
    if (this.applicantProfile?.remoteOnly) return ["Remote"]
    const desired = normalizeText(this.applicantProfile?.desiredLocation)
    return desired ? [desired] : [WORLDWIDE_LOCATION]
  }

  private async prepareSearchStrategy() {
    this.searchTitles = this.getFallbackSearchTitles()
    this.searchLocations = this.getSearchLocations()
    if (this.applicantProfile) {
      try {
        const suggestion = await suggestJobTitlesFromProfile(this.applicantProfile)
        if (suggestion?.titles?.length) { this.searchTitles = suggestion.titles; await this.log(`AI selected job titles: ${suggestion.titles.join(", ")}`) }
        else await this.log(`Using profile job titles: ${this.searchTitles.join(", ")}`)
      } catch (e) { await this.log(`AI title selection failed: ${e instanceof Error ? e.message : String(e)}`, "error") }
    }
    await this.log(`Search locations: ${this.searchLocations.join(", ")}`)
  }

  async searchJobs(query: string, location: string): Promise<LinkedInJob[]> {
    if (!this.page) throw new Error("Browser not launched")
    if (!(await this.ensureVerificationCleared())) return []
    await this.log(`Searching: "${query}" in "${location}"`)

    const params = new URLSearchParams({ keywords: query, f_AL: "true", sortBy: "DD" })
    if (location && location.toLowerCase() !== WORLDWIDE_LOCATION.toLowerCase()) params.set("location", location)

    await this.page.goto(`https://www.linkedin.com/jobs/search/?${params.toString()}`, { waitUntil: "domcontentloaded", timeout: 60000 })
    await this.sleep(1800)
    if (!(await this.ensureVerificationCleared())) return []

    try { await this.page.waitForSelector(".jobs-search__results-list, .scaffold-layout__list", { timeout: 10000 }) }
    catch { await this.log("No jobs found for this search", "skipped"); return [] }

    // Scroll to load more jobs
    const list = await this.page.$(".jobs-search__results-list, .scaffold-layout__list").catch(() => null)
    if (list) for (let i = 0; i < 3; i++) { await list.evaluate((el) => el.scrollBy(0, 600)).catch(() => {}); await this.sleep(800) }

    const jobs = await this.page.evaluate(() => {
      const normalize = (v: string | null | undefined) => (v || "").replace(/\s+/g, " ").trim()
      const dedupe = (v: string) => { const t = normalize(v); const half = t.length / 2; if (!Number.isInteger(half)) return t; const a = t.slice(0, half).trim(); const b = t.slice(half).trim(); return a && a === b ? a : t }
      const cards = document.querySelectorAll(".jobs-search__results-list li, .scaffold-layout__list-item")
      const results: LinkedInJob[] = []
      cards.forEach((card) => {
        const titleEl = card.querySelector(".job-card-list__title--link, .job-card-list__title, .job-card-container__link")
        const companyEl = card.querySelector(".job-card-container__company-name, .job-card-container__primary-description, .artdeco-entity-lockup__subtitle")
        const locationEl = card.querySelector(".job-card-container__metadata-item, .artdeco-entity-lockup__caption")
        const linkEl = card.querySelector("a[href*='/jobs/view/']") as HTMLAnchorElement | null
        const applyText = normalize(card.querySelector(".job-card-container__apply-method")?.textContent || card.querySelector(".job-card-list__footer-wrapper")?.textContent || "").toLowerCase()
        if (!titleEl || !linkEl) return
        const href = linkEl.href
        const idMatch = href.match(/\/jobs\/view\/(\d+)/)
        results.push({
          id: idMatch?.[1] || Math.random().toString(),
          title: dedupe(titleEl.getAttribute("aria-label") || titleEl.textContent || linkEl.getAttribute("aria-label") || ""),
          company: normalize(companyEl?.textContent || ""),
          location: normalize(locationEl?.textContent || ""),
          url: href,
          isEasyApply: applyText.includes("easy apply") || applyText.includes("continue to application"),
        })
      })
      return results
    }) as LinkedInJob[]

    await this.log(`Found ${jobs.length} Easy Apply jobs`)
    return jobs
  }

  // ── Apply Flow ─────────────────────────────────────────────────────────────

  async applyToJob(job: LinkedInJob): Promise<ApplyResult> {
    if (!this.page) throw new Error("Browser not launched")
    try {
      if (!(await this.ensureVerificationCleared())) return { jobId: job.id, title: job.title, company: job.company, status: "failed", reason: "LinkedIn verification required" }

      // Navigate to clean standalone job URL (avoids split-view redirect issues)
      const jobUrl = `https://www.linkedin.com/jobs/view/${job.id}/`
      await this.page.goto(jobUrl, { waitUntil: "domcontentloaded", timeout: 60000 })
      await this.page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {})
      await this.sleep(1500)
      if (!(await this.ensureVerificationCleared())) return { jobId: job.id, title: job.title, company: job.company, status: "failed", reason: "LinkedIn verification required" }

      // Get real job details from page
      const details = await this.page.evaluate(() => {
        const read = (sels: string[]) => { for (const s of sels) { const t = (document.querySelector(s)?.textContent || "").replace(/\s+/g, " ").trim(); if (t) return t } return "" }
        return {
          title: read([".job-details-jobs-unified-top-card__job-title h1", ".t-24.job-details-jobs-unified-top-card__job-title", ".jobs-unified-top-card__job-title h1"]),
          company: read([".job-details-jobs-unified-top-card__company-name a", ".job-details-jobs-unified-top-card__company-name", ".jobs-unified-top-card__company-name a"]),
          location: read([".job-details-jobs-unified-top-card__primary-description-container", ".jobs-unified-top-card__subtitle-primary-grouping"]),
        }
      }).catch(() => ({ title: "", company: "", location: "" }))

      const resolvedJob = { ...job, title: details.title || dedupeRepeatedText(job.title), company: details.company || normalizeText(job.company), location: details.location || normalizeText(job.location) }
      this.currentJobContext = { title: resolvedJob.title, company: resolvedJob.company, location: resolvedJob.location }
      await this.log(`Applying to: ${resolvedJob.title} at ${resolvedJob.company || "Unknown company"}`)

      // Skip if already applied
      const alreadyApplied = await this.page.$("[aria-label*='Applied'], button:has-text('Applied'), .jobs-s-apply__application-link").catch(() => null)
      if (alreadyApplied) { await this.log("Already applied. Skipping", "skipped"); return { ...resolvedJob, jobId: resolvedJob.id, status: "already_applied" } }

      // Open Easy Apply modal
      const opened = await this.openEasyApplyModal()
      if (!opened) { await this.log("Easy Apply modal did not open. Skipping.", "skipped"); return { ...resolvedJob, jobId: resolvedJob.id, status: "skipped", reason: "No application modal" } }

      const result = await this.handleApplicationFlow()
      if (result.status === "applied") { await this.log("Applied successfully"); return { ...resolvedJob, jobId: resolvedJob.id, status: "applied" } }

      await this.log(`Skipped. ${result.reason || "Requires extra info"}`, "skipped")
      return { ...resolvedJob, jobId: resolvedJob.id, status: "skipped", reason: result.reason }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      await this.log(`Failed: ${msg}`, "error")
      return { jobId: job.id, title: job.title, company: job.company, status: "failed", reason: msg }
    }
  }

  private async openEasyApplyModal(): Promise<boolean> {
    if (!this.page) return false
    this.modalPage = null

    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0 && (await this.isModalOpen(1500))) { await this.log("Modal already open"); return true }

      // Wait for Easy Apply button to appear (up to 8s on first attempt, 4s after)
      const btnLocator = this.page.locator('button:has-text("Easy Apply"), button[aria-label*="Easy Apply"]').first()
      const waitMs = attempt === 0 ? 8000 : 4000
      try {
        await btnLocator.waitFor({ state: "visible", timeout: waitMs })
      } catch {
        await this.log("Easy Apply button not found", "error")
        return false
      }

      await this.log(`Clicking Easy Apply (attempt ${attempt + 1})`)

      // Listen for popup BEFORE clicking — LinkedIn sometimes opens Easy Apply as a popup window
      const popupPromise = this.page.waitForEvent("popup", { timeout: 4000 }).catch(() => null)
      await btnLocator.click({ force: true }).catch(async () => {
        // Fallback: mouse click at button center
        const box = await btnLocator.boundingBox().catch(() => null)
        if (box) await this.page!.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      })

      // Check if a popup opened (Easy Apply in popup window)
      const popup = await popupPromise
      if (popup) {
        await this.log("Easy Apply opened as popup — switching to popup")
        await popup.waitForLoadState("domcontentloaded").catch(() => {})
        this.modalPage = popup
        if (await this.isModalOpen(5000)) return true
        this.modalPage = null
      }

      // Otherwise check for overlay modal on main page
      if (await this.isModalOpen(8000 + attempt * 2000)) return true
      await this.log(`Modal did not appear on attempt ${attempt + 1}. Retrying...`, "status")
    }
    return false
  }

  /** Returns the active page context: popup if Easy Apply opened as popup, otherwise main page */
  private get activePage(): Page | null { return this.modalPage ?? this.page }

  /** Detects the Easy Apply modal by looking for the "Apply to [Company]" heading */
  private async isModalOpen(timeoutMs = 2000): Promise<boolean> {
    const p = this.activePage
    if (!p) return false
    try {
      await p.locator("h1, h2, h3, h4, [role='heading']")
        .filter({ hasText: /apply to|postuler (à|a)|candidature/i })
        .first()
        .waitFor({ state: "visible", timeout: timeoutMs })
      return true
    } catch { return false }
  }

  private async handleApplicationFlow(): Promise<ApplicationFlowResult> {
    if (!this.page) return { status: "skipped", reason: "No page" }

    for (let step = 0; step < 12; step++) {
      try {
        if (!(await this.ensureVerificationCleared())) return { status: "skipped", reason: "Verification required" }
        if (await this.isStopRequested()) { await this.dismissModal(); return { status: "skipped", reason: "Stopped manually" } }

        // Check modal still open
        if (!(await this.isModalOpen(3000))) {
          if (await this.wasSubmitted()) return { status: "applied", reason: "Submitted" }
          return { status: "skipped", reason: step === 0 ? "Modal disappeared" : "Modal closed before submit" }
        }

        // Log step info
        const heading = await this.activePage!.locator("h1, h2, h3, h4, [role='heading']").filter({ hasText: /apply to|postuler (à|a)|candidature/i }).first().textContent().catch(() => "")
        await this.log(`Step ${step}${heading ? ` - ${heading.trim()}` : ""}`)

        // Fill form fields — wait a bit first for the modal content to fully render
        await this.sleep(1200)
        await this.fillStep()
        await this.sleep(500)

        // Click Next / Submit
        const clicked = await this.clickNextButton()
        if (!clicked) return { status: "skipped", reason: "Could not find Next button" }

        await this.sleep(1800)

        // Check if submitted
        if (await this.wasSubmitted()) {
          const ap = this.activePage
          const done = await ap?.$("button[aria-label='Dismiss'], button:has-text('Done'), button:has-text('OK')").catch(() => null)
          if (done) await this.safeClick(done)
          if (this.modalPage) { await this.modalPage.close().catch(() => {}); this.modalPage = null }
          await this.log("Application submitted")
          return { status: "applied", reason: "Submitted" }
        }

        // Log inline errors but keep going
        const err = await this.getInlineError()
        if (err) await this.log(`Form error: ${err}`, "error")

      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        if (msg.includes("Execution context was destroyed") || msg.includes("navigation")) { await this.sleep(1500); continue }
        await this.log(`Step error: ${msg}`, "error")
        await this.sleep(1000)
      }
    }

    return { status: "skipped", reason: "Reached step limit" }
  }

  /**
   * Clicks the Next / Continue / Submit button in the Easy Apply modal.
   *
   * Strategy order:
   *  1. LinkedIn's primary button class (most reliable)
   *  2. getByRole with partial text match — no ^ $ anchors so "Continue to next step" matches
   *  3. Any visible button whose text contains an action keyword
   */
  private async clickNextButton(): Promise<boolean> {
    const p = this.activePage
    if (!p) return false

    // All strategies use activePage (popup or main page) with Playwright locators
    // which pierce shadow DOM — unlike page.$$() / page.evaluate()

    // 1. Wait up to 6s for primary button (modal renders heading first, buttons slightly after)
    const primaryLocator = p.locator("button.artdeco-button--primary").last()
    try {
      await primaryLocator.waitFor({ state: "visible", timeout: 6000 })
      const label = await primaryLocator.textContent().catch(() => "")
      await this.log(`Clicking: ${label?.trim() || "primary button"}`)
      await primaryLocator.click({ force: true })
      return true
    } catch { /* not found, try other strategies */ }

    // 2. :has-text() matches partial visible text, pierces shadow DOM
    const actionTexts = [
      "Submit application", "Submit", "Next", "Continue to next step", "Continue",
      "Review your application", "Review", "Send", "Envoyer", "Soumettre", "Postuler",
    ]
    for (const text of actionTexts) {
      const loc = p.locator(`button:has-text("${text}")`).last()
      const count = await loc.count().catch(() => 0)
      if (count > 0) {
        await this.log(`Clicking: ${text}`)
        await loc.click({ force: true }).catch(() => {})
        return true
      }
    }

    // 3. getByRole partial pattern
    const actionPattern = /next|suivant|continue|continuer|review|submit|send|envoyer|soumettre|postuler/i
    const byRole = p.getByRole("button", { name: actionPattern })
    const roleCount = await byRole.count().catch(() => 0)
    if (roleCount > 0) {
      const btn = byRole.last()
      const label = await btn.textContent().catch(() => "")
      await this.log(`Clicking (role): ${label?.trim() || "action button"}`)
      await btn.click({ force: true }).catch(() => {})
      return true
    }

    // Diagnostic
    const allVisible = await p.locator("button").allTextContents().catch(() => [] as string[])
    await this.log(`No Next button. Buttons on ${this.modalPage ? "popup" : "main"} page: ${allVisible.filter(Boolean).slice(0, 15).join(" | ")}`, "error")
    return false
  }

  // ── Form Filling ───────────────────────────────────────────────────────────

  private async fillStep() {
    await this.uploadCV()
    await this.fillTextInputs()
    await this.answerSelects()
    await this.answerRadioButtons()
    await this.answerCheckboxes()
    await this.answerComboboxes()
  }

  private async isInteractableField(field: { evaluate: <T>(fn: (el: Element) => T) => Promise<T> }) {
    return field.evaluate((el) => {
      const html = el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      const disabled = "disabled" in html ? Boolean(html.disabled) : false
      const readOnly = "readOnly" in html ? Boolean((html as HTMLInputElement).readOnly) : false
      return !disabled && !readOnly && el.getAttribute("aria-disabled") !== "true"
    }).catch(() => true)
  }

  private async fireReactEvents(field: { evaluate: <T>(fn: (el: Element) => T) => Promise<T> }) {
    await field.evaluate((el) => {
      const input = el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      try {
        const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
        const descriptor = Object.getOwnPropertyDescriptor(proto, "value")
        if (descriptor?.set) descriptor.set.call(input, input.value)
      } catch {}
      el.dispatchEvent(new Event("input", { bubbles: true }))
      el.dispatchEvent(new Event("change", { bubbles: true }))
      el.dispatchEvent(new FocusEvent("blur", { bubbles: true }))
    }).catch(() => {})
  }

  private async getFieldPrompt(field: { evaluate: <T>(fn: (el: Element) => T) => Promise<T> }) {
    const prompt = await field.evaluate((el) => {
      const input = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      const id = input.id
      const ownLabel = id ? document.querySelector(`label[for="${id}"]`) : null
      const wrapper = input.closest("[data-test-form-element], .jobs-easy-apply-form-section__grouping, .fb-dash-form-element, fieldset") || input.parentElement
      return [ownLabel?.textContent, input.getAttribute("aria-label"), input.getAttribute("placeholder"), input.getAttribute("name"), wrapper?.textContent].filter(Boolean).join(" ").replace(/\s+/g, " ").trim().toLowerCase()
    }).catch(() => "")
    return normalizeText(prompt).toLowerCase()
  }

  private describeFieldLabel(label: string) {
    const v = normalizeText(label)
    if (!v) return "field"
    if (v.includes("first name")) return "first name"
    if (v.includes("last name") || v.includes("family name")) return "last name"
    if (v.includes("full name")) return "full name"
    if (v.includes("email")) return "email"
    if (v.includes("phone") || v.includes("mobile")) return "phone"
    if (v.includes("city") || v.includes("ville")) return "city"
    if (v.includes("country") || v.includes("citizenship") || v.includes("nationality")) return "country"
    if (v.includes("salary")) return "salary"
    if (v.includes("notice")) return "notice period"
    if (v.includes("experience")) return "experience"
    if (v.includes("linkedin")) return "linkedin"
    if (v.includes("portfolio") || v.includes("website")) return "portfolio"
    if (v.includes("source")) return "source"
    return v.split(" ").slice(0, 6).join(" ")
  }

  private isProfileDrivenQuestion(label: string) {
    const l = label.toLowerCase()
    return l.includes("how did you hear") || l.includes("where did you hear") || l.includes("source") || l.includes("citizenship") || l.includes("based in") || l.includes("personal laptop") || l.includes("worked before") || l.includes("worked with our company") || l.includes("sanctioned territories")
  }

  private guessAnswer(label: string) {
    const l = label.toLowerCase()
    if (l.includes("first name") || l.includes("prenom") || l.includes("prénom")) return this.answers.firstName
    if (l.includes("last name") || l.includes("family name") || l.includes("nom")) return this.answers.lastName
    if (l.includes("full name")) return this.answers.fullName
    if (l.includes("email")) return this.email
    if (l.includes("phone") || l.includes("mobile") || l.includes("téléphone")) return this.answers.phone
    if (l.includes("city") || l.includes("ville")) return this.answers.city
    if (l.includes("country are you based in") || l.includes("based in")) return this.answers.baseCountry
    if (l.includes("country") || l.includes("pays") || l.includes("nationality")) return this.answers.country
    if (l.includes("citizenship")) return this.answers.citizenship
    if (l.includes("linkedin")) return this.answers.linkedinUrl
    if (l.includes("portfolio") || l.includes("website")) return this.answers.portfolioUrl
    if (l.includes("salary") || l.includes("salaire") || l.includes("compensation")) return this.answers.salaryExpectation
    if (l.includes("notice")) return this.answers.noticePeriod
    if (l.includes("experience") || l.includes("année") || l.includes("year")) return this.answers.yearsExperience
    if (l.includes("how did you hear") || l.includes("source")) return this.answers.referralSource
    return ""
  }

  private async fillTextInputs() {
    const p = this.activePage
    if (!p) return
    const inputs = await p.$$("input[type='text']:visible, input[type='tel']:visible, input[type='number']:visible, input[type='email']:visible, textarea:visible").catch(() => [])
    for (const input of inputs) {
      try {
        if (!(await this.isInteractableField(input))) continue
        const label = await this.getFieldPrompt(input)
        const currentValue = normalizeText(await input.inputValue().catch(() => ""))

        if (label.includes("location") && (label.includes("city") || label.includes("ville"))) {
          await this.fillLocationField(input, currentValue); continue
        }
        if (currentValue) { await this.fireReactEvents(input); continue }

        const isTextarea = await input.evaluate((el) => el.tagName.toLowerCase() === "textarea").catch(() => false)
        if (isTextarea && /cover letter|motivation|why are you|why do you want/i.test(label)) {
          const letter = await this.generateCoverLetter()
          await input.fill(letter).catch(() => {})
          await this.log(`Filled cover letter`)
          await this.fireReactEvents(input); await this.sleep(250); continue
        }

        const guessed = this.guessAnswer(label)
        if (guessed) {
          await input.fill(guessed).catch(() => {})
          await this.log(`Filled ${this.describeFieldLabel(label)}: ${guessed}`)
          await this.fireReactEvents(input); await this.sleep(250); continue
        }

        // Groq fallback
        if (USE_GROQ_FOR_COMPLEX_FORMS && this.applicantProfile) {
          const decision = await askGroqForFieldAnswer({ question: label, fieldType: "text", applicant: this.applicantProfile, job: this.currentJobContext }).catch(() => null)
          if (decision?.answer && !decision.shouldPause && decision.confidence >= 60) {
            await input.fill(decision.answer).catch(() => {})
            await this.log(`Groq filled: ${decision.answer}`)
          }
        }
      } catch {}
    }
  }

  private async fillLocationField(input: any, currentValue = "") {
    const city = this.answers.city
    const country = this.answers.baseCountry || this.answers.country
    if (currentValue.toLowerCase().includes(city.toLowerCase())) {
      await input.click({ force: true }).catch(() => {})
      const ap = this.activePage
      if (ap) await ap.keyboard.press("Tab").catch(() => {})
      return
    }
    for (const term of [`${city}, ${country}`, city]) {
      await input.click({ force: true }).catch(() => {})
      await input.fill(term).catch(() => {})
      await this.log(`Typing location search: ${term}`)
      await this.sleep(1100)
      const ap = this.activePage
      if (ap) {
        const candidates = await ap.$$("[role='option'], .basic-typeahead__selectable, .artdeco-typeahead__result, [data-test-autocomplete-dropdown] li").catch(() => [])
        for (const c of candidates) {
          const text = normalizeText(await c.textContent().catch(() => "")).toLowerCase()
          if (text && (text.includes(term.toLowerCase()) || text.includes(city.toLowerCase()))) {
            await this.safeClick(c); await this.sleep(350)
            await this.log(`Selected location option: ${text}`); return
          }
        }
      }
      if (input.press) { await input.press("ArrowDown").catch(() => {}); await input.press("Enter").catch(() => {}) }
    }
  }

  private async answerSelects() {
    const p = this.activePage
    if (!p) return
    const selects = await p.$$("select:visible").catch(() => [])
    for (const select of selects) {
      try {
        if (!(await this.isInteractableField(select))) continue
        const selectedText = normalizeText(await select.evaluate((el) => ((el as HTMLSelectElement).selectedOptions?.[0]?.textContent || "")).catch(() => ""))
        if (await select.inputValue().catch(() => "") && !looksLikePlaceholderValue(selectedText)) { await this.fireReactEvents(select); continue }

        const label = await this.getFieldPrompt(select)
        const options = await select.$$eval("option", (nodes) => nodes.map((n) => ({ value: (n as HTMLOptionElement).value, text: n.textContent?.trim().toLowerCase() || "" }))).catch(() => [] as { value: string; text: string }[])
        const guessed = this.guessAnswer(label).toLowerCase()
        const matched = options.find((o) => guessed && (o.text.includes(guessed) || o.value.toLowerCase() === guessed))
        if (matched?.value) { await select.selectOption(matched.value).catch(() => {}); await this.log(`Selected ${this.describeFieldLabel(label)}: ${matched.text}`); continue }

        if (this.isProfileDrivenQuestion(label) && USE_GROQ_FOR_COMPLEX_FORMS && this.applicantProfile) {
          const decision = await askGroqForFieldAnswer({ question: label, fieldType: "select", options: options.map((o) => o.text), applicant: this.applicantProfile, job: this.currentJobContext }).catch(() => null)
          const groqMatch = decision?.answer ? options.find((o) => o.text.includes(decision.answer.toLowerCase())) : null
          if (groqMatch?.value) { await select.selectOption(groqMatch.value).catch(() => {}); await this.log(`Groq selected: ${decision?.answer}`); continue }
        }

        if (options.length > 1 && options[1]?.value) { await select.selectOption(options[1].value).catch(() => {}); await this.log(`Selected ${this.describeFieldLabel(label)}: ${options[1].text}`) }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (!msg.includes("Execution context was destroyed")) await this.log(`Skipped stale select: ${msg}`)
      }
    }
  }

  private async answerRadioButtons() {
    const p = this.activePage
    if (!p) return
    const radios = await p.$$("input[type='radio']:visible").catch(() => [])
    const processed = new Set<string>()
    for (const radio of radios) {
      try {
        const name = normalizeText(await radio.getAttribute("name").catch(() => ""))
        const id = normalizeText(await radio.getAttribute("id").catch(() => ""))
        const key = name || id
        if (!key || processed.has(key)) continue
        processed.add(key)

        const checked = name ? await p.$(`input[type='radio'][name="${name}"]:checked`).catch(() => null) : await p.$(`#${id}:checked`).catch(() => null)
        if (checked) continue

        const container = await radio.evaluateHandle((el) => el.closest("fieldset, [role='radiogroup'], [data-test-form-element], .jobs-easy-apply-form-section__grouping, .fb-dash-form-element") || el.parentElement).catch(() => null)
        const group = container?.asElement()
        const text = normalizeText(await group?.textContent().catch(() => "")).toLowerCase()
        const desired = text.includes("authorized") || text.includes("work permit") || text.includes("legally") ? this.answers.workAuthorization
          : text.includes("sponsor") ? this.answers.sponsorshipRequired
          : text.includes("relocat") ? this.answers.openToRelocation
          : text.includes("remote") ? this.answers.remotePreference
          : text.includes("europe") ? this.answers.livesInEurope
          : text.includes("laptop") || text.includes("pc") ? this.answers.hasPersonalLaptop
          : text.includes("worked before") ? this.answers.workedBefore
          : "yes"

        const groupRadios = name ? await p.$$(`input[type='radio'][name="${name}"]`).catch(() => []) : group ? await group.$$("input[type='radio']").catch(() => []) : [radio]
        let selected = false
        for (const option of groupRadios) {
          const value = normalizeText(await option.getAttribute("value").catch(() => "")).toLowerCase()
          const optionId = await option.getAttribute("id")
          const labelEl = optionId ? await p.$(`label[for="${optionId}"]`).catch(() => null) : null
          const labelText = normalizeText(await labelEl?.textContent().catch(() => "")).toLowerCase()
          if (value === desired || labelText === desired || labelText.includes(` ${desired}`) || labelText.startsWith(`${desired} `)) {
            await option.check().catch(() => {}); selected = true; break
          }
        }
        if (!selected && groupRadios[0]) await groupRadios[0].check().catch(() => {})
        await container?.dispose().catch(() => {})
      } catch {}
    }
  }

  private async answerCheckboxes() {
    const p = this.activePage
    if (!p) return
    const checkboxes = await p.$$("input[type='checkbox']:visible").catch(() => [])
    for (const checkbox of checkboxes) {
      try {
        if (!(await this.isInteractableField(checkbox))) continue
        if (await checkbox.isChecked().catch(() => false)) continue
        const required = await checkbox.evaluate((el) => {
          const input = el as HTMLInputElement
          if (input.required || el.getAttribute("aria-required") === "true") return true
          const wrapper = input.closest("[data-test-form-element], .jobs-easy-apply-form-section__grouping, .fb-dash-form-element, fieldset") || input.parentElement
          return (wrapper?.textContent || "").includes("*")
        }).catch(() => false)
        if (required) await checkbox.check().catch(() => {})
      } catch {}
    }
  }

  private async answerComboboxes() {
    const p = this.activePage
    if (!p) return
    const comboboxes = await p.$$("[role='combobox']:visible, button[aria-haspopup='listbox']:visible, input[role='combobox']:visible").catch(() => [])
    for (const combobox of comboboxes) {
      try {
        if (!(await this.isInteractableField(combobox))) continue
        const label = await this.getFieldPrompt(combobox)
        const currentValue = normalizeText(await combobox.evaluate((el) => el instanceof HTMLInputElement ? el.value || "" : (el.textContent || el.getAttribute("title") || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim()).catch(() => ""))
        const l = label.toLowerCase()

        if (currentValue && !looksLikePlaceholderValue(currentValue)) {
          await combobox.click({ force: true }).catch(() => {})
          await p.keyboard.press("Escape").catch(() => {})
          continue
        }
        if (l.includes("phone country code") || l.includes("country code")) {
          await this.selectComboboxOption(combobox, [`${this.answers.country} (${normalizeText(this.answers.phone).match(/\+\d{1,4}/)?.[0] || "+216"})`, this.answers.country, "+216"])
          continue
        }
        if (l.includes("country") || l.includes("pays") || l.includes("nationality") || l.includes("citizenship")) {
          await this.selectComboboxOption(combobox, [this.answers.citizenship, this.answers.country, `${this.answers.city}, ${this.answers.country}`])
          continue
        }
        if (l.includes("source") || l.includes("how did you hear")) {
          await this.selectComboboxOption(combobox, [this.answers.referralSource, "LinkedIn"])
          continue
        }
        if (USE_GROQ_FOR_COMPLEX_FORMS && this.applicantProfile && this.isProfileDrivenQuestion(label)) {
          await this.answerComboboxWithGroq(combobox, label)
        }
      } catch {}
    }
  }

  private async selectComboboxOption(combobox: any, desiredOptions: string[]) {
    const p = this.activePage
    if (!p) return null
    for (const desired of desiredOptions.filter(Boolean)) {
      await combobox.click({ force: true }).catch(() => {})
      await this.sleep(250)
      const isInput = await combobox.evaluate((el: Element) => el instanceof HTMLInputElement).catch(() => false)
      if (isInput && combobox.fill) await combobox.fill(desired).catch(() => {})
      else { await p!.keyboard.press("Control+A").catch(() => {}); await p!.keyboard.type(desired, { delay: 25 }).catch(() => {}) }
      await this.sleep(700)
      const options = await p!.$$("[role='option'], div[role='option'], li, .basic-typeahead__selectable, .artdeco-typeahead__result").catch(() => [])
      for (const option of options) {
        const text = normalizeText(await option.textContent().catch(() => "")).toLowerCase()
        if (text && (text === desired.toLowerCase() || text.includes(desired.toLowerCase()))) {
          await this.safeClick(option); await this.sleep(350)
          return normalizeText(await option.textContent().catch(() => ""))
        }
      }
      if (combobox.press) { await combobox.press("ArrowDown").catch(() => {}); await combobox.press("Enter").catch(() => {}) }
      await this.sleep(350)
      const value = combobox.inputValue ? normalizeText(await combobox.inputValue().catch(() => "")) : ""
      if (value) return value
    }
    return null
  }

  private async answerComboboxWithGroq(combobox: any, label: string) {
    const p = this.activePage
    if (!p || !USE_GROQ_FOR_COMPLEX_FORMS || !this.applicantProfile) return null
    await combobox.click({ force: true }).catch(() => {})
    await this.sleep(350)
    const options = await p.$$eval("[role='option'], div[role='option'], li, .basic-typeahead__selectable, .artdeco-typeahead__result", (nodes) => nodes.map((n) => n.textContent?.replace(/\s+/g, " ").trim() || "").filter(Boolean).slice(0, 20)).catch(() => [] as string[])
    if (!options.length) return null
    const decision = await askGroqForFieldAnswer({ question: label, fieldType: "select", options, applicant: this.applicantProfile, job: this.currentJobContext }).catch(() => null)
    if (!decision?.answer || decision.shouldPause || decision.confidence < 65) return null
    const selected = await this.selectComboboxOption(combobox, [decision.answer, ...options.filter((o) => o.toLowerCase().includes(decision.answer.toLowerCase())).slice(0, 3)])
    if (selected) await this.log(`Groq selected: ${decision.answer}`)
    return selected
  }

  private async uploadCV() {
    const p = this.activePage
    if (!p) return false
    const fileInputs = await p.$$("input[type='file']").catch(() => [])
    for (const fileInput of fileInputs) {
      const visible = await fileInput.evaluate((el) => {
        const r = el.getBoundingClientRect()
        const s = window.getComputedStyle(el as HTMLElement)
        return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden"
      }).catch(() => false)
      if (!visible) continue
      const existing = await fileInput.evaluate((el) => (el as HTMLInputElement).files?.length || 0).catch(() => 0)
      if (existing > 0) { await this.log("CV already attached"); return true }
      const context = await fileInput.evaluate((el) => {
        const wrapper = el.closest("[data-test-form-element], .jobs-easy-apply-form-section__grouping, .fb-dash-form-element") || el.parentElement
        return (wrapper?.textContent || "").replace(/\s+/g, " ").trim().toLowerCase()
      }).catch(() => "")
      if (context && !context.includes("resume") && !context.includes("cv") && !context.includes("curriculum")) continue
      await fileInput.setInputFiles(path.resolve(this.cvPath)).catch(() => {})
      await this.log("CV uploaded"); await this.sleep(800); return true
    }
    return false
  }

  private async generateCoverLetter() {
    const generated = await generateFrenchCoverLetter({ applicant: this.applicantProfile || {}, job: this.currentJobContext }).catch(() => null)
    return String(generated || "").trim() || fallbackCoverLetter(this.applicantProfile, this.currentJobContext)
  }

  // ── State Checks ───────────────────────────────────────────────────────────

  private async wasSubmitted() {
    const p = this.activePage
    if (!p) return false
    const body = await p.evaluate(() => document.body?.innerText?.replace(/\s+/g, " ").trim().toLowerCase() || "").catch(() => "")
    if (body.includes("application submitted") || body.includes("your application was sent") || body.includes("application sent") || body.includes("candidature envoy")) return true
    return Boolean(await p.$("[aria-label*='Applied'], button:has-text('Applied'), .jobs-s-apply__application-link").catch(() => null))
  }

  private async getInlineError() {
    const p = this.activePage
    if (!p) return ""
    return p.evaluate(() => {
      for (const node of Array.from(document.querySelectorAll(".artdeco-inline-feedback--error"))) {
        const el = node as HTMLElement
        const r = el.getBoundingClientRect()
        const s = window.getComputedStyle(el)
        if (r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden") {
          const text = el.textContent?.replace(/\s+/g, " ").trim() || ""
          if (text) return text
        }
      }
      return ""
    }).catch(() => "")
  }

  private async dismissModal() {
    const p = this.activePage
    if (!p) return
    const close = await p.$("button[aria-label='Dismiss'], button[aria-label='Close']").catch(() => null)
    if (close) { await this.safeClick(close); await this.sleep(400) }
    const discard = await p.$("button:has-text('Discard'), button:has-text('Exit'), button:has-text('Cancel')").catch(() => null)
    if (discard) { await this.safeClick(discard); await this.sleep(400) }
    if (this.modalPage) { await this.modalPage.close().catch(() => {}); this.modalPage = null }
  }

  // ── Main Run ───────────────────────────────────────────────────────────────

  async close() {
    if (this.browser) { await this.browser.close(); this.browser = null }
  }

  async run(email: string, password: string): Promise<ApplyResult[]> {
    this.email = email
    this.password = password
    try {
      await this.launch()
      const loggedIn = await this.login()
      if (!loggedIn) { await this.log("Could not log in. Stopping", "error"); return [] }
      await this.prepareSearchStrategy()

      let totalApplied = 0
      for (const title of this.searchTitles) {
        if (await this.isStopRequested()) break
        for (const location of this.searchLocations) {
          if (await this.isStopRequested() || totalApplied >= MAX_APPLIES_PER_RUN) break
          const jobs = await this.searchJobs(title, location)
          for (const job of jobs) {
            if (await this.isStopRequested() || totalApplied >= MAX_APPLIES_PER_RUN) break
            if (!job.isEasyApply) { await this.log("Skipping (not Easy Apply)", "skipped"); continue }
            const result = await this.applyToJob(job)
            this.results.push(result)
            if (this.onResult) await this.onResult(result)
            if (result.status === "applied") totalApplied++
            await this.sleep(DELAY_BETWEEN_JOBS)
          }
        }
      }

      await this.log("Run complete", "done")
      await this.log(`Applied: ${this.results.filter((r) => r.status === "applied").length}`, "done")
      await this.log(`Skipped: ${this.results.filter((r) => r.status === "skipped").length}`, "done")
      await this.log(`Failed: ${this.results.filter((r) => r.status === "failed").length}`, "done")
      return this.results
    } finally {
      await this.close()
    }
  }
}
