import { chromium, Browser, Page } from "playwright"
import * as path from "path"
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
const SIMPLE_EASY_APPLY_ONLY = false
const USE_GROQ_FOR_COMPLEX_FORMS = true
const PAUSE_BEFORE_SUBMIT = false
const DELAY_BETWEEN_JOBS = 3000

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
  scalaExperience: string
  gamblingExperience: string
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

function normalizeText(value: string | null | undefined): string {
  if (!value) return ""
  return value.replace(/\s+/g, " ").trim()
}

function dedupeRepeatedText(value: string): string {
  const normalized = normalizeText(value)
  if (!normalized) return ""

  const midpoint = normalized.length / 2
  if (Number.isInteger(midpoint)) {
    const firstHalf = normalized.slice(0, midpoint).trim()
    const secondHalf = normalized.slice(midpoint).trim()
    if (firstHalf && firstHalf === secondHalf) {
      return firstHalf
    }
  }

  return normalized
}

function buildDefaultAnswers(email: string): ApplicationAnswers {
  const envFullName = normalizeText(process.env.APPLICANT_FULL_NAME)
  const nameParts = envFullName.split(" ").filter(Boolean)
  const firstName = normalizeText(process.env.APPLICANT_FIRST_NAME) || nameParts[0] || "Med"
  const lastName =
    normalizeText(process.env.APPLICANT_LAST_NAME) ||
    nameParts.slice(1).join(" ") ||
    "Aziz"

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
    scalaExperience: normalizeText(process.env.APPLICANT_SCALA_EXPERIENCE) || normalizeText(process.env.APPLICANT_YEARS_EXPERIENCE) || "1",
    gamblingExperience: normalizeText(process.env.APPLICANT_GAMBLING_EXPERIENCE) || "0",
    currentCompany: normalizeText(process.env.APPLICANT_CURRENT_COMPANY) || "Confidential",
    linkedinUrl: normalizeText(process.env.APPLICANT_LINKEDIN_URL) || "https://linkedin.com/in/medazizazaiez",
    portfolioUrl:
      normalizeText(process.env.APPLICANT_PORTFOLIO_URL) ||
      normalizeText(process.env.APPLICANT_LINKEDIN_URL) ||
      "https://linkedin.com/in/medazizazaiez",
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
  const profileName = normalizeText(profile?.fullName)
  const nameParts = profileName.split(" ").filter(Boolean)
  const firstName = normalizeText(profile?.fullName ? nameParts[0] : "") || fallback.firstName
  const lastName = normalizeText(profile?.fullName ? nameParts.slice(1).join(" ") : "") || fallback.lastName

  return {
    ...fallback,
    firstName,
    lastName,
    fullName: profileName || fallback.fullName,
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
  private answers: ApplicationAnswers
  private applicantProfile?: LinkedInBotProfile
  private onResult?: ApplyResultHandler
  private onLog?: LogHandler
  private shouldStop?: StopHandler
  private currentJobContext: { title: string; company: string; location: string } = { title: "", company: "", location: "" }
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
    shouldStop?: StopHandler
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

  private getFallbackSearchTitles() {
    const desiredTitles = (this.applicantProfile?.desiredTitles || [])
      .map((title) => normalizeText(title))
      .filter(Boolean)

    return desiredTitles.length ? Array.from(new Set(desiredTitles)) : DEFAULT_JOB_TITLES
  }

  private getSearchLocations() {
    const desiredLocation = normalizeText(this.applicantProfile?.desiredLocation)

    if (this.applicantProfile?.remoteOnly) {
      return ["Remote"]
    }

    const locations: string[] = []

    if (desiredLocation) {
      if (desiredLocation.toLowerCase() === WORLDWIDE_LOCATION.toLowerCase()) {
        locations.push(WORLDWIDE_LOCATION)
      } else if (!locations.some((location) => location.toLowerCase() === desiredLocation.toLowerCase())) {
        locations.push(desiredLocation)
      }
    }

    if (!locations.length) {
      locations.push(WORLDWIDE_LOCATION)
    }

    return locations
  }

  private async prepareSearchStrategy() {
    this.searchLocations = this.getSearchLocations()
    this.searchTitles = this.getFallbackSearchTitles()

    if (!this.applicantProfile) return

    try {
      const suggestion = await suggestJobTitlesFromProfile(this.applicantProfile)
      if (suggestion?.titles?.length) {
        this.searchTitles = suggestion.titles
        await this.log(`AI selected job titles: ${suggestion.titles.join(", ")}`)
      } else {
        await this.log(`Using profile job titles: ${this.searchTitles.join(", ")}`)
      }
    } catch (error) {
      await this.log(
        `AI title selection failed, using fallback titles: ${error instanceof Error ? error.message : String(error)}`,
        "error"
      )
    }

    await this.log(`Search locations: ${this.searchLocations.join(", ")}`)
  }

  private async log(message: string, type = "status") {
    console.log(message)
    if (this.onLog) {
      await this.onLog(message, type)
    }
  }

  private async isStopRequested() {
    return this.shouldStop ? Boolean(await this.shouldStop()) : false
  }

  private async isVerificationRequired() {
    if (!this.page) return false

    const url = this.page.url().toLowerCase()
    if (
      url.includes("/checkpoint") ||
      url.includes("/challenge") ||
      url.includes("/captcha") ||
      url.includes("/uas/account-restricted")
    ) {
      return true
    }

    const pageText = await this.page.evaluate(() => {
      return document.body?.innerText?.replace(/\s+/g, " ").trim().toLowerCase() || ""
    }).catch(() => "")

    return (
      pageText.includes("verification de securite") ||
      pageText.includes("vérification de sécurité") ||
      pageText.includes("quick security check") ||
      pageText.includes("security verification") ||
      pageText.includes("captcha") ||
      pageText.includes("verify your identity") ||
      pageText.includes("let's do a quick security check")
    )
  }

  private async waitForVerificationResolution() {
    if (!this.page) return false

    await this.log("LinkedIn verification required. Complete it manually in the open browser.", "error")
    await this.log("The browser will stay open on the verification page until you finish.", "status")

    for (let attempt = 0; attempt < 600; attempt++) {
      if (await this.isStopRequested()) {
        await this.log("Stop requested while waiting for verification.", "done")
        return false
      }

      await this.sleep(2000)

      const stillBlocked = await this.isVerificationRequired()
      if (!stillBlocked) {
        await this.log("LinkedIn verification completed. Resuming bot.", "status")
        return true
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
      if (await this.isStopRequested()) {
        await this.log("Stop requested while waiting for manual LinkedIn login.", "done")
        return false
      }

      await this.sleep(2000)

      const url = this.page.url().toLowerCase()
      if (url.includes("/feed") || url.includes("/home")) {
        await this.log("Manual LinkedIn login completed. Resuming bot.", "status")
        return true
      }

      if (await this.isVerificationRequired()) {
        const resolved = await this.waitForVerificationResolution()
        if (!resolved) return false
      }
    }

    await this.log("Manual LinkedIn login was not completed in time. Stopping LinkedIn run.", "error")
    return false
  }

  private async ensureVerificationCleared() {
    const blocked = await this.isVerificationRequired()
    if (!blocked) return true
    return this.waitForVerificationResolution()
  }

  async launch() {
    await this.log("Launching browser...")
    this.browser = await chromium.launch({
      headless: false,
      slowMo: 100,
      args: [
        "--start-maximized",
        "--disable-blink-features=AutomationControlled",
      ],
    })

    const context = await this.browser.newContext({
      viewport: null,
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    })

    this.page = await context.newPage()
    await this.log("Browser ready")
  }

  async login(): Promise<boolean> {
    if (!this.page) throw new Error("Browser not launched")
    await this.log("Logging into LinkedIn...")

    await this.page.goto("https://www.linkedin.com/login", { waitUntil: "domcontentloaded", timeout: 60000 })
    await this.sleep(1000)

    if (await this.isVerificationRequired()) {
      const resolved = await this.waitForVerificationResolution()
      if (!resolved) return false
    }

    const emailInput =
      (await this.page.$("#username")) ||
      (await this.page.$("input[name='session_key']")) ||
      (await this.page.$("input[type='email']")) ||
      (await this.page.$("input[name*='email' i]")) ||
      (await this.page.$("input[name*='username' i]"))

    const passwordInput =
      (await this.page.$("#password")) ||
      (await this.page.$("input[name='session_password']")) ||
      (await this.page.$("input[type='password']"))

    if (!emailInput || !passwordInput) {
      if (await this.isVerificationRequired()) {
        return this.waitForVerificationResolution()
      }

      await this.log("Could not find the standard LinkedIn login form. LinkedIn may be showing a different page or challenge.", "error")
      return this.waitForManualLoginResolution()
    }

    await emailInput.fill(this.email)
    await this.sleep(500)

    await passwordInput.fill(this.password)
    await this.sleep(500)

    const submitButton =
      (await this.page.$('[type="submit"]')) ||
      (await this.findActionButton(["sign in", "login", "se connecter", "connexion"]))

    if (!submitButton) {
      await this.log("Could not find the LinkedIn sign-in button.", "error")
      return this.waitForManualLoginResolution()
    }

    await this.clickHandle(submitButton)
    await this.page.waitForLoadState("domcontentloaded", { timeout: 60000 })
    await this.sleep(2000)

    const url = this.page.url()
    if (url.includes("/feed") || url.includes("/home")) {
      await this.log("Logged in successfully")
      return true
    }

    if (await this.isVerificationRequired()) {
      const resolved = await this.waitForVerificationResolution()
      if (!resolved) return false

      const currentUrl = this.page.url()
      if (currentUrl.includes("/feed") || currentUrl.includes("/home")) {
        await this.log("Logged in successfully")
        return true
      }
    }

    await this.log("Login failed. Check your email/password.", "error")
    return this.waitForManualLoginResolution()
  }

  async searchJobs(query: string, location: string): Promise<LinkedInJob[]> {
    if (!this.page) throw new Error("Browser not launched")
    if (!(await this.ensureVerificationCleared())) return []
    await this.log(`Searching: "${query}" in "${location}"`)

    const params = new URLSearchParams({
      keywords: query,
      f_AL: "true",
      sortBy: "DD",
    })

    if (location && location.toLowerCase() !== WORLDWIDE_LOCATION.toLowerCase()) {
      params.set("location", location)
    }

    const searchUrl = `https://www.linkedin.com/jobs/search/?${params.toString()}`

    await this.page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 600000 })
    await this.sleep(2000)

    if (!(await this.ensureVerificationCleared())) return []

    try {
      await this.page.waitForSelector(".jobs-search__results-list, .scaffold-layout__list", { timeout: 10000 })
    } catch {
      await this.log("No jobs found for this search", "skipped")
      return []
    }

    await this.scrollJobList()

    const jobs = await this.page.evaluate(() => {
      const cards = document.querySelectorAll(".jobs-search__results-list li, .scaffold-layout__list-item")
      const results: LinkedInJob[] = []

      cards.forEach((card) => {
        const titleEl = card.querySelector(
          ".job-card-list__title--link, .job-card-list__title, .job-card-container__link"
        )
        const companyEl = card.querySelector(
          ".job-card-container__company-name, .job-card-container__primary-description, .artdeco-entity-lockup__subtitle"
        )
        const locationEl = card.querySelector(
          ".job-card-container__metadata-item, .artdeco-entity-lockup__caption"
        )
        const linkEl = card.querySelector("a[href*='/jobs/view/']") as HTMLAnchorElement | null
        const easyApply =
          card.querySelector(".job-card-container__apply-method") ||
          card.textContent?.toLowerCase().includes("easy apply")

        if (titleEl && linkEl) {
          const href = linkEl.href
          const idMatch = href.match(/\/jobs\/view\/(\d+)/)
          let title =
            titleEl.getAttribute("aria-label") ||
            titleEl.textContent ||
            linkEl.getAttribute("aria-label") ||
            ""
          title = title.replace(/\s+/g, " ").trim()
          if (title) {
            const midpoint = title.length / 2
            if (Number.isInteger(midpoint)) {
              const firstHalf = title.slice(0, midpoint).trim()
              const secondHalf = title.slice(midpoint).trim()
              if (firstHalf && firstHalf === secondHalf) {
                title = firstHalf
              }
            }
          }
          const company = (companyEl?.textContent || "").replace(/\s+/g, " ").trim()
          const locationText = (locationEl?.textContent || "").replace(/\s+/g, " ").trim()

          results.push({
            id: idMatch ? idMatch[1] : Math.random().toString(),
            title,
            company,
            location: locationText,
            url: href,
            isEasyApply: !!easyApply,
          })
        }
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

      await Promise.race([
        this.page.waitForSelector("button", { timeout: 8000 }),
        this.page.waitForSelector(".jobs-details", { timeout: 8000 }),
        this.page.waitForSelector(".job-view-layout", { timeout: 8000 }),
      ])

      await this.sleep(2000)

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
      this.currentJobContext = {
        title: resolvedJob.title,
        company: resolvedJob.company,
        location: resolvedJob.location,
      }

      await this.log(`Applying to: ${resolvedJob.title} at ${resolvedJob.company || "Unknown company"}`)

      const alreadyApplied =
        (await this.page.$("[aria-label*='Applied']")) ||
        (await this.page.$("button:has-text('Applied')")) ||
        (await this.page.$(".jobs-s-apply__application-link"))

      if (alreadyApplied) {
        await this.log("Already applied. Skipping", "skipped")
        return { jobId: resolvedJob.id, title: resolvedJob.title, company: resolvedJob.company, status: "already_applied" }
      }

      await this.page.waitForTimeout(2000)

      const easyApplyBtn = await this.findEasyApplyButton()

      if (!easyApplyBtn) {
        await this.log("No Easy Apply button. Skipping", "skipped")
        return { jobId: resolvedJob.id, title: resolvedJob.title, company: resolvedJob.company, status: "skipped", reason: "No Easy Apply" }
      }

      await this.sleep(1000)
      await this.clickHandle(easyApplyBtn)
      await this.sleep(2000)

      const applied = await this.handleApplicationModal()

      if (applied) {
        await this.log("Applied successfully")
        return { jobId: resolvedJob.id, title: resolvedJob.title, company: resolvedJob.company, status: "applied" }
      }

      await this.log("Skipped. Requires extra info", "skipped")
      return { jobId: resolvedJob.id, title: resolvedJob.title, company: resolvedJob.company, status: "skipped", reason: "Complex form" }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await this.log(`Failed: ${msg}`, "error")
      return { jobId: job.id, title: job.title, company: job.company, status: "failed", reason: msg }
    }
  }

  private async handleApplicationModal(): Promise<boolean> {
    if (!this.page) return false

    const MAX_STEPS = 8
    let cvUploaded = false

    for (let step = 0; step < MAX_STEPS; step++) {
      if (!(await this.ensureVerificationCleared())) {
        return false
      }

      if (await this.isStopRequested()) {
        await this.log("Stop requested. Ending current run.", "done")
        await this.dismissApplicationModal()
        return false
      }

      await this.sleep(1500)

      const modal = await this.page.$(".jobs-easy-apply-modal, [role='dialog']")
      if (!modal) break

      if (await this.hasCoverLetterRequirement()) {
        await this.log("Skipping cover letter application", "skipped")
        await this.dismissApplicationModal()
        return false
      }

      if (!cvUploaded) {
        cvUploaded = await this.uploadCV()
      }

      if (SIMPLE_EASY_APPLY_ONLY) {
        const requiresExtraInfo = await this.hasUnfilledComplexFields()
        if (requiresExtraInfo) {
          await this.log("Skipping complex Easy Apply form", "skipped")
          await this.dismissApplicationModal()
          return false
        }
      } else {
        await this.fillTextInputs()
        await this.answerRadioButtons()
        await this.answerSelects()
        await this.answerComboboxes()
      }

      const submitBtn = await this.findActionButton([
        "submit application",
        "send application",
      ])
      if (submitBtn) {
        if (PAUSE_BEFORE_SUBMIT) {
          await this.log("Review the application in the browser, then press Enter here to submit")
          await this.pauseForManualReview()
        }

        await this.clickHandle(submitBtn)
        await this.sleep(2000)
        await this.log("Submitted")

        const doneBtn = await this.page.$("button[aria-label='Dismiss'], button:has-text('Done')")
        if (doneBtn) await this.clickHandle(doneBtn)
        return true
      }

      const reviewBtn = await this.findActionButton([
        "review your application",
        "review application",
        "review",
      ])
      if (reviewBtn) {
        await this.log("Moving to review step")
        await this.clickHandle(reviewBtn)
        continue
      }

      const nextBtn = await this.findActionButton([
        "continue to next step",
        "continue application",
        "continue",
        "next",
      ])
      if (nextBtn) {
        await this.log("Moving to next step")
        await this.clickHandle(nextBtn)
        continue
      }

      const unresolved = await this.getBlockingQuestions()
      const simpleContactStepComplete = await this.isSimpleContactStepComplete()
      if (unresolved.length > 0 && !SIMPLE_EASY_APPLY_ONLY) {
        await this.log(`Waiting on remaining fields (${unresolved.join(", ")})`, "skipped")
      }

      const visibleError = await this.getVisibleInlineError()
      if (visibleError) {
        await this.log(`LinkedIn validation message: ${visibleError}`, "error")

        if (unresolved.length > 0) {
          await this.log("Validation is still blocking this step, retrying before skipping", "status")
          await this.sleep(1500)
          continue
        }
      }

      const primaryModalButton = await this.findPrimaryModalButton()
      if (primaryModalButton && simpleContactStepComplete) {
        const label = normalizeText(
          await primaryModalButton.evaluate((el) => (el as HTMLElement).innerText || el.getAttribute("aria-label") || "").catch(() => "")
        ).toLowerCase()

        await this.log(`Contact step looks complete. Forcing primary action: ${label || "continue"}`)
        await this.clickHandle(primaryModalButton)
        continue
      }

      if (primaryModalButton && unresolved.length === 0) {
        const label = normalizeText(
          await primaryModalButton.evaluate((el) => (el as HTMLElement).innerText || el.getAttribute("aria-label") || "").catch(() => "")
        ).toLowerCase()

        await this.log(`Using primary modal action: ${label || "continue"}`)
        await this.clickHandle(primaryModalButton)
        continue
      }

      await this.log("No action button found yet, retrying current step")
      await this.sleep(1500)
      continue
    }

    return false
  }

  private async isSimpleContactStepComplete() {
    if (!this.page) return false

    return this.page.evaluate(() => {
      const modal = document.querySelector(".jobs-easy-apply-modal, [role='dialog']")
      if (!modal) return false

      const text = modal.textContent?.replace(/\s+/g, " ").trim().toLowerCase() || ""
      const hasEmailLabel = text.includes("email address") || text.includes("adresse e-mail")
      const hasCountryCodeLabel = text.includes("phone country code") || text.includes("code pays")
      const hasMobileLabel =
        text.includes("mobile phone number") ||
        text.includes("numéro de téléphone portable") ||
        text.includes("numero de telephone portable")
      const looksLikeContactStep = hasEmailLabel && hasCountryCodeLabel && hasMobileLabel

      if (!looksLikeContactStep) return false

      const emailInput = modal.querySelector("input[type='email']") as HTMLInputElement | null
      const phoneInput = modal.querySelector("input[type='tel']") as HTMLInputElement | null
      const combobox = modal.querySelector("[role='combobox'], button[aria-haspopup='listbox'], input[role='combobox']") as
        | HTMLInputElement
        | HTMLElement
        | null

      const emailValue = emailInput?.value?.trim() || ""
      const phoneValue = phoneInput?.value?.trim() || ""
      const comboValue =
        (combobox instanceof HTMLInputElement ? combobox.value : combobox?.getAttribute("aria-label") || combobox?.textContent || "")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase()

      return Boolean(
        emailValue &&
        phoneValue &&
        (comboValue.includes("+216") || comboValue.includes("tunisia") || comboValue.includes("tunisie"))
      )
    }).catch(() => false)
  }

  private async hasUnfilledComplexFields(): Promise<boolean> {
    if (!this.page) return true

    return this.page.evaluate(() => {
      const modal = document.querySelector(".jobs-easy-apply-modal, [role='dialog']")
      if (!modal) return false

      const textInputs = Array.from(
        modal.querySelectorAll("input[type='text'], input[type='tel'], input[type='number'], input[type='email'], textarea")
      )
      for (const field of textInputs) {
        const htmlEl = field as HTMLElement
        const style = window.getComputedStyle(htmlEl)
        if (style.display === "none" || style.visibility === "hidden" || htmlEl.offsetParent === null) continue
        const input = field as HTMLInputElement | HTMLTextAreaElement
        const type = input.getAttribute("type") || ""
        const value = input.value?.trim() || ""
        const isResumeUpload = type === "file"
        if (!isResumeUpload && !value) return true
      }

      const selects = Array.from(modal.querySelectorAll("select"))
      for (const field of selects) {
        const htmlEl = field as HTMLElement
        const style = window.getComputedStyle(htmlEl)
        if (style.display === "none" || style.visibility === "hidden" || htmlEl.offsetParent === null) continue
        const select = field as HTMLSelectElement
        if (!select.value) return true
      }

      const radioGroups = Array.from(modal.querySelectorAll("fieldset"))
      for (const group of radioGroups) {
        const htmlEl = group as HTMLElement
        const style = window.getComputedStyle(htmlEl)
        if (style.display === "none" || style.visibility === "hidden" || htmlEl.offsetParent === null) continue
        if (!group.querySelector("input[type='radio']:checked")) return true
      }

      const checkboxes = Array.from(modal.querySelectorAll("input[type='checkbox'][required]"))
      for (const field of checkboxes) {
        const htmlEl = field as HTMLElement
        const style = window.getComputedStyle(htmlEl)
        if (style.display === "none" || style.visibility === "hidden" || htmlEl.offsetParent === null) continue
        const checkbox = field as HTMLInputElement
        if (!checkbox.checked) return true
      }

      return false
    })
  }

  private async dismissApplicationModal() {
    if (!this.page) return

    const closeBtn =
      (await this.page.$("button[aria-label='Dismiss']")) ||
      (await this.page.$("button[aria-label='Close']")) ||
      (await this.findActionButton(["discard", "cancel"]))

    if (closeBtn) {
      await this.clickHandle(closeBtn).catch(() => {})
      await this.sleep(500)
    }

    const discardBtn = await this.findActionButton(["discard", "exit"])
    if (discardBtn) {
      await this.clickHandle(discardBtn).catch(() => {})
      await this.sleep(500)
    }
  }

  private async getVisibleInlineError() {
    if (!this.page) return ""

    return this.page.evaluate(() => {
      const errors = Array.from(document.querySelectorAll(".artdeco-inline-feedback--error"))
      for (const node of errors) {
        const el = node as HTMLElement
        const style = window.getComputedStyle(el)
        if (style.display === "none" || style.visibility === "hidden" || el.offsetParent === null) continue

        const text = el.textContent?.replace(/\s+/g, " ").trim() || ""
        if (text) return text
      }

      return ""
    }).catch(() => "")
  }

  private async clickHandle(handle: {
    scrollIntoViewIfNeeded?: () => Promise<void>
    click: (options?: { force?: boolean; timeout?: number }) => Promise<unknown>
    evaluate: <T>(pageFunction: (element: Element) => T) => Promise<T>
  }) {
    try {
      if (handle.scrollIntoViewIfNeeded) {
        await handle.scrollIntoViewIfNeeded().catch(() => {})
      }
      await handle.click({ timeout: 5000 })
      return
    } catch {}

    try {
      await handle.click({ force: true, timeout: 3000 })
      return
    } catch {}

    await handle.evaluate((el) => {
      ;(el as HTMLElement).click()
    })
  }

  private async findEasyApplyButton() {
    if (!this.page) return null

    const directMatch =
      (await this.page.$("button[aria-label*='Easy Apply']")) ||
      (await this.page.$("[data-control-name='jobdetails_topcard_inapply']")) ||
      (await this.page.$(".jobs-apply-button--top-card")) ||
      (await this.page.$("button.jobs-apply-button")) ||
      (await this.page.$("[aria-label*='Easy Apply']")) ||
      (await this.page.$("button:has-text('Easy Apply')")) ||
      (await this.page.$("div[role='button']:has-text('Easy Apply')")) ||
      (await this.page.$("a:has-text('Easy Apply')")) ||
      (await this.page.$("button:has-text('Continue to application')")) ||
      (await this.page.$("div[role='button']:has-text('Continue to application')")) ||
      (await this.page.$("a:has-text('Continue to application')")) ||
      (await this.page.$("button:has-text('Apply now')"))

    if (directMatch) return directMatch

    const candidates = await this.page.$$("button, a, div[role='button']")
    for (const candidate of candidates) {
      const isDisabled = await candidate.evaluate((el) => {
        const htmlEl = el as HTMLElement & { disabled?: boolean }
        return Boolean(htmlEl.disabled) || el.getAttribute("aria-disabled") === "true"
      }).catch(() => true)

      if (isDisabled) continue

      const buttonText = normalizeText(await candidate.textContent()).toLowerCase()
      const ariaLabel = normalizeText((await candidate.getAttribute("aria-label")) || "").toLowerCase()
      const dataControlName = normalizeText((await candidate.getAttribute("data-control-name")) || "").toLowerCase()
      const className = normalizeText((await candidate.getAttribute("class")) || "").toLowerCase()
      const combined = `${buttonText} ${ariaLabel} ${dataControlName} ${className}`

      if (
        combined.includes("easy apply") ||
        combined.includes("inapply") ||
        combined.includes("continue to application") ||
        combined.includes("apply now")
      ) {
        return candidate
      }
    }

    return null
  }

  private async findActionButton(targets: string[]) {
    if (!this.page) return null

    const buttons = await this.page.$$("button, a, div[role='button'], input[type='submit'], input[type='button']")
    for (const button of buttons) {
      const isDisabled = await button.evaluate((el) => {
        const htmlEl = el as HTMLElement & { disabled?: boolean }
        return Boolean(htmlEl.disabled) || el.getAttribute("aria-disabled") === "true"
      }).catch(() => true)

      if (isDisabled) continue

      const buttonText = normalizeText(await button.textContent()).toLowerCase()
      const innerText = normalizeText(await button.evaluate((el) => (el as HTMLElement).innerText || "").catch(() => "")).toLowerCase()
      const value = normalizeText((await button.getAttribute("value")) || "").toLowerCase()
      const title = normalizeText((await button.getAttribute("title")) || "").toLowerCase()
      const ariaLabel = normalizeText((await button.getAttribute("aria-label")) || "").toLowerCase()
      const dataControlName = normalizeText((await button.getAttribute("data-control-name")) || "").toLowerCase()
      const className = normalizeText((await button.getAttribute("class")) || "").toLowerCase()
      const combined = `${buttonText} ${innerText} ${value} ${title} ${ariaLabel} ${dataControlName} ${className}`

      if (targets.some((target) => combined.includes(target))) {
        return button
      }
    }

    return null
  }

  private async findPrimaryModalButton() {
    if (!this.page) return null

    const selectors = [
      ".jobs-easy-apply-modal footer .artdeco-button--primary",
      ".jobs-easy-apply-modal .artdeco-modal__actionbar .artdeco-button--primary",
      ".jobs-easy-apply-modal .display-flex.justify-flex-end button.artdeco-button--primary",
      "[role='dialog'] footer .artdeco-button--primary",
      "[role='dialog'] .artdeco-modal__actionbar .artdeco-button--primary",
      "[role='dialog'] button.artdeco-button--primary",
    ]

    for (const selector of selectors) {
      const button = await this.page.$(selector)
      if (!button) continue

      const isDisabled = await button.evaluate((el) => {
        const htmlEl = el as HTMLElement & { disabled?: boolean }
        return Boolean(htmlEl.disabled) || el.getAttribute("aria-disabled") === "true"
      }).catch(() => true)

      if (!isDisabled) return button
    }

    return null
  }

  private async fillTextInputs() {
    if (!this.page) return

    const inputs = await this.page.$$(
      "input[type='text']:visible, input[type='tel']:visible, input[type='number']:visible, input[type='email']:visible, textarea:visible"
    )

    for (const input of inputs) {
      const label = await this.getFieldPrompt(input)
      const shortLabel = this.describeFieldLabel(label)
      const preferGroq = this.isProfileDrivenQuestion(label)
      const value = normalizeText(await input.inputValue())

      if (label.includes("location") && (label.includes("city") || label.includes("ville"))) {
        await this.fillLocationField(input, value)
        await this.sleep(300)
        continue
      }

      if (value) continue

      if (label.includes("first name") || label.includes("prenom") || label.includes("prénom")) {
        await input.fill(this.answers.firstName)
        await this.log(`Filled ${shortLabel}: ${this.answers.firstName}`)
      } else if (label.includes("last name") || label.includes("family name") || label.includes("nom")) {
        await input.fill(this.answers.lastName)
        await this.log(`Filled ${shortLabel}: ${this.answers.lastName}`)
      } else if (label.includes("full name")) {
        await input.fill(this.answers.fullName)
        await this.log(`Filled ${shortLabel}: ${this.answers.fullName}`)
      } else if (label.includes("email")) {
        await input.fill(this.email)
        await this.log(`Filled ${shortLabel}: ${this.email}`)
      } else if (label.includes("phone") || label.includes("téléphone") || label.includes("mobile")) {
        await input.fill(this.answers.phone)
        await this.log(`Filled ${shortLabel}: ${this.answers.phone}`)
      } else if (label.includes("current company") || label.includes("employer")) {
        await input.fill(this.answers.currentCompany)
        await this.log(`Filled ${shortLabel}: ${this.answers.currentCompany}`)
      } else if (label.includes("notice")) {
        await input.fill(this.answers.noticePeriod)
        await this.log(`Filled ${shortLabel}: ${this.answers.noticePeriod}`)
      } else if (label.includes("scala") && label.includes("experience")) {
        await input.fill(this.answers.scalaExperience)
        await this.log(`Filled ${shortLabel}: ${this.answers.scalaExperience}`)
      } else if (
        (label.includes("gambling") || label.includes("igaming") || label.includes("gaming industry")) &&
        label.includes("experience")
      ) {
        await input.fill(this.answers.gamblingExperience)
        await this.log(`Filled ${shortLabel}: ${this.answers.gamblingExperience}`)
      } else if (label.includes("year") || label.includes("année") || label.includes("experience")) {
        await input.fill(this.answers.yearsExperience)
        await this.log(`Filled ${shortLabel}: ${this.answers.yearsExperience}`)
      } else if (label.includes("salary") || label.includes("salaire") || label.includes("compensation")) {
        await input.fill(this.answers.salaryExpectation)
        await this.log(`Filled ${shortLabel}: ${this.answers.salaryExpectation}`)
      } else if (label.includes("how did you hear") || label.includes("where did you hear") || label.includes("source")) {
        const aiFilled = preferGroq ? await this.fillTextInputWithGroq(input, label) : false
        if (!aiFilled) {
          await input.fill(this.answers.referralSource)
          await this.log(`Filled ${shortLabel}: ${this.answers.referralSource}`)
        }
      } else if (label.includes("citizenship")) {
        const aiFilled = preferGroq ? await this.fillTextInputWithGroq(input, label) : false
        if (!aiFilled) {
          await input.fill(this.answers.citizenship)
          await this.log(`Filled ${shortLabel}: ${this.answers.citizenship}`)
        }
      } else if (
        label.includes("what country are you based in") ||
        label.includes("country are you based in") ||
        label.includes("based in")
      ) {
        const aiFilled = preferGroq ? await this.fillTextInputWithGroq(input, label) : false
        if (!aiFilled) {
          await input.fill(this.answers.baseCountry)
          await this.log(`Filled ${shortLabel}: ${this.answers.baseCountry}`)
        }
      } else if (label.includes("country") || label.includes("pays") || label.includes("nationality") || label.includes("citizenship")) {
        await this.fillCountryField(input)
      } else if (label.includes("city") || label.includes("ville")) {
        await input.fill(this.answers.city)
        await this.log(`Filled ${shortLabel}: ${this.answers.city}`)
      } else if (label.includes("linkedin") || label.includes("website") || label.includes("portfolio")) {
        const value = label.includes("portfolio") ? this.answers.portfolioUrl : this.answers.linkedinUrl
        await input.fill(value)
        await this.log(`Filled ${shortLabel}: ${value}`)
      } else {
        const aiFilled = await this.fillTextInputWithGroq(input, label)
        if (!aiFilled) continue
      }

      await this.sleep(300)
    }
  }

  private async fillLocationField(
    input: {
      fill: (value: string) => Promise<void>
      click: (options?: { force?: boolean; timeout?: number }) => Promise<unknown>
      press?: (key: string) => Promise<void>
      inputValue?: () => Promise<string>
    },
    currentValue = ""
  ) {
    const desiredCity = this.answers.city
    const desiredCountry = this.answers.baseCountry || this.answers.country

    if (currentValue && currentValue.toLowerCase().includes(desiredCity.toLowerCase())) {
      await this.log(`Location already set: ${currentValue}`)
      return
    }

    const searchTerms = [`${desiredCity}, ${desiredCountry}`, desiredCity]

    for (const searchTerm of searchTerms) {
      await input.click({ force: true }).catch(() => {})
      await input.fill(searchTerm).catch(() => {})
      await this.log(`Typing location search: ${searchTerm}`)
      await this.sleep(900)

      if (this.page) {
        const candidates = await this.page.$$(
          "[role='option'], div[role='option'], li, .basic-typeahead__selectable, .artdeco-typeahead__result"
        )

        for (const candidate of candidates) {
          const text = normalizeText(await candidate.textContent()).toLowerCase()
          if (!text) continue
          if (
            text === searchTerm.toLowerCase() ||
            text.includes(searchTerm.toLowerCase()) ||
            text.includes(desiredCity.toLowerCase())
          ) {
            await this.clickHandle(candidate).catch(() => {})
            await this.sleep(400)
            const confirmed = input.inputValue ? normalizeText(await input.inputValue().catch(() => "")) : ""
            await this.log(`Selected location option: ${text}`)
            if (confirmed && confirmed.toLowerCase().includes(desiredCity.toLowerCase())) {
              return
            }
          }
        }
      }

      if (input.press) {
        await input.press("ArrowDown").catch(() => {})
        await this.sleep(250)
        await input.press("Enter").catch(() => {})
      } else if (this.page) {
        await this.page.keyboard.press("ArrowDown").catch(() => {})
        await this.sleep(250)
        await this.page.keyboard.press("Enter").catch(() => {})
      }

      const confirmed = input.inputValue ? normalizeText(await input.inputValue().catch(() => "")) : ""
      await this.log(`Selected location with keyboard: ${confirmed || searchTerm}`)
      if (confirmed && confirmed.toLowerCase().includes(desiredCity.toLowerCase())) {
        return
      }
    }

    await this.log("Location selection could not be confirmed", "error")
  }

  private async uploadCV() {
    if (!this.page) return false

    const fileInputs = await this.page.$$("input[type='file']")
    if (fileInputs.length === 0) return false

    for (const fileInput of fileInputs) {
      const contextText = await fileInput.evaluate((el) => {
        const wrapper =
          el.closest("[data-test-form-element]") ||
          el.closest(".jobs-easy-apply-form-section__grouping") ||
          el.closest(".fb-dash-form-element") ||
          el.parentElement

        return wrapper?.textContent?.replace(/\s+/g, " ").trim().toLowerCase() || ""
      }).catch(() => "")

      const looksLikeResumeField =
        !contextText ||
        contextText.includes("resume") ||
        contextText.includes("cv") ||
        contextText.includes("curriculum")

      if (!looksLikeResumeField) continue

      const existingFiles = await fileInput.evaluate((el) => {
        const input = el as HTMLInputElement
        return input.files?.length || 0
      }).catch(() => 0)

      if (existingFiles > 0) {
        await this.log("CV already attached")
        return true
      }

      const absolutePath = path.resolve(this.cvPath)
      await fileInput.setInputFiles(absolutePath)
      await this.log("CV uploaded")
      await this.sleep(1000)
      return true
    }

    return false
  }

  private async fillCountryField(input: {
    fill: (value: string) => Promise<void>
    click: (options?: { force?: boolean; timeout?: number }) => Promise<unknown>
    press?: (key: string) => Promise<void>
    inputValue?: () => Promise<string>
  }) {
    const searchTerms = [
      `${this.answers.city}, ${this.answers.country}`,
      this.answers.country,
    ]

    for (const searchTerm of searchTerms) {
      await input.click({ force: true }).catch(() => {})
      await input.fill(searchTerm)
      await this.log(`Typing country search: ${searchTerm}`)
      await this.sleep(900)

      if (this.page) {
        const candidates = await this.page.$$(
          "[role='option'], div[role='option'], li, .basic-typeahead__selectable, .artdeco-typeahead__result"
        )

        for (const candidate of candidates) {
          const text = normalizeText(await candidate.textContent()).toLowerCase()
          if (!text) continue
          if (
            text === searchTerm.toLowerCase() ||
            text.includes(searchTerm.toLowerCase()) ||
            text.includes(this.answers.country.toLowerCase())
          ) {
            await this.clickHandle(candidate).catch(() => {})
            await this.sleep(400)
            const currentValue = input.inputValue ? normalizeText(await input.inputValue().catch(() => "")) : ""
            await this.log(`Selected country option: ${text}`)
            if (currentValue && currentValue.toLowerCase().includes("tun")) {
              return
            }
          }
        }
      }

      if (input.press) {
        await input.press("ArrowDown").catch(() => {})
        await this.sleep(250)
        await input.press("Enter").catch(() => {})
      } else if (this.page) {
        await this.page.keyboard.press("ArrowDown").catch(() => {})
        await this.sleep(250)
        await this.page.keyboard.press("Enter").catch(() => {})
      }

      const currentValue = input.inputValue ? normalizeText(await input.inputValue().catch(() => "")) : ""
      await this.log(`Selected country with keyboard: ${currentValue || searchTerm}`)
      if (currentValue && currentValue.toLowerCase().includes("tun")) {
        return
      }
    }

    await this.log("Country selection could not be confirmed", "error")
  }

  private async answerRadioButtons() {
    if (!this.page) return

    const radioGroups = await this.page.$$("fieldset:visible")
    for (const group of radioGroups) {
      const checked = await group.$("input[type='radio']:checked")
      if (checked) continue

      const groupText = normalizeText(await group.textContent()).toLowerCase()
      if (this.isProfileDrivenQuestion(groupText)) {
        const aiAnswered = await this.answerRadioGroupWithGroq(group)
        if (aiAnswered) continue
      }
      const desired =
        groupText.includes("living in europe") || groupText.includes("live in europe") || groupText.includes("currently living in europe")
          ? this.answers.livesInEurope
          : groupText.includes("personal laptop") || groupText.includes("laptop / pc") || groupText.includes("laptop") || groupText.includes("pc")
            ? this.answers.hasPersonalLaptop
            : groupText.includes("worked with our company") || groupText.includes("worked with our company before") || groupText.includes("worked before")
              ? this.answers.workedBefore
              : groupText.includes("sanctioned territories") || groupText.includes("russian federation") || groupText.includes("belarus") || groupText.includes("crimea")
                ? this.answers.inSanctionedTerritories
          : groupText.includes("b2b")
            ? this.answers.openToB2BContract
            : groupText.includes("visa sponsorship") || groupText.includes("provide visa")
              ? this.answers.sponsorshipRequired === "yes" ? "no" : "yes"
              : groupText.includes("sponsorship") || groupText.includes("sponsor")
                ? this.answers.sponsorshipRequired
                : groupText.includes("authorized") || groupText.includes("work permit") || groupText.includes("legally")
                  ? this.answers.workAuthorization
                  : groupText.includes("relocat")
                    ? this.answers.openToRelocation
                    : groupText.includes("remote")
                      ? this.answers.remotePreference
                      : "yes"

      const radios = await group.$$("input[type='radio']")
      let matched = false

      for (const radio of radios) {
        const radioValue = normalizeText((await radio.getAttribute("value")) || "").toLowerCase()
        const radioId = await radio.getAttribute("id")
        let labelText = ""
        if (radioId) {
          const labelEl = await group.$(`label[for="${radioId}"]`)
          labelText = normalizeText(await labelEl?.textContent()).toLowerCase()
        }

        if (
          radioValue === desired ||
          labelText === desired ||
          labelText.startsWith(`${desired} `) ||
          labelText.includes(` ${desired}`)
        ) {
          await radio.check().catch(() => {})
          await this.log(`Selected radio answer: ${labelText || radioValue || desired}`)
          matched = true
          break
        }
      }

      if (!matched) {
        const aiAnswered = await this.answerRadioGroupWithGroq(group)
        if (aiAnswered) continue

        const first = radios[0]
        if (first) await first.check().catch(() => {})
      }
    }
  }

  private async answerSelects() {
    if (!this.page) return

    const selects = await this.page.$$("select:visible")
    for (const select of selects) {
      const value = await select.inputValue()
      if (value) continue

      const label = await this.getFieldPrompt(select)
      const preferGroq = this.isProfileDrivenQuestion(label)

      const options = await select.$$eval("option", (nodes) =>
        nodes.map((node) => ({
          value: (node as HTMLOptionElement).value,
          text: node.textContent?.trim().toLowerCase() || "",
        }))
      )

      if (preferGroq) {
        const aiAnswered = await this.answerSelectWithGroq(select, label, options)
        if (aiAnswered) continue
      }

      const desiredText =
        label.includes("how did you hear") || label.includes("where did you hear") || label.includes("source")
          ? this.answers.referralSource.toLowerCase()
        : label.includes("personal laptop") || label.includes("laptop / pc") || label.includes("laptop") || label.includes("pc")
          ? this.answers.hasPersonalLaptop
        : label.includes("worked with our company") || label.includes("worked before")
          ? this.answers.workedBefore
        : label.includes("sanctioned territories") || label.includes("russian federation") || label.includes("belarus") || label.includes("crimea")
          ? this.answers.inSanctionedTerritories
        : label.includes("country are you based in") || label.includes("based in")
          ? this.answers.baseCountry.toLowerCase()
        : label.includes("country") || label.includes("pays") || label.includes("nationality") || label.includes("citizenship")
          ? this.answers.country.toLowerCase()
          : label.includes("scala") && label.includes("experience")
          ? this.answers.scalaExperience.toLowerCase()
          : (label.includes("gambling") || label.includes("igaming")) && label.includes("experience")
            ? this.answers.gamblingExperience.toLowerCase()
          : label.includes("experience")
          ? this.answers.yearsExperience.toLowerCase()
          : label.includes("notice")
            ? this.answers.noticePeriod.toLowerCase()
            : label.includes("b2b")
              ? this.answers.openToB2BContract
              : label.includes("living in europe") || label.includes("live in europe")
                ? this.answers.livesInEurope
            : label.includes("relocat")
              ? this.answers.openToRelocation
              : label.includes("sponsor")
                ? this.answers.sponsorshipRequired
                : label.includes("authorized")
                  ? this.answers.workAuthorization
                  : ""

      const matched = options.find((option) =>
        desiredText && (option.text.includes(desiredText) || option.value.toLowerCase() === desiredText)
      )

      if (matched?.value) {
        await select.selectOption(matched.value).catch(() => {})
        await this.log(`Selected ${this.describeFieldLabel(label)}: ${matched.text}`)
        continue
      }

      const aiAnswered = await this.answerSelectWithGroq(select, label, options)
      if (aiAnswered) continue

      if (options.length > 1 && options[1]?.value) {
        await select.selectOption(options[1].value).catch(() => {})
        await this.log(`Selected ${this.describeFieldLabel(label)}: ${options[1].text}`)
      }
    }
  }

  private async answerComboboxes() {
    if (!this.page) return

    const comboboxes = await this.page.$$(
      "[role='combobox']:visible, button[aria-haspopup='listbox']:visible, input[role='combobox']:visible"
    )

    for (const combobox of comboboxes) {
      const label = await this.getFieldPrompt(combobox)
      const shortLabel = this.describeFieldLabel(label)
      const preferGroq = this.isProfileDrivenQuestion(label)
      const currentValue = normalizeText(
        await combobox.evaluate((el) => {
          if (el instanceof HTMLInputElement) return el.value || ""
          return (
            el.getAttribute("aria-label") ||
            el.getAttribute("title") ||
            el.textContent ||
            ""
          )
        }).catch(() => "")
      )

      const lowered = label.toLowerCase()

      if (
        preferGroq &&
        !lowered.includes("phone country code") &&
        !lowered.includes("country code") &&
        !lowered.includes("code pays")
      ) {
        const aiSelected = await this.answerComboboxWithGroq(combobox, label)
        if (aiSelected) {
          await this.log(`Selected ${shortLabel}: ${Array.isArray(aiSelected) ? aiSelected.join(", ") : aiSelected}`)
          continue
        }
      }

      if (lowered.includes("phone country code") || lowered.includes("country code") || lowered.includes("code pays")) {
        if (
          currentValue.toLowerCase().includes("+216") ||
          currentValue.toLowerCase().includes("tunisia") ||
          currentValue.toLowerCase().includes("tunisie")
        ) {
          await this.log(`Selected ${shortLabel}: ${currentValue}`)
          continue
        }

        const selected = await this.selectComboboxOption(combobox, [
          "Tunisia (+216)",
          "Tunisie (+216)",
          "Tunisia",
          "Tunisie",
          "+216",
        ])
        if (selected) {
          await this.log(`Selected ${shortLabel}: ${selected}`)
        }
        continue
      }

      if (lowered.includes("how did you hear") || lowered.includes("where did you hear") || lowered.includes("source")) {
        const selected = await this.selectComboboxOption(combobox, [
          this.answers.referralSource,
          "LinkedIn",
        ])
        if (selected) {
          await this.log(`Selected ${shortLabel}: ${selected}`)
        }
        continue
      }

      if (
        lowered.includes("country") ||
        lowered.includes("pays") ||
        lowered.includes("nationality") ||
        lowered.includes("citizenship")
      ) {
        const desiredOptions = lowered.includes("citizenship")
          ? [this.answers.citizenship, this.answers.country]
          : lowered.includes("based in")
            ? [this.answers.baseCountry, `${this.answers.city}, ${this.answers.baseCountry}`]
            : [`${this.answers.city}, ${this.answers.country}`, this.answers.country]

        if (currentValue.toLowerCase().includes(this.answers.country.toLowerCase())) {
          await this.log(`Selected ${shortLabel}: ${currentValue}`)
          continue
        }

        const selected = await this.selectComboboxOption(combobox, desiredOptions)
        if (selected) {
          await this.log(`Selected ${shortLabel}: ${selected}`)
        }
        continue
      }

      const aiSelected = await this.answerComboboxWithGroq(combobox, label)
      if (aiSelected) {
        await this.log(`Selected ${shortLabel}: ${Array.isArray(aiSelected) ? aiSelected.join(", ") : aiSelected}`)
      }
    }
  }

  private async selectComboboxOption(
    combobox: {
      click: (options?: { force?: boolean; timeout?: number }) => Promise<unknown>
      fill?: (value: string) => Promise<void>
      press?: (key: string) => Promise<void>
      evaluate: <T>(pageFunction: (element: Element) => T) => Promise<T>
      inputValue?: () => Promise<string>
    },
    desiredOptions: string[],
    allowMultiple = false
  ): Promise<string[] | string | null> {
    if (!this.page) return null
    const selectedValues: string[] = []

    for (const desiredOption of desiredOptions) {
      await combobox.click({ force: true }).catch(() => {})
      await this.sleep(250)

      const isInput = await combobox.evaluate((el) => el instanceof HTMLInputElement).catch(() => false)
      if (isInput && combobox.fill) {
        await combobox.fill(desiredOption).catch(() => {})
      } else {
        await this.page.keyboard.press("Control+A").catch(() => {})
        await this.page.keyboard.type(desiredOption, { delay: 25 }).catch(() => {})
      }

      await this.sleep(700)

      const candidates = await this.page.$$(
        "[role='option'], div[role='option'], li, .basic-typeahead__selectable, .artdeco-typeahead__result"
      )

      for (const candidate of candidates) {
        const text = normalizeText(await candidate.textContent()).toLowerCase()
        if (!text) continue

        if (
          text === desiredOption.toLowerCase() ||
          text.includes(desiredOption.toLowerCase()) ||
          desiredOptions.some((option) => text.includes(option.toLowerCase()))
        ) {
          await this.clickHandle(candidate).catch(() => {})
          await this.sleep(400)
          const selectedText = normalizeText(await candidate.textContent())
          if (allowMultiple) {
            if (selectedText && !selectedValues.includes(selectedText)) {
              selectedValues.push(selectedText)
            }
            continue
          }
          return selectedText
        }
      }

      if (combobox.press) {
        await combobox.press("ArrowDown").catch(() => {})
        await this.sleep(200)
        await combobox.press("Enter").catch(() => {})
      } else {
        await this.page.keyboard.press("ArrowDown").catch(() => {})
        await this.sleep(200)
        await this.page.keyboard.press("Enter").catch(() => {})
      }

      await this.sleep(350)
      const value = combobox.inputValue ? normalizeText(await combobox.inputValue().catch(() => "")) : ""
      if (value) {
        if (allowMultiple) {
          if (!selectedValues.includes(value)) selectedValues.push(value)
          continue
        }
        return value
      }
    }

    if (allowMultiple && selectedValues.length) {
      return selectedValues
    }

    return null
  }

  private async answerComboboxWithGroq(
    combobox: {
      click: (options?: { force?: boolean; timeout?: number }) => Promise<unknown>
      fill?: (value: string) => Promise<void>
      press?: (key: string) => Promise<void>
      evaluate: <T>(pageFunction: (element: Element) => T) => Promise<T>
      inputValue?: () => Promise<string>
    },
    label: string
  ): Promise<string[] | string | null> {
    if (!this.page || !USE_GROQ_FOR_COMPLEX_FORMS || !this.applicantProfile) return null

    await combobox.click({ force: true }).catch(() => {})
    await this.sleep(400)

    const allowMultiple = await this.page.evaluate(() => {
      const listbox = document.querySelector("[role='listbox']")
      if (!listbox) return false
      return listbox.getAttribute("aria-multiselectable") === "true"
    }).catch(() => false)

    const options = await this.page.$$eval(
      "[role='option'], div[role='option'], li, .basic-typeahead__selectable, .artdeco-typeahead__result",
      (nodes) =>
        nodes
          .map((node) => node.textContent?.replace(/\s+/g, " ").trim() || "")
          .filter(Boolean)
          .slice(0, 20)
    ).catch(() => [])

    if (!options.length) return null

    const decision = await askGroqForFieldAnswer({
      question: label,
      fieldType: "select",
      options,
      applicant: this.applicantProfile,
      job: this.currentJobContext,
    }).catch(() => null)

    if (!decision?.answer || decision.shouldPause || decision.confidence < 65) {
      return null
    }

    const desiredAnswers = Array.from(
      new Set(
        decision.answer
          .split(/[,;\n]/)
          .map((value) => value.trim())
          .filter(Boolean)
      )
    ).slice(0, allowMultiple ? 5 : 1)

    const selected = await this.selectComboboxOption(combobox, [
      ...desiredAnswers,
      ...options.filter((option) =>
        desiredAnswers.some((answer) => option.toLowerCase().includes(answer.toLowerCase()))
      ).slice(0, allowMultiple ? 8 : 3),
    ], allowMultiple)

    if (!selected) return null

    await this.log(`Groq selected option: ${desiredAnswers.join(", ")}`)
    return selected
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
        const text =
          label?.textContent?.replace(/\s+/g, " ").trim() ||
          input.getAttribute("placeholder") ||
          "required field"

        unresolved.add(text)
      }

      return Array.from(unresolved).slice(0, 4)
    })
  }

  private async hasCoverLetterRequirement(): Promise<boolean> {
    if (!this.page) return false

    return this.page.evaluate(() => {
      const modal = document.querySelector(".jobs-easy-apply-modal, [role='dialog']")
      if (!modal) return false

      const text = modal.textContent?.replace(/\s+/g, " ").toLowerCase() || ""
      if (!text.includes("cover letter")) return false

      const textareas = Array.from(modal.querySelectorAll("textarea"))
      if (textareas.length > 0) return true

      const fileInputs = Array.from(modal.querySelectorAll("input[type='file']"))
      const labelText = textareas.length > 0 || fileInputs.length > 1
      return labelText
    })
  }

  private async getFieldPrompt(field: { evaluate: <T>(pageFunction: (element: Element) => T) => Promise<T> }) {
    const prompt = await field.evaluate((el) => {
      const input = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      const id = input.id
      const ownLabel = id ? document.querySelector(`label[for="${id}"]`) : null
      const wrapper =
        input.closest("[data-test-form-element]") ||
        input.closest(".jobs-easy-apply-form-section__grouping") ||
        input.closest(".fb-dash-form-element") ||
        input.closest("fieldset") ||
        input.parentElement

      const parts = [
        ownLabel?.textContent,
        input.getAttribute("aria-label"),
        input.getAttribute("placeholder"),
        input.getAttribute("name"),
        wrapper?.textContent,
      ]

      return parts
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase()
    })

    return normalizeText(prompt).toLowerCase()
  }

  private describeFieldLabel(label: string) {
    if (!label) return "field"

    const simplified = label
      .replace(/\s+/g, " ")
      .split(" ")
      .slice(0, 6)
      .join(" ")
      .trim()

    if (simplified.includes("first name")) return "first name"
    if (simplified.includes("last name") || simplified.includes("family name")) return "last name"
    if (simplified.includes("full name")) return "full name"
    if (simplified.includes("email")) return "email"
    if (simplified.includes("phone") || simplified.includes("mobile")) return "phone"
    if (simplified.includes("source") || simplified.includes("how did you hear")) return "source"
    if (simplified.includes("country") || simplified.includes("nationality") || simplified.includes("citizenship")) return "country"
    if (simplified.includes("citizenship")) return "citizenship"
    if (simplified.includes("laptop") || simplified.includes("pc")) return "laptop"
    if (simplified.includes("worked before") || simplified.includes("worked with our company")) return "worked before"
    if (simplified.includes("city")) return "city"
    if (simplified.includes("salary") || simplified.includes("compensation")) return "salary"
    if (simplified.includes("notice")) return "notice period"
    if (simplified.includes("experience")) return "experience"
    if (simplified.includes("linkedin")) return "linkedin"
    if (simplified.includes("portfolio") || simplified.includes("website")) return "portfolio"

    return simplified || "field"
  }

  private isProfileDrivenQuestion(label: string) {
    const lowered = label.toLowerCase()
    return (
      lowered.includes("how did you hear") ||
      lowered.includes("where did you hear") ||
      lowered.includes("source") ||
      lowered.includes("citizenship") ||
      lowered.includes("what country are you based in") ||
      lowered.includes("country are you based in") ||
      lowered.includes("based in") ||
      lowered.includes("personal laptop") ||
      lowered.includes("laptop / pc") ||
      lowered.includes("worked with our company") ||
      lowered.includes("worked before") ||
      lowered.includes("sanctioned territories") ||
      lowered.includes("russian federation") ||
      lowered.includes("belarus") ||
      lowered.includes("crimea")
    )
  }

  private async fillTextInputWithGroq(
    input: { fill: (value: string) => Promise<void> },
    label: string
  ) {
    if (!USE_GROQ_FOR_COMPLEX_FORMS || !this.applicantProfile) return false

    const decision = await askGroqForFieldAnswer({
      question: label,
      fieldType: "text",
      applicant: this.applicantProfile,
      job: this.currentJobContext,
    }).catch(() => null)

    if (!decision?.answer || decision.shouldPause || decision.confidence < 60) {
      return false
    }

    await input.fill(decision.answer).catch(() => {})
    await this.log(`Groq filled text field: ${decision.answer}`)
    return true
  }

  private async answerRadioGroupWithGroq(group: {
    $$: (selector: string) => Promise<Array<{
      getAttribute: (name: string) => Promise<string | null>
      check: () => Promise<void>
    }>>
    $: (selector: string) => Promise<{ textContent: () => Promise<string | null> } | null>
    textContent: () => Promise<string | null>
  }) {
    if (!USE_GROQ_FOR_COMPLEX_FORMS || !this.applicantProfile) return false

    const question = normalizeText(await group.textContent())
    const radios = await group.$$("input[type='radio']")
    const options: string[] = []

    for (const radio of radios) {
      const radioId = await radio.getAttribute("id")
      if (!radioId) continue
      const labelEl = await group.$(`label[for="${radioId}"]`)
      const text = normalizeText(await labelEl?.textContent())
      if (text) options.push(text)
    }

    const decision = await askGroqForFieldAnswer({
      question,
      fieldType: "radio",
      options,
      applicant: this.applicantProfile,
      job: this.currentJobContext,
    }).catch(() => null)

    if (!decision?.answer || decision.shouldPause || decision.confidence < 65) {
      return false
    }

    for (const radio of radios) {
      const radioId = await radio.getAttribute("id")
      const labelEl = radioId ? await group.$(`label[for="${radioId}"]`) : null
      const labelText = normalizeText(await labelEl?.textContent()).toLowerCase()
      if (labelText.includes(decision.answer.toLowerCase())) {
        await radio.check().catch(() => {})
        await this.log(`Groq answered radio: ${decision.answer}`)
        return true
      }
    }

    return false
  }

  private async answerSelectWithGroq(
    select: { selectOption: (value: string) => Promise<unknown> },
    label: string,
    options: Array<{ value: string; text: string }>
  ) {
    if (!USE_GROQ_FOR_COMPLEX_FORMS || !this.applicantProfile) return false

    const decision = await askGroqForFieldAnswer({
      question: label,
      fieldType: "select",
      options: options.map((option) => option.text),
      applicant: this.applicantProfile,
      job: this.currentJobContext,
    }).catch(() => null)

    if (!decision?.answer || decision.shouldPause || decision.confidence < 65) {
      return false
    }

    const matched = options.find((option) => option.text.includes(decision.answer.toLowerCase()))
    if (!matched?.value) return false

    await select.selectOption(matched.value).catch(() => {})
    await this.log(`Groq selected option: ${decision.answer}`)
    return true
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
    const listEl = await this.page.$(".jobs-search__results-list, .scaffold-layout__list")
    if (!listEl) return

    for (let i = 0; i < 3; i++) {
      await listEl.evaluate((el) => el.scrollBy(0, 600))
      await this.sleep(800)
    }
  }

  private async getJobDetailsFromPage(): Promise<Pick<LinkedInJob, "title" | "company" | "location">> {
    if (!this.page) return { title: "", company: "", location: "" }

    return this.page.evaluate(() => {
      let title = ""
      for (const selector of [
        ".job-details-jobs-unified-top-card__job-title h1",
        ".t-24.job-details-jobs-unified-top-card__job-title",
        ".jobs-unified-top-card__job-title h1",
      ]) {
        const el = document.querySelector(selector)
        const text = (el?.textContent || "").replace(/\s+/g, " ").trim()
        if (text) {
          title = text
          break
        }
      }

      let company = ""
      for (const selector of [
        ".job-details-jobs-unified-top-card__company-name a",
        ".job-details-jobs-unified-top-card__company-name",
        ".jobs-unified-top-card__company-name a",
        ".jobs-unified-top-card__company-name",
      ]) {
        const el = document.querySelector(selector)
        const text = (el?.textContent || "").replace(/\s+/g, " ").trim()
        if (text) {
          company = text
          break
        }
      }

      let location = ""
      for (const selector of [
        ".job-details-jobs-unified-top-card__primary-description-container",
        ".jobs-unified-top-card__subtitle-primary-grouping",
      ]) {
        const el = document.querySelector(selector)
        const text = (el?.textContent || "").replace(/\s+/g, " ").trim()
        if (text) {
          location = text
          break
        }
      }

      return {
        title,
        company,
        location,
      }
    })
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  async close() {
    if (this.browser) {
      await this.browser.close()
      this.browser = null
    }
  }

  async run(email: string, password: string): Promise<ApplyResult[]> {
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
          if (totalApplied >= MAX_APPLIES_PER_RUN) {
            await this.log(`Reached max applications (${MAX_APPLIES_PER_RUN}) for this run`)
            break
          }

          const jobs = await this.searchJobs(title, location)

          for (const job of jobs) {
            if (await this.isStopRequested()) break
            if (!job.isEasyApply) {
              await this.log("Skipping (not Easy Apply from list)", "skipped")
              continue
            }

            if (totalApplied >= MAX_APPLIES_PER_RUN) break

            const result = await this.applyToJob(job)
            this.results.push(result)
            if (this.onResult) {
              await this.onResult(result)
            }

            if (result.status === "applied") totalApplied++

            await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_JOBS))
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


