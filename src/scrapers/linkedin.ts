import { chromium, Browser, Page, ElementHandle } from "playwright"
import * as path from "path"
import * as fs from "fs"
import {
  askGroqForFieldAnswer,
  suggestJobTitlesFromProfile,
  type GroqApplicantProfile,
} from "../lib/groq-apply"

const DEFAULT_JOB_TITLES = [
  "Centre d'appel",
  "Call Center Agent",
  "Customer Service Representative",
  "Teleconseiller",
  "Teleconseiller Francophone",
  "Customer Support Specialist",
  "Agent Support Client",
  "Customer Advisor",
  "Call Center Representative",
  "Customer Care Agent",
  "Customer Experience Specialist",
  "Service Client",
  "Conseiller Client",
  "Conseiller Clientele",
  "Agent Centre d'Appel",
  "Charge Clientele",
  "Inbound Call Center Agent",
  "Outbound Call Center Agent",
  "Bilingual Customer Support",
  "French Customer Service",
  "Support Client Francophone",
  "Teleoperateur",
  "Agent Relation Client",
  "Agent Relation Clientele",
  "Conseiller Commercial",
  "Commercial Sedentaire",
  "Inside Sales Representative",
  "Sales Development Representative",
  "Appointment Setter",
  "Lead Generation Specialist",
  "Support Technique",
  "Technical Support Agent",
  "Help Desk Agent",
  "IT Support Specialist",
  "Back Office Agent",
  "Back Office Executive",
  "Chat Support Agent",
  "Email Support Agent",
  "Client Success Specialist",
  "Customer Success Associate",
  "Customer Onboarding Specialist",
  "Retention Specialist",
  "Collections Agent",
  "Receptionist",
  "Virtual Assistant",
]
const WORLDWIDE_LOCATION = "Worldwide"
const MAX_APPLIES_PER_RUN = 20
const DELAY_BETWEEN_JOBS = 3000
const PAUSE_BEFORE_SUBMIT = false
const USE_GROQ_FOR_COMPLEX_FORMS = true

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

interface ActionButtonMatch {
  handle: ElementHandle
  label: string
}

interface ApplyRootSnapshot {
  found: boolean
  score: number
  title: string
  fields: number
  buttons: string[]
  text: string
}

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
  private searchTitles: string[] = DEFAULT_JOB_TITLES
  private searchLocations: string[] = [WORLDWIDE_LOCATION]
  private results: ApplyResult[] = []

  constructor(email: string, password: string, cvPath: string, profile?: LinkedInBotProfile, onResult?: ApplyResultHandler, onLog?: LogHandler, shouldStop?: StopHandler) {
    this.email = email
    this.password = password
    this.cvPath = cvPath
    this.applicantProfile = profile
    this.onResult = onResult
    this.onLog = onLog
    this.shouldStop = shouldStop
    this.answers = buildAnswersFromProfile(email, profile)
  }

  private async log(message: string, type = "status") {
    console.log(message)
    if (this.onLog) await this.onLog(message, type)
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  private async persistStorageState() {
    if (!this.page) return
    try {
      fs.mkdirSync(path.dirname(this.storageStatePath), { recursive: true })
      await this.page.context().storageState({ path: this.storageStatePath })
    } catch {}
  }

  private async isStopRequested() {
    return this.shouldStop ? Boolean(await this.shouldStop()) : false
  }

  private getFallbackSearchTitles() {
    const desired = (this.applicantProfile?.desiredTitles || []).map((value) => normalizeText(value)).filter(Boolean)
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

    if (!this.applicantProfile) {
      await this.log(`Search locations: ${this.searchLocations.join(", ")}`)
      return
    }

    try {
      const suggestion = await suggestJobTitlesFromProfile(this.applicantProfile)
      if (suggestion?.titles?.length) {
        this.searchTitles = suggestion.titles
        await this.log(`AI selected job titles: ${suggestion.titles.join(", ")}`)
      } else {
        await this.log(`Using profile job titles: ${this.searchTitles.join(", ")}`)
      }
    } catch (error) {
      await this.log(`AI title selection failed, using fallback titles: ${error instanceof Error ? error.message : String(error)}`, "error")
    }

    await this.log(`Search locations: ${this.searchLocations.join(", ")}`)
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
    await this.log("The browser will stay open on the verification page until you finish.", "status")

    for (let attempt = 0; attempt < 600; attempt++) {
      if (await this.isStopRequested()) return false
      await this.sleep(2000)
      if (!(await this.isVerificationRequired())) {
        await this.page.goto("https://www.linkedin.com/feed/", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {})
        await this.sleep(1000)
        if (!(await this.isVerificationRequired()) && (await this.isLoggedIn())) {
          await this.persistStorageState()
          await this.log("LinkedIn verification completed. Resuming bot.", "status")
          return true
        }
      }
    }

    await this.log("Verification was not completed in time. Stopping LinkedIn run.", "error")
    return false
  }

  private async waitForManualLoginResolution() {
    if (!this.page) return false
    await this.log("LinkedIn needs manual login in the open browser.", "error")
    await this.log("Complete the login or challenge manually, and the bot will resume when LinkedIn reaches the home feed.", "status")

    for (let attempt = 0; attempt < 600; attempt++) {
      if (await this.isStopRequested()) return false
      await this.sleep(2000)
      if (await this.isVerificationRequired()) {
        const ok = await this.waitForVerificationResolution()
        if (!ok) return false
      }
      if (await this.isLoggedIn()) {
        await this.persistStorageState()
        await this.log("Manual LinkedIn login completed. Resuming bot.", "status")
        return true
      }
    }

    await this.log("Manual LinkedIn login was not completed in time. Stopping LinkedIn run.", "error")
    return false
  }

  private async ensureVerificationCleared() {
    if (!(await this.isVerificationRequired())) {
      if (await this.isLoggedIn()) await this.persistStorageState()
      return true
    }
    return this.waitForVerificationResolution()
  }

  private async maybeAcceptCookieBanner() {
    if (!this.page) return
    const buttons = await this.page.$$("button:visible").catch(() => [])
    for (const button of buttons) {
      const text = normalizeText(await button.evaluate((el) => (el as HTMLElement).innerText || el.getAttribute("aria-label") || "").catch(() => "")).toLowerCase()
      if (!text || text.includes("reject") || text.includes("decline") || text.includes("refuse")) continue
      if (text.includes("accept") || text.includes("agree") || text.includes("allow") || text.includes("accepter") || text.includes("autoriser")) {
        await this.safeClick(button)
        await this.sleep(600)
        return
      }
    }
  }

  private async findLoginInputs() {
    if (!this.page) return { emailInput: null as any, passwordInput: null as any }
    let emailInput = null
    for (const selector of ["input#username:visible", "input[name='session_key']:visible", "input[type='email']:visible", "input[autocomplete='username']:visible", "input[autocomplete='email']:visible"]) {
      emailInput = await this.page.$(selector).catch(() => null)
      if (emailInput) break
    }

    let passwordInput = null
    for (const selector of ["input#password:visible", "input[name='session_password']:visible", "input[type='password']:visible", "input[autocomplete='current-password']:visible"]) {
      passwordInput = await this.page.$(selector).catch(() => null)
      if (passwordInput) break
    }

    return { emailInput, passwordInput }
  }

  private async findSignInButton() {
    if (!this.page) return null
    for (const selector of ["button[type='submit']:visible", "input[type='submit']:visible", "button:has-text('Sign in'):visible", "button:has-text('Log in'):visible", "button:has-text('Se connecter'):visible"]) {
      const button = await this.page.$(selector).catch(() => null)
      if (button) return button
    }
    return null
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
    if (await this.isLoggedIn()) {
      await this.log("Already logged in")
      return true
    }

    await this.page.goto("https://www.linkedin.com/login", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {})
    await this.sleep(800)
    await this.maybeAcceptCookieBanner()

    if (await this.isVerificationRequired()) return this.waitForVerificationResolution()

    let { emailInput, passwordInput } = await this.findLoginInputs()
    if (emailInput && !passwordInput) {
      await emailInput.fill(this.email).catch(() => {})
      await this.page.keyboard.press("Enter").catch(() => {})
      await this.sleep(800)
      ;({ emailInput, passwordInput } = await this.findLoginInputs())
    }

    if (!emailInput || !passwordInput) {
      await this.log("Could not find the standard LinkedIn login form. LinkedIn may be showing a different page or challenge.", "error")
      return this.waitForManualLoginResolution()
    }

    await emailInput.fill(this.email).catch(() => {})
    await passwordInput.fill(this.password).catch(() => {})
    const signInButton = await this.findSignInButton()
    if (!signInButton) return this.waitForManualLoginResolution()

    await this.safeClick(signInButton)
    await this.page.waitForLoadState("domcontentloaded", { timeout: 60000 }).catch(() => {})
    await this.sleep(1500)

    if (await this.isLoggedIn()) {
      await this.persistStorageState()
      await this.log("Logged in successfully")
      return true
    }

    if (await this.isVerificationRequired()) {
      const ok = await this.waitForVerificationResolution()
      if (ok && (await this.isLoggedIn())) {
        await this.persistStorageState()
        await this.log("Logged in successfully")
        return true
      }
    }

    return this.waitForManualLoginResolution()
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

    try {
      await this.page.waitForSelector(".jobs-search__results-list, .scaffold-layout__list", { timeout: 10000 })
    } catch {
      await this.log("No jobs found for this search", "skipped")
      return []
    }

    await this.scrollJobList()

    const jobs = await this.page.evaluate(() => {
      const normalize = (value: string | null | undefined) => (value || "").replace(/\s+/g, " ").trim()
      const dedupe = (value: string) => {
        const text = normalize(value)
        const half = text.length / 2
        if (!Number.isInteger(half)) return text
        const a = text.slice(0, half).trim()
        const b = text.slice(half).trim()
        return a && a === b ? a : text
      }

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
  async applyToJob(job: LinkedInJob): Promise<ApplyResult> {
    if (!this.page) throw new Error("Browser not launched")

    try {
      if (!(await this.ensureVerificationCleared())) {
        return { jobId: job.id, title: job.title, company: job.company, status: "failed", reason: "LinkedIn verification required" }
      }

      await this.page.goto(job.url, { waitUntil: "domcontentloaded", timeout: 60000 })
      await this.sleep(1800)
      if (!(await this.ensureVerificationCleared())) {
        return { jobId: job.id, title: job.title, company: job.company, status: "failed", reason: "LinkedIn verification required" }
      }

      const details = await this.getJobDetailsFromPage()
      const resolvedJob: LinkedInJob = {
        ...job,
        title: details.title || dedupeRepeatedText(job.title),
        company: details.company || normalizeText(job.company),
        location: details.location || normalizeText(job.location),
      }
      this.currentJobContext = { title: resolvedJob.title, company: resolvedJob.company, location: resolvedJob.location }

      await this.log(`Applying to: ${resolvedJob.title} at ${resolvedJob.company || "Unknown company"}`)

      const alreadyApplied = await this.page.$("[aria-label*='Applied'], button:has-text('Applied'), .jobs-s-apply__application-link").catch(() => null)
      if (alreadyApplied) {
        await this.log("Already applied. Skipping", "skipped")
        return { jobId: resolvedJob.id, title: resolvedJob.title, company: resolvedJob.company, status: "already_applied" }
      }

      const easyApplyButton = await this.findEasyApplyButton()
      if (!easyApplyButton) {
        await this.log("No Easy Apply button. Skipping", "skipped")
        return { jobId: resolvedJob.id, title: resolvedJob.title, company: resolvedJob.company, status: "skipped", reason: "No Easy Apply" }
      }

      await this.safeClick(easyApplyButton)
      await this.sleep(500)
      await this.log(`Apply transition: ${await this.describeApplyTransition()}`)

      const hasSurface = await this.waitForApplicationSurface(15000)
      if (!hasSurface) {
        const surface = await this.describeSurface()
        await this.log(`Easy Apply click did not open an application modal. Skipping. ${surface}`, "skipped")
        return { jobId: resolvedJob.id, title: resolvedJob.title, company: resolvedJob.company, status: "skipped", reason: "No application modal" }
      }

      const result = await this.handleApplicationFlow()
      if (result.status === "applied") {
        await this.log("Applied successfully")
        return { jobId: resolvedJob.id, title: resolvedJob.title, company: resolvedJob.company, status: "applied" }
      }

      await this.log(`Skipped. ${result.reason || "Requires extra info"}`, "skipped")
      return { jobId: resolvedJob.id, title: resolvedJob.title, company: resolvedJob.company, status: "skipped", reason: result.reason }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      await this.log(`Failed: ${msg}`, "error")
      return { jobId: job.id, title: job.title, company: job.company, status: "failed", reason: msg }
    }
  }

  private async waitForApplicationSurface(timeoutMs: number): Promise<boolean> {
    if (!this.page) return false
    // Use Playwright's built-in polling — wait until visible inputs exceed the
    // LinkedIn page baseline (2 search bars) OR modal-specific text appears
    try {
      await this.page.waitForFunction(
        () => {
          const vis = (el: Element) => {
            const r = (el as HTMLElement).getBoundingClientRect()
            return r.width > 5 && r.height > 5
          }
          const inputs = Array.from(document.querySelectorAll("input, select, textarea")).filter(vis)
          if (inputs.length > 2) return true
          const body = (document.body.textContent || "").toLowerCase()
          return (
            body.includes("application powered by linkedin") ||
            body.includes("submitting this application") ||
            body.includes("assurez-vous d'inclure")
          )
        },
        undefined,
        { timeout: timeoutMs, polling: 400 }
      )
      return true
    } catch {
      return false
    }
  }

  private async handleApplicationFlow(): Promise<ApplicationFlowResult> {
    if (!this.page) return { status: "skipped", reason: "Browser page unavailable" }

    let cvUploaded = false
    let noActionCount = 0

    for (let step = 0; step < 20; step++) {
      try {
        if (!(await this.ensureVerificationCleared())) return { status: "skipped", reason: "LinkedIn verification required" }
        if (await this.isStopRequested()) {
          await this.dismissApplicationModal()
          return { status: "skipped", reason: "Stopped manually" }
        }

        await this.sleep(1000)

        // Check modal is still open
        const stillOpen = await this.page.evaluate(() => {
          const vis = (el: Element) => { const r = (el as HTMLElement).getBoundingClientRect(); return r.width > 5 && r.height > 5 }
          if (Array.from(document.querySelectorAll("input, select, textarea")).filter(vis).length > 2) return true
          const body = (document.body.textContent || "").toLowerCase()
          return body.includes("application powered by linkedin") || body.includes("submitting this application") || body.includes("assurez-vous d'inclure")
        }).catch(() => false)

        if (!stillOpen) {
          if (step === 0) {
            await this.log("Modal closed unexpectedly, giving up")
            return { status: "skipped", reason: "Modal disappeared" }
          }
          // Could be submitted and page changed
          await this.log("Modal closed — likely submitted or navigated")
          return { status: "applied", reason: "Submitted" }
        }

        if (await this.hasCoverLetterRequirement()) {
          await this.dismissApplicationModal()
          return { status: "skipped", reason: "Cover letter required" }
        }

        if (!cvUploaded) cvUploaded = await this.uploadCV()

        await this.fillTextInputs()
        await this.answerSelects()
        await this.answerRadioButtons()
        await this.answerCheckboxes()
        await this.answerComboboxes()
        await this.sleep(900) // Let React process events and enable Next

        const action = await this.findPrimaryAction()
        await this.log(`Step ${step}: action="${action?.label || "none"}"`)

        if (!action) {
          noActionCount++
          if (noActionCount >= 3) {
            // Force-click any Next/Submit button regardless of disabled state
            const forced = await this.forceClickNextButton()
            if (forced) {
              await this.log("Force-clicked Next/Submit button")
              noActionCount = 0
              await this.sleep(1500)
              continue
            }
            return { status: "skipped", reason: "Could not find or click Next button after 3 attempts" }
          }
          await this.sleep(1200)
          continue
        }
        noActionCount = 0

        if (this.isSubmitLabel(action.label)) {
          if (PAUSE_BEFORE_SUBMIT) {
            await this.log("Review the application in the browser, then press Enter here to submit")
            await this.pauseForManualReview()
          }
          await this.safeClick(action.handle)
          await this.sleep(2000)
          const doneButton = await this.page.$("button[aria-label='Dismiss'], button:has-text('Done'), button:has-text('OK')").catch(() => null)
          if (doneButton) await this.safeClick(doneButton)
          await this.log("Application submitted")
          return { status: "applied", reason: "Submitted" }
        }

        await this.log(`Clicking: ${action.label}`)
        await this.safeClick(action.handle)
        await this.sleep(1500)
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        if (msg.includes("Execution context was destroyed") || msg.includes("navigation")) {
          await this.sleep(1500)
          continue
        }
        await this.log(`Step error: ${msg}`, "error")
        await this.sleep(1000)
      }
    }

    return { status: "skipped", reason: "Reached step limit" }
  }

  private async hasVisibleApplicationSurface() {
    if (!this.page) return false
    return this.page.evaluate(() => {
      const vis = (el: Element) => { const r = (el as HTMLElement).getBoundingClientRect(); return r.width > 5 && r.height > 5 }
      if (Array.from(document.querySelectorAll("input, select, textarea")).filter(vis).length > 2) return true
      const body = (document.body.textContent || "").toLowerCase()
      return body.includes("application powered by linkedin") || body.includes("submitting this application") || body.includes("assurez-vous d'inclure")
    }).catch(() => false)
  }

  private async getModalContainer() {
    if (!this.page) return null
    const handle = await this.page.evaluateHandle(() => {
      const isVisible = (node: Element | null) => {
        if (!node) return false
        const html = node as HTMLElement
        const rect = html.getBoundingClientRect()
        const style = window.getComputedStyle(html)
        return rect.width > 100 && rect.height > 100 && style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0"
      }

      // Strategy 1: native <dialog open>
      const openDialog = document.querySelector("dialog[open]")
      if (openDialog && isVisible(openDialog)) return openDialog as HTMLElement

      const looksLikeApplyModal = (el: Element | null) => {
        if (!el || !isVisible(el)) return false
        const text = (el.textContent || "").replace(/\s+/g, " ").toLowerCase()
        const fieldCount = el.querySelectorAll("input, select, textarea, [role='combobox']").length
        return (
          text.includes("apply to ") ||
          text.includes("application powered by linkedin") ||
          text.includes("contact info") ||
          text.includes("email address") ||
          text.includes("mobile phone number") ||
          text.includes("phone country code") ||
          text.includes("easy apply") ||
          fieldCount >= 2
        )
      }

      // Strategy 2: aria role=dialog
      for (const el of Array.from(document.querySelectorAll("[role='dialog']"))) {
        if (looksLikeApplyModal(el)) return el as HTMLElement
      }

      // Strategy 3: LinkedIn known class names
      for (const sel of [".jobs-easy-apply-modal", ".jobs-easy-apply-modal__content", ".jobs-easy-apply-content", ".jobs-apply-modal", ".artdeco-modal__content", ".artdeco-modal"]) {
        const el = document.querySelector(sel)
        if (looksLikeApplyModal(el)) return el as HTMLElement
      }

      // Strategy 4: walk up from Dismiss/Close button (always present in LinkedIn Easy Apply modal)
      const dismissSelectors = ["button[aria-label='Dismiss']", "button[aria-label='Close']", "button[aria-label='Fermer']", "button[aria-label='Ignorer']"]
      for (const sel of dismissSelectors) {
        const dismissBtn = document.querySelector(sel)
        if (!dismissBtn || !isVisible(dismissBtn)) continue
        let el: HTMLElement | null = (dismissBtn as HTMLElement).parentElement
        while (el && el !== document.body) {
          const rect = el.getBoundingClientRect()
          if (rect.width > 300 && rect.height > 200 && isVisible(el)) {
            const text = (el.textContent || "").toLowerCase()
            if (
              text.includes("apply to ") ||
              text.includes("application powered by linkedin") ||
              text.includes("contact info") ||
              text.includes("assurez") ||
              el.querySelectorAll("input, select, textarea").length > 0
            ) return el
          }
          el = el.parentElement
        }
      }

      // Strategy 5: any centered fixed/absolute overlay with form fields or apply text
      const applyKeywords = ["apply to ", "application powered by linkedin", "contact info", "easy apply", "assurez-vous"]
      const allEls = Array.from(document.querySelectorAll("div, section, aside, article"))
      const matches = allEls.filter((el) => {
        if (!isVisible(el)) return false
        const html = el as HTMLElement
        const rect = html.getBoundingClientRect()
        if (rect.width < 250 || rect.height < 150) return false
        const style = window.getComputedStyle(html)
        const isOverlay = style.position === "fixed" || style.position === "absolute" || Number(style.zIndex || 0) > 50
        if (!isOverlay) return false
        const centerX = rect.left + rect.width / 2
        const centerY = rect.top + rect.height / 2
        const centered =
          Math.abs(centerX - window.innerWidth / 2) < window.innerWidth * 0.22 &&
          Math.abs(centerY - window.innerHeight / 2) < window.innerHeight * 0.28
        if (!centered) return false
        const text = (el.textContent || "").replace(/\s+/g, " ").toLowerCase()
        const hasApply = applyKeywords.some((kw) => text.includes(kw))
        const hasFields = el.querySelectorAll("input, select, textarea, [role='combobox']").length >= 2
        const hasNextLikeButton = Array.from(el.querySelectorAll("button, div[role='button'], a[role='button'], input[type='button'], input[type='submit']")).some((button) => {
          const buttonText = (((button as HTMLElement).innerText || button.getAttribute("aria-label") || (button as HTMLInputElement).value || "").replace(/\s+/g, " ").trim().toLowerCase())
          return buttonText.includes("next") || buttonText.includes("continue") || buttonText.includes("review") || buttonText.includes("submit") || buttonText.includes("suivant") || buttonText.includes("continuer") || buttonText.includes("envoyer")
        })
        const hasCloseButton = Array.from(el.querySelectorAll("button, div[role='button']")).some((button) => {
          const buttonText = (((button as HTMLElement).innerText || button.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().toLowerCase())
          return buttonText === "close" || buttonText.includes("dismiss") || buttonText === "×"
        })
        const hasProgressCue = text.includes("0%") || text.includes("100%")
        return (hasApply || hasProgressCue) && hasFields && (hasNextLikeButton || hasCloseButton)
      })
      matches.sort((a, b) => {
        const ra = (a as HTMLElement).getBoundingClientRect()
        const rb = (b as HTMLElement).getBoundingClientRect()
        return rb.width * rb.height - ra.width * ra.height
      })
      return (matches[0] as HTMLElement | undefined) || null
    }).catch(() => null)

    if (!handle) return null
    const element = handle.asElement()
    if (!element) {
      await handle.dispose().catch(() => {})
      return null
    }
    return element
  }

  private async describeApplyTransition() {
    if (!this.page) return "no page"
    await this.page.waitForLoadState("domcontentloaded", { timeout: 1200 }).catch(() => {})
    const popupUrls = await this.inspectExternalApplyPages()
    const pageDetail = await this.page.evaluate(() => {
      const isVisible = (node: Element | null) => {
        if (!node) return false
        const html = node as HTMLElement
        const rect = html.getBoundingClientRect()
        const style = window.getComputedStyle(html)
        return rect.width > 20 && rect.height > 20 && style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0"
      }

      const buttons = Array.from(document.querySelectorAll("button, a, div[role='button']")).filter((node) => isVisible(node)).map((node) => ((node as HTMLElement).innerText || node.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 8)
      const containers = ["dialog[open]", ".jobs-easy-apply-modal", ".jobs-easy-apply-modal__content", ".jobs-easy-apply-content", ".jobs-apply-modal", ".artdeco-modal", ".artdeco-modal__content", "[role='dialog']"]
        .map((selector) => document.querySelector(selector))
        .filter((node): node is Element => Boolean(node))
        .filter((node) => isVisible(node))
        .map((node) => ((node.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120) || node.tagName.toLowerCase()))
        .slice(0, 4)

      const centeredOverlays = Array.from(document.querySelectorAll("div, section, aside, article"))
        .filter((node) => {
          if (!isVisible(node)) return false
          const html = node as HTMLElement
          const rect = html.getBoundingClientRect()
          const style = window.getComputedStyle(html)
          if (rect.width < 250 || rect.height < 150) return false
          const isOverlay = style.position === "fixed" || style.position === "absolute" || Number(style.zIndex || 0) > 50
          if (!isOverlay) return false
          const centerX = rect.left + rect.width / 2
          const centerY = rect.top + rect.height / 2
          return (
            Math.abs(centerX - window.innerWidth / 2) < window.innerWidth * 0.22 &&
            Math.abs(centerY - window.innerHeight / 2) < window.innerHeight * 0.28
          )
        })
        .map((node) => {
          const html = node as HTMLElement
          const rect = html.getBoundingClientRect()
          const text = (node.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120)
          return `${Math.round(rect.width)}x${Math.round(rect.height)}:${text || node.tagName.toLowerCase()}`
        })
        .slice(0, 3)

      return `url=${window.location.href} title="${(document.title || "").replace(/\s+/g, " ").trim()}" visibleButtons=${buttons.join(" | ") || "none"} containers=${containers.join(" | ") || "none"} overlays=${centeredOverlays.join(" | ") || "none"}`
    }).catch(() => "transitionEvalError")
    return [pageDetail, popupUrls].filter(Boolean).join(" ").trim()
  }

  private async inspectExternalApplyPages() {
    if (!this.page) return ""
    const pages = this.page.context().pages().filter((page) => page !== this.page)
    const urls: string[] = []
    for (const extraPage of pages) {
      await extraPage.waitForLoadState("domcontentloaded", { timeout: 1200 }).catch(() => {})
      const url = extraPage.url()
      if (url && !url.includes("linkedin.com")) urls.push(url)
      await extraPage.close().catch(() => {})
    }
    return urls.length ? `popupUrls=${urls.join(",")}` : ""
  }

  private async describeSurface() {
    if (!this.page) return "no page"
    return this.page.evaluate(() => {
      const isVisible = (node: Element | null) => {
        if (!node) return false
        const html = node as HTMLElement
        const rect = html.getBoundingClientRect()
        const style = window.getComputedStyle(html)
        return rect.width > 20 && rect.height > 20 && style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0"
      }
      const dialogs = Array.from(document.querySelectorAll("dialog, [role='dialog'], .artdeco-modal, .jobs-easy-apply-modal, .jobs-apply-modal")).filter((node) => isVisible(node)).length
      const fields = Array.from(document.querySelectorAll("input, textarea, select, fieldset, [role='combobox'], input[type='file']")).filter((node) => isVisible(node)).length
      const buttons = Array.from(document.querySelectorAll("button, input[type='submit'], input[type='button'], div[role='button'], a[role='button']")).filter((node) => isVisible(node)).length
      return `url=${window.location.href} title="${(document.title || "").replace(/\s+/g, " ").trim()}" dialogs=${dialogs} visibleFields=${fields} visibleButtons=${buttons}`
    }).catch(() => "")
  }
  private isSubmitLabel(label: string) {
    return label.includes("submit") || label.includes("send application") || label.includes("submit application") || label.includes("envoyer") || label.includes("soumettre") || label.includes("postuler")
  }

  private async findPrimaryAction(): Promise<ActionButtonMatch | null> {
    if (!this.page) return null
    const modal = await this.getModalContainer()
    const scope = modal || this.page
    const candidates = await scope.$$("button").catch(() => [])

    const actionKeywords = ["next", "continue", "review", "submit", "send application", "suivant", "continuer", "envoyer", "soumettre", "postuler"]
    let best: { score: number; match: ActionButtonMatch } | null = null

    for (const candidate of candidates) {
      const meta = await candidate.evaluate((el) => {
        const html = el as HTMLElement & { disabled?: boolean }
        const rect = html.getBoundingClientRect()
        const style = window.getComputedStyle(html)
        const text = (html.innerText || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().toLowerCase()
        return {
          text,
          visible: rect.width > 20 && rect.height > 20 && style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0",
          disabled: Boolean(html.disabled) || el.getAttribute("aria-disabled") === "true",
          isPrimary: (el.getAttribute("class") || "").includes("artdeco-button--primary"),
          top: rect.top,
        }
      }).catch(() => ({ text: "", visible: false, disabled: true, isPrimary: false, top: 0 }))

      if (!meta.visible || meta.disabled || !meta.text) continue
      const isAction = actionKeywords.some((kw) => meta.text.includes(kw))
      if (!isAction) continue

      let score = 0
      if (meta.isPrimary) score += 4
      if (meta.text.includes("submit") || meta.text.includes("send application") || meta.text.includes("envoyer")) score += 6
      if (meta.text.includes("review")) score += 5
      if (meta.text.includes("next") || meta.text.includes("continue") || meta.text.includes("suivant") || meta.text.includes("continuer")) score += 5
      if (meta.text === "next" || meta.text === "suivant") score += 3
      if (meta.top > 350) score += 1

      const match: ActionButtonMatch = { handle: candidate, label: meta.text }
      if (!best || score > best.score) best = { score, match }
    }

    return best?.match || null
  }

  private async safeClick(handle: { scrollIntoViewIfNeeded?: () => Promise<void>; click: (options?: { force?: boolean; timeout?: number }) => Promise<unknown>; evaluate?: <T>(fn: (el: Element) => T) => Promise<T> }) {
    try {
      if (handle.scrollIntoViewIfNeeded) await handle.scrollIntoViewIfNeeded().catch(() => {})
      await handle.click({ timeout: 5000 })
      return
    } catch {}

    try {
      await handle.click({ force: true, timeout: 3000 })
      return
    } catch {}

    if (handle.evaluate) await handle.evaluate((el) => (el as HTMLElement).click()).catch(() => {})
  }

  private async buttonLooksLikeEasyApply(candidate: { textContent: () => Promise<string | null>; getAttribute: (name: string) => Promise<string | null> }) {
    const combined = `${normalizeText(await candidate.textContent().catch(() => "")).toLowerCase()} ${normalizeText(await candidate.getAttribute("aria-label").catch(() => "")).toLowerCase()} ${normalizeText(await candidate.getAttribute("title").catch(() => "")).toLowerCase()}`
    return combined.includes("easy apply") || combined.includes("continue to application")
  }

  private async findEasyApplyButton() {
    if (!this.page) return null
    for (const selector of ["button[aria-label*='Easy Apply']", "button.jobs-apply-button", ".jobs-apply-button--top-card", "button:has-text('Easy Apply')", "button:has-text('Continue to application')", "div[role='button']:has-text('Easy Apply')", "a:has-text('Easy Apply')"]) {
      const button = await this.page.$(selector).catch(() => null)
      if (button && (await this.buttonLooksLikeEasyApply(button))) return button
    }

    const buttons = await this.page.$$("button, a, div[role='button']").catch(() => [])
    for (const button of buttons) {
      const disabled = await button.evaluate((el) => {
        const html = el as HTMLElement & { disabled?: boolean }
        return Boolean(html.disabled) || el.getAttribute("aria-disabled") === "true"
      }).catch(() => true)
      if (!disabled && (await this.buttonLooksLikeEasyApply(button))) return button
    }
    return null
  }

  private async forceClickNextButton() {
    if (!this.page) return false
    const modal = await this.getModalContainer()
    const scope = modal || this.page
    const buttons = await scope.$$("button").catch(() => [])
    const actionKeywords = ["next", "review", "submit", "continue", "suivant", "envoyer", "send application", "soumettre", "continuer", "postuler"]
    for (const btn of buttons) {
      const meta = await btn.evaluate((el) => {
        const html = el as HTMLElement
        const rect = html.getBoundingClientRect()
        const style = window.getComputedStyle(html)
        const visible = rect.width > 10 && rect.height > 10 && style.display !== "none" && style.visibility !== "hidden"
        const text = (html.innerText || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().toLowerCase()
        const isPrimary = (el.getAttribute("class") || "").includes("artdeco-button--primary")
        return { visible, text, isPrimary }
      }).catch(() => ({ visible: false, text: "", isPrimary: false }))
      if (!meta.visible) continue
      if (!actionKeywords.some((kw) => meta.text.includes(kw))) continue
      await btn.click({ force: true, timeout: 3000 }).catch(() => {})
      return true
    }
    return false
  }

  private async isInteractableField(field: { evaluate: <T>(pageFunction: (element: Element) => T) => Promise<T> }) {
    return field.evaluate((el) => {
      const html = el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      const disabled = "disabled" in html ? Boolean(html.disabled) : false
      const readOnly = "readOnly" in html ? Boolean((html as HTMLInputElement).readOnly) : false
      return !disabled && !readOnly && el.getAttribute("aria-disabled") !== "true"
    }).catch(() => true)
  }

  private async fireReactEvents(field: { evaluate: <T>(pageFunction: (element: Element) => T) => Promise<T> }) {
    await field.evaluate((el) => {
      const input = el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      // Use native setter trick so React's onChange fires for pre-filled values
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

  private async getFieldPrompt(field: { evaluate: <T>(pageFunction: (element: Element) => T) => Promise<T> }) {
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
    const value = normalizeText(label)
    if (!value) return "field"
    if (value.includes("first name")) return "first name"
    if (value.includes("last name") || value.includes("family name")) return "last name"
    if (value.includes("full name")) return "full name"
    if (value.includes("email")) return "email"
    if (value.includes("phone") || value.includes("mobile")) return "phone"
    if (value.includes("city") || value.includes("ville")) return "city"
    if (value.includes("country") || value.includes("citizenship") || value.includes("nationality")) return "country"
    if (value.includes("salary")) return "salary"
    if (value.includes("notice")) return "notice period"
    if (value.includes("experience")) return "experience"
    if (value.includes("linkedin")) return "linkedin"
    if (value.includes("portfolio") || value.includes("website")) return "portfolio"
    if (value.includes("source")) return "source"
    return value.split(" ").slice(0, 6).join(" ")
  }

  private isProfileDrivenQuestion(label: string) {
    const lowered = label.toLowerCase()
    return lowered.includes("how did you hear") || lowered.includes("where did you hear") || lowered.includes("source") || lowered.includes("citizenship") || lowered.includes("based in") || lowered.includes("personal laptop") || lowered.includes("worked before") || lowered.includes("worked with our company") || lowered.includes("sanctioned territories")
  }

  private guessAnswer(label: string) {
    const lowered = label.toLowerCase()
    if (lowered.includes("first name") || lowered.includes("prenom") || lowered.includes("prénom")) return this.answers.firstName
    if (lowered.includes("last name") || lowered.includes("family name") || lowered.includes("nom")) return this.answers.lastName
    if (lowered.includes("full name")) return this.answers.fullName
    if (lowered.includes("email")) return this.email
    if (lowered.includes("phone") || lowered.includes("mobile") || lowered.includes("téléphone")) return this.answers.phone
    if (lowered.includes("city") || lowered.includes("ville")) return this.answers.city
    if (lowered.includes("country are you based in") || lowered.includes("based in")) return this.answers.baseCountry
    if (lowered.includes("country") || lowered.includes("pays") || lowered.includes("nationality")) return this.answers.country
    if (lowered.includes("citizenship")) return this.answers.citizenship
    if (lowered.includes("linkedin")) return this.answers.linkedinUrl
    if (lowered.includes("portfolio") || lowered.includes("website")) return this.answers.portfolioUrl
    if (lowered.includes("salary") || lowered.includes("salaire") || lowered.includes("compensation")) return this.answers.salaryExpectation
    if (lowered.includes("notice")) return this.answers.noticePeriod
    if (lowered.includes("experience") || lowered.includes("année") || lowered.includes("year")) return this.answers.yearsExperience
    if (lowered.includes("how did you hear") || lowered.includes("source")) return this.answers.referralSource
    return ""
  }

  private async fillTextInputWithGroq(input: { fill: (value: string) => Promise<void> }, label: string) {
    if (!USE_GROQ_FOR_COMPLEX_FORMS || !this.applicantProfile) return false
    const decision = await askGroqForFieldAnswer({ question: label, fieldType: "text", applicant: this.applicantProfile, job: this.currentJobContext }).catch(() => null)
    if (!decision?.answer || decision.shouldPause || decision.confidence < 60) return false
    await input.fill(decision.answer).catch(() => {})
    await this.log(`Groq filled text field: ${decision.answer}`)
    return true
  }
  private async fillTextInputs() {
    if (!this.page) return
    const inputs = await this.page.$$("input[type='text']:visible, input[type='tel']:visible, input[type='number']:visible, input[type='email']:visible, textarea:visible").catch(() => [])
    for (const input of inputs) {
      try {
        if (!(await this.isInteractableField(input))) continue
        const label = await this.getFieldPrompt(input)
        const currentValue = normalizeText(await input.inputValue().catch(() => ""))
        if (label.includes("location") && (label.includes("city") || label.includes("ville"))) {
          await this.fillLocationField(input, currentValue)
          continue
        }
        if (currentValue) {
          await this.fireReactEvents(input)
          continue
        }
        const guessed = this.guessAnswer(label)
        if (guessed) {
          await input.fill(guessed).catch(() => {})
          await this.log(`Filled ${this.describeFieldLabel(label)}: ${guessed}`)
          await this.fireReactEvents(input)
          await this.sleep(250)
          continue
        }
        await this.fillTextInputWithGroq(input, label)
      } catch {}
    }
  }

  private async fillLocationField(input: { fill: (value: string) => Promise<void>; click: (options?: { force?: boolean; timeout?: number }) => Promise<unknown>; press?: (key: string) => Promise<void>; inputValue?: () => Promise<string> }, currentValue = "") {
    const desiredCity = this.answers.city
    const desiredCountry = this.answers.baseCountry || this.answers.country
    if (currentValue.toLowerCase().includes(desiredCity.toLowerCase())) {
      await input.click({ force: true }).catch(() => {})
      if (this.page) await this.page.keyboard.press("Tab").catch(() => {})
      return
    }

    for (const searchTerm of [`${desiredCity}, ${desiredCountry}`, desiredCity]) {
      await input.click({ force: true }).catch(() => {})
      await input.fill(searchTerm).catch(() => {})
      await this.log(`Typing location search: ${searchTerm}`)
      await this.sleep(1100)
      if (this.page) {
        const candidates = await this.page.$$("[role='option'], .basic-typeahead__selectable, .artdeco-typeahead__result, [data-test-autocomplete-dropdown] li").catch(() => [])
        for (const candidate of candidates) {
          const text = normalizeText(await candidate.textContent().catch(() => "")).toLowerCase()
          if (text && (text.includes(searchTerm.toLowerCase()) || text.includes(desiredCity.toLowerCase()))) {
            await this.safeClick(candidate)
            await this.sleep(350)
            await this.log(`Selected location option: ${text}`)
            return
          }
        }
      }
      if (input.press) {
        await input.press("ArrowDown").catch(() => {})
        await input.press("Enter").catch(() => {})
      }
    }
  }

  private async answerSelects() {
    if (!this.page) return
    const selects = await this.page.$$("select:visible").catch(() => [])
    for (const select of selects) {
      try {
        if (!(await this.isInteractableField(select))) continue
        const value = await select.inputValue().catch(() => "")
        const selectedText = normalizeText(await select.evaluate((el) => ((el as HTMLSelectElement).selectedOptions?.[0]?.textContent || "")).catch(() => ""))
        if (value && !looksLikePlaceholderValue(selectedText)) {
          await this.fireReactEvents(select)
          continue
        }

        const label = await this.getFieldPrompt(select)
        const options = await select.$$eval("option", (nodes) => nodes.map((node) => ({ value: (node as HTMLOptionElement).value, text: node.textContent?.trim().toLowerCase() || "" }))).catch(() => [] as Array<{ value: string; text: string }>)
        const guessed = this.guessAnswer(label).toLowerCase()
        const matched = options.find((option) => guessed && (option.text.includes(guessed) || option.value.toLowerCase() === guessed))
        if (matched?.value) {
          await select.selectOption(matched.value).catch(() => {})
          await this.log(`Selected ${this.describeFieldLabel(label)}: ${matched.text}`)
          continue
        }

        if (this.isProfileDrivenQuestion(label) && USE_GROQ_FOR_COMPLEX_FORMS && this.applicantProfile) {
          const decision = await askGroqForFieldAnswer({ question: label, fieldType: "select", options: options.map((option) => option.text), applicant: this.applicantProfile, job: this.currentJobContext }).catch(() => null)
          const groqMatch = decision?.answer ? options.find((option) => option.text.includes(decision.answer.toLowerCase())) : null
          if (groqMatch?.value) {
            await select.selectOption(groqMatch.value).catch(() => {})
            await this.log(`Groq selected option: ${decision?.answer}`)
            continue
          }
        }

        if (options.length > 1 && options[1]?.value) {
          await select.selectOption(options[1].value).catch(() => {})
          await this.log(`Selected ${this.describeFieldLabel(label)}: ${options[1].text}`)
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        if (!msg.includes("Execution context was destroyed") && !msg.includes("Cannot find context with specified id")) {
          await this.log(`Skipped stale select field: ${msg}`)
        }
      }
    }
  }

  private async answerRadioButtons() {
    if (!this.page) return
    const groups = await this.page.$$("fieldset:visible").catch(() => [])
    for (const group of groups) {
      try {
        const checked = await group.$("input[type='radio']:checked").catch(() => null)
        if (checked) continue
        const text = normalizeText(await group.textContent().catch(() => "")).toLowerCase()
        const desired = text.includes("authorized") || text.includes("work permit") || text.includes("legally") ? this.answers.workAuthorization : text.includes("sponsor") ? this.answers.sponsorshipRequired : text.includes("relocat") ? this.answers.openToRelocation : text.includes("remote") ? this.answers.remotePreference : text.includes("europe") ? this.answers.livesInEurope : text.includes("laptop") || text.includes("pc") ? this.answers.hasPersonalLaptop : text.includes("worked before") ? this.answers.workedBefore : "yes"
        const radios = await group.$$("input[type='radio']").catch(() => [])
        let selected = false
        for (const radio of radios) {
          const value = normalizeText(await radio.getAttribute("value").catch(() => "")).toLowerCase()
          const id = await radio.getAttribute("id")
          const labelEl = id ? await group.$(`label[for="${id}"]`).catch(() => null) : null
          const labelText = normalizeText(await labelEl?.textContent().catch(() => "")).toLowerCase()
          if (value === desired || labelText === desired || labelText.includes(` ${desired}`) || labelText.startsWith(`${desired} `)) {
            await radio.check().catch(() => {})
            selected = true
            break
          }
        }
        if (!selected && radios[0]) await radios[0].check().catch(() => {})
      } catch {}
    }
  }

  private async answerCheckboxes() {
    if (!this.page) return
    const checkboxes = await this.page.$$("input[type='checkbox']:visible").catch(() => [])
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
    if (!this.page) return
    const comboboxes = await this.page.$$("[role='combobox']:visible, button[aria-haspopup='listbox']:visible, input[role='combobox']:visible").catch(() => [])
    for (const combobox of comboboxes) {
      try {
        if (!(await this.isInteractableField(combobox))) continue
        const label = await this.getFieldPrompt(combobox)
        const currentValue = normalizeText(await combobox.evaluate((el) => el instanceof HTMLInputElement ? el.value || "" : (el.textContent || el.getAttribute("title") || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim()).catch(() => ""))
        const lowered = label.toLowerCase()
        if (currentValue && !looksLikePlaceholderValue(currentValue)) {
          await combobox.click({ force: true }).catch(() => {})
          if (this.page) await this.page.keyboard.press("Escape").catch(() => {})
          continue
        }
        if (lowered.includes("phone country code") || lowered.includes("country code")) {
          await this.selectComboboxOption(combobox, [`${this.answers.country} (${normalizeText(this.answers.phone).match(/\+\d{1,4}/)?.[0] || "+216"})`, this.answers.country, "+216"])
          continue
        }
        if (lowered.includes("country") || lowered.includes("pays") || lowered.includes("nationality") || lowered.includes("citizenship")) {
          await this.selectComboboxOption(combobox, [this.answers.citizenship, this.answers.country, `${this.answers.city}, ${this.answers.country}`])
          continue
        }
        if (lowered.includes("source") || lowered.includes("how did you hear")) {
          await this.selectComboboxOption(combobox, [this.answers.referralSource, "LinkedIn"])
          continue
        }
        if (USE_GROQ_FOR_COMPLEX_FORMS && this.applicantProfile && this.isProfileDrivenQuestion(label)) {
          await this.answerComboboxWithGroq(combobox, label)
        }
      } catch {}
    }
  }

  private async selectComboboxOption(combobox: { click: (options?: { force?: boolean; timeout?: number }) => Promise<unknown>; fill?: (value: string) => Promise<void>; press?: (key: string) => Promise<void>; evaluate: <T>(pageFunction: (element: Element) => T) => Promise<T>; inputValue?: () => Promise<string> }, desiredOptions: string[]) {
    if (!this.page) return null
    for (const desired of desiredOptions.filter(Boolean)) {
      await combobox.click({ force: true }).catch(() => {})
      await this.sleep(250)
      const isInput = await combobox.evaluate((el) => el instanceof HTMLInputElement).catch(() => false)
      if (isInput && combobox.fill) await combobox.fill(desired).catch(() => {})
      else {
        await this.page.keyboard.press("Control+A").catch(() => {})
        await this.page.keyboard.type(desired, { delay: 25 }).catch(() => {})
      }
      await this.sleep(700)
      const options = await this.page.$$("[role='option'], div[role='option'], li, .basic-typeahead__selectable, .artdeco-typeahead__result").catch(() => [])
      for (const option of options) {
        const text = normalizeText(await option.textContent().catch(() => "")).toLowerCase()
        if (text && (text === desired.toLowerCase() || text.includes(desired.toLowerCase()))) {
          await this.safeClick(option)
          await this.sleep(350)
          return normalizeText(await option.textContent().catch(() => ""))
        }
      }
      if (combobox.press) {
        await combobox.press("ArrowDown").catch(() => {})
        await combobox.press("Enter").catch(() => {})
      }
      await this.sleep(350)
      const value = combobox.inputValue ? normalizeText(await combobox.inputValue().catch(() => "")) : ""
      if (value) return value
    }
    return null
  }

  private async answerComboboxWithGroq(combobox: { click: (options?: { force?: boolean; timeout?: number }) => Promise<unknown>; fill?: (value: string) => Promise<void>; press?: (key: string) => Promise<void>; evaluate: <T>(pageFunction: (element: Element) => T) => Promise<T>; inputValue?: () => Promise<string> }, label: string) {
    if (!this.page || !USE_GROQ_FOR_COMPLEX_FORMS || !this.applicantProfile) return null
    await combobox.click({ force: true }).catch(() => {})
    await this.sleep(350)
    const options = await this.page.$$eval("[role='option'], div[role='option'], li, .basic-typeahead__selectable, .artdeco-typeahead__result", (nodes) => nodes.map((node) => node.textContent?.replace(/\s+/g, " ").trim() || "").filter(Boolean).slice(0, 20)).catch(() => [] as string[])
    if (!options.length) return null
    const decision = await askGroqForFieldAnswer({ question: label, fieldType: "select", options, applicant: this.applicantProfile, job: this.currentJobContext }).catch(() => null)
    if (!decision?.answer || decision.shouldPause || decision.confidence < 65) return null
    const selected = await this.selectComboboxOption(combobox, [decision.answer, ...options.filter((option) => option.toLowerCase().includes(decision.answer.toLowerCase())).slice(0, 3)])
    if (selected) await this.log(`Groq selected option: ${decision.answer}`)
    return selected
  }
  private async uploadCV() {
    if (!this.page) return false
    const modal = await this.getModalContainer()
    const fileInputs = modal ? await modal.$$("input[type='file']").catch(() => []) : await this.page.$$("input[type='file']").catch(() => [])
    for (const fileInput of fileInputs) {
      const visible = await fileInput.evaluate((el) => {
        const html = el as HTMLElement
        const rect = html.getBoundingClientRect()
        const style = window.getComputedStyle(html)
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden"
      }).catch(() => false)
      if (!visible) continue
      const existing = await fileInput.evaluate((el) => (el as HTMLInputElement).files?.length || 0).catch(() => 0)
      if (existing > 0) {
        await this.log("CV already attached")
        return true
      }
      const context = await fileInput.evaluate((el) => {
        const wrapper = el.closest("[data-test-form-element], .jobs-easy-apply-form-section__grouping, .fb-dash-form-element") || el.parentElement
        return (wrapper?.textContent || "").replace(/\s+/g, " ").trim().toLowerCase()
      }).catch(() => "")
      if (context && !context.includes("resume") && !context.includes("cv") && !context.includes("curriculum")) continue
      await fileInput.setInputFiles(path.resolve(this.cvPath)).catch(() => {})
      await this.log("CV uploaded")
      await this.sleep(800)
      return true
    }
    return false
  }

  private async getVisibleInlineError() {
    if (!this.page) return ""
    return this.page.evaluate(() => {
      for (const node of Array.from(document.querySelectorAll(".artdeco-inline-feedback--error"))) {
        const el = node as HTMLElement
        const rect = el.getBoundingClientRect()
        const style = window.getComputedStyle(el)
        if (rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden") {
          const text = el.textContent?.replace(/\s+/g, " ").trim() || ""
          if (text) return text
        }
      }
      return ""
    }).catch(() => "")
  }

  private async getBlockingQuestions(): Promise<string[]> {
    if (!this.page) return []
    return this.page.evaluate(() => {
      const unresolved = new Set<string>()
      for (const node of Array.from(document.querySelectorAll(".artdeco-inline-feedback--error"))) {
        const text = node.textContent?.replace(/\s+/g, " ").trim()
        if (text) unresolved.add(text)
      }
      for (const field of Array.from(document.querySelectorAll("input[required], textarea[required], select[required]"))) {
        const input = field as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        const value = "value" in input ? input.value : ""
        if (value?.trim()) continue
        const id = input.id
        const label = id ? document.querySelector(`label[for="${id}"]`) : null
        unresolved.add(label?.textContent?.replace(/\s+/g, " ").trim() || input.getAttribute("placeholder") || "required field")
      }
      return Array.from(unresolved).slice(0, 4)
    }).catch(() => [])
  }

  private async isSimpleContactStepComplete() {
    if (!this.page) return false
    return this.page.evaluate(() => {
      const modal = document.querySelector("dialog[open], .jobs-easy-apply-modal, [role='dialog']")
      if (!modal) return false
      const text = modal.textContent?.replace(/\s+/g, " ").trim().toLowerCase() || ""
      if (!(text.includes("email address") && text.includes("mobile phone number"))) return false
      const emailInput = modal.querySelector("input[type='email']") as HTMLInputElement | null
      const phoneInput = modal.querySelector("input[type='tel']") as HTMLInputElement | null
      return Boolean(emailInput?.value?.trim() && phoneInput?.value?.trim())
    }).catch(() => false)
  }

  private async hasCoverLetterRequirement() {
    if (!this.page) return false
    return this.page.evaluate(() => {
      const modal = document.querySelector("dialog[open], .jobs-easy-apply-modal, [role='dialog']")
      if (!modal) return false
      const text = modal.textContent?.replace(/\s+/g, " ").trim().toLowerCase() || ""
      if (!text.includes("cover letter")) return false
      return modal.querySelectorAll("textarea, input[type='file']").length > 1 || modal.querySelectorAll("textarea").length > 0
    }).catch(() => false)
  }

  private async dismissApplicationModal() {
    if (!this.page) return
    const closeButton = await this.page.$("button[aria-label='Dismiss'], button[aria-label='Close']").catch(() => null)
    if (closeButton) {
      await this.safeClick(closeButton)
      await this.sleep(400)
    }
    const discardButton = await this.page.$("button:has-text('Discard'), button:has-text('Exit'), button:has-text('Cancel')").catch(() => null)
    if (discardButton) {
      await this.safeClick(discardButton)
      await this.sleep(400)
    }
  }

  private async pauseForManualReview() {
    process.stdout.write("   Press Enter to continue...")
    await new Promise<void>((resolve) => {
      process.stdin.resume()
      process.stdin.once("data", () => resolve())
    })
    process.stdout.write("\n")
  }

  private async scrollJobList() {
    if (!this.page) return
    const list = await this.page.$(".jobs-search__results-list, .scaffold-layout__list").catch(() => null)
    if (!list) return
    for (let i = 0; i < 3; i++) {
      await list.evaluate((el) => el.scrollBy(0, 600)).catch(() => {})
      await this.sleep(800)
    }
  }

  private async getJobDetailsFromPage(): Promise<Pick<LinkedInJob, "title" | "company" | "location">> {
    if (!this.page) return { title: "", company: "", location: "" }
    return this.page.evaluate(() => {
      const read = (selectors: string[]) => {
        for (const selector of selectors) {
          const text = (document.querySelector(selector)?.textContent || "").replace(/\s+/g, " ").trim()
          if (text) return text
        }
        return ""
      }
      return {
        title: read([".job-details-jobs-unified-top-card__job-title h1", ".t-24.job-details-jobs-unified-top-card__job-title", ".jobs-unified-top-card__job-title h1"]),
        company: read([".job-details-jobs-unified-top-card__company-name a", ".job-details-jobs-unified-top-card__company-name", ".jobs-unified-top-card__company-name a", ".jobs-unified-top-card__company-name"]),
        location: read([".job-details-jobs-unified-top-card__primary-description-container", ".jobs-unified-top-card__subtitle-primary-grouping"]),
      }
    }).catch(() => ({ title: "", company: "", location: "" }))
  }

  async close() {
    if (this.browser) {
      await this.browser.close()
      this.browser = null
    }
  }

  async run(email: string, password: string): Promise<ApplyResult[]> {
    this.email = email
    this.password = password
    try {
      await this.launch()
      const loggedIn = await this.login()
      if (!loggedIn) {
        await this.log("Could not log in. Stopping", "error")
        return []
      }
      await this.prepareSearchStrategy()

      let totalApplied = 0
      for (const title of this.searchTitles) {
        if (await this.isStopRequested()) break
        for (const location of this.searchLocations) {
          if (await this.isStopRequested()) break
          if (totalApplied >= MAX_APPLIES_PER_RUN) break

          const jobs = await this.searchJobs(title, location)
          for (const job of jobs) {
            if (await this.isStopRequested()) break
            if (totalApplied >= MAX_APPLIES_PER_RUN) break
            if (!job.isEasyApply) {
              await this.log("Skipping (not Easy Apply from list)", "skipped")
              continue
            }

            const result = await this.applyToJob(job)
            this.results.push(result)
            if (this.onResult) await this.onResult(result)
            if (result.status === "applied") totalApplied++
            await this.sleep(DELAY_BETWEEN_JOBS)
          }
        }
      }

      await this.log("Run complete", "done")
      await this.log(`Applied: ${this.results.filter((item) => item.status === "applied").length}`, "done")
      await this.log(`Skipped: ${this.results.filter((item) => item.status === "skipped").length}`, "done")
      await this.log(`Failed: ${this.results.filter((item) => item.status === "failed").length}`, "done")
      return this.results
    } finally {
      await this.close()
    }
  }
}
