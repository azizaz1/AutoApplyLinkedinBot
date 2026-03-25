import { chromium, type BrowserContext, type Locator, type Page } from "playwright"
import * as path from "path"
import {
  askGroqForFieldAnswer,
  generateFrenchCoverLetter,
  suggestJobTitlesFromProfile,
  type GroqApplicantProfile,
} from "../lib/groq-apply"

const TANITJOBS_URL = "https://www.tanitjobs.com/"
const TANITJOBS_LOGIN_URL = "https://www.tanitjobs.com/login/"
const DEFAULT_TANITJOBS_TITLES = [
  "Service Client",
  "Centre d'appel",
  "Support Client",
  "Teleconseiller",
  "Customer Support",
  "Back Office",
  "Support Technique",
  "Commercial Sedentaire",
  "Developpeur Full Stack",
  "Software Engineer",
]
const MAX_APPLIES_PER_RUN = 12
const DELAY_BETWEEN_JOBS = 2500
const POST_VERIFICATION_SETTLE_MS = 5000
const POST_NAVIGATION_SETTLE_MS = 2200

export interface TanitJobsJob {
  id: string
  title: string
  company: string
  location: string
  url: string
}

export interface TanitJobsApplyResult {
  jobId: string
  title: string
  company: string
  status: "applied" | "skipped" | "failed" | "already_applied"
  reason?: string
  url?: string
  location?: string
}

type ApplyResultHandler = (result: TanitJobsApplyResult) => Promise<void> | void
type LogHandler = (message: string, type?: string) => Promise<void> | void
type StopHandler = () => boolean | Promise<boolean>

export interface TanitJobsBotProfile extends GroqApplicantProfile {
  phone?: string | null
  linkedinUrl?: string | null
  portfolioUrl?: string | null
  city?: string | null
  country?: string | null
  baseCountry?: string | null
  citizenship?: string | null
  noticePeriod?: string | null
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
  email: string
  phone: string
  city: string
  country: string
  baseCountry: string
  citizenship: string
  yearsExperience: string
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
  return (value || "").replace(/\s+/g, " ").trim()
}

function buildAnswers(email: string, profile?: TanitJobsBotProfile): ApplicationAnswers {
  const fallbackName = normalizeText(profile?.fullName) || normalizeText(process.env.APPLICANT_FULL_NAME) || "Med Aziz Azaiez"
  const parts = fallbackName.split(" ").filter(Boolean)
  const firstName = parts[0] || "Med"
  const lastName = parts.slice(1).join(" ") || "Azaiez"

  return {
    firstName,
    lastName,
    fullName: fallbackName,
    email,
    phone: normalizeText(profile?.phone) || normalizeText(process.env.APPLICANT_PHONE) || "+21600000000",
    city: normalizeText(profile?.city) || normalizeText(process.env.APPLICANT_CITY) || "Tunis",
    country: normalizeText(profile?.country) || normalizeText(process.env.APPLICANT_COUNTRY) || "Tunisia",
    baseCountry: normalizeText(profile?.baseCountry) || normalizeText(process.env.APPLICANT_BASE_COUNTRY) || normalizeText(profile?.country) || "Tunisia",
    citizenship: normalizeText(profile?.citizenship) || normalizeText(process.env.APPLICANT_CITIZENSHIP) || "Tunisian",
    yearsExperience: profile?.yearsExperience ? String(profile.yearsExperience) : normalizeText(process.env.APPLICANT_YEARS_EXPERIENCE) || "4",
    linkedinUrl: normalizeText(profile?.linkedinUrl) || normalizeText(process.env.APPLICANT_LINKEDIN_URL) || "https://linkedin.com/in/medazizazaiez",
    portfolioUrl: normalizeText(profile?.portfolioUrl) || normalizeText(process.env.APPLICANT_PORTFOLIO_URL) || "https://linkedin.com/in/medazizazaiez",
    noticePeriod: normalizeText(profile?.noticePeriod) || normalizeText(process.env.APPLICANT_NOTICE_PERIOD) || "2 weeks",
    salaryExpectation: normalizeText(profile?.salaryExpectation) || normalizeText(process.env.APPLICANT_SALARY_EXPECTATION) || "2000",
    referralSource: normalizeText(profile?.referralSource) || normalizeText(process.env.APPLICANT_REFERRAL_SOURCE) || "TanitJobs",
    workAuthorization: profile?.workAuthorization === "no" ? "no" : "yes",
    sponsorshipRequired: profile?.sponsorshipRequired === "yes" ? "yes" : "no",
    openToRelocation: profile?.openToRelocation === "no" ? "no" : "yes",
    remotePreference: profile?.remotePreference === "no" ? "no" : "yes",
    livesInEurope: profile?.livesInEurope === "yes" ? "yes" : "no",
    openToB2BContract: profile?.openToB2BContract === "no" ? "no" : "yes",
    hasPersonalLaptop: profile?.hasPersonalLaptop === "no" ? "no" : "yes",
    workedBefore: profile?.workedBefore === "yes" ? "yes" : "no",
    inSanctionedTerritories: profile?.inSanctionedTerritories === "yes" ? "yes" : "no",
  }
}

function extractJobId(url: string): string {
  const match = url.match(/(\d+)(?:\/)?$/)
  return match?.[1] || url
}

function fallbackFrenchCoverLetter(profile?: TanitJobsBotProfile, job?: { title: string; company: string }) {
  const fullName = normalizeText(profile?.fullName) || "Med Aziz Azaiez"
  const title = normalizeText(profile?.currentTitle) || "professionnel polyvalent"
  const skills = (profile?.skills || []).slice(0, 6).join(", ")
  return `Bonjour,\n\nJe souhaite vous proposer ma candidature pour le poste de ${job?.title || "votre offre"} chez ${job?.company || "votre entreprise"}. Grace a mon parcours en ${title}${skills ? ` et a mes competences en ${skills}` : ""}, je peux contribuer rapidement a vos besoins avec serieux, adaptabilite et sens du service.\n\nJe suis motive, autonome et a l'aise dans des environnements ou la qualite d'execution et la communication sont importantes. Je serais ravi d'echanger avec vous afin de vous presenter plus en detail mon parcours et ma motivation.\n\nCordialement,\n${fullName}`
}

export class TanitJobsBot {
  private browser: BrowserContext | null = null
  private page: Page | null = null
  private results: TanitJobsApplyResult[] = []
  private applicantProfile?: TanitJobsBotProfile
  private answers: ApplicationAnswers
  private searchTitles: string[] = DEFAULT_TANITJOBS_TITLES
  private searchLocations: string[] = [""]

  constructor(
    private email: string,
    private password: string,
    private cvPath: string,
    profile?: TanitJobsBotProfile,
    private onResult?: ApplyResultHandler,
    private onLog?: LogHandler,
    private shouldStop?: StopHandler
  ) {
    this.applicantProfile = profile
    this.answers = buildAnswers(email, profile)
  }

  private async log(message: string, type = "status") {
    await this.onLog?.(message, type)
  }

  private async isStopRequested() {
    return Boolean(await this.shouldStop?.())
  }

  private async delay(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms))
  }

  private async safeClick(locator: Locator): Promise<boolean> {
    if (await locator.count() === 0) return false
    const target = locator.first()
    try {
      await target.click({ timeout: 4000 })
      return true
    } catch {
      try {
        await target.click({ timeout: 4000, force: true })
        return true
      } catch {
        try {
          await target.evaluate((element) => {
            ;(element as HTMLElement).click()
          })
          return true
        } catch {
          return false
        }
      }
    }
  }

  private async fillFirstAvailable(selectors: string[], value: string): Promise<boolean> {
    if (!this.page || !value) return false

    for (const selector of selectors) {
      const field = this.page.locator(selector).first()
      if (await field.count()) {
        try {
          await field.fill("")
          await field.fill(value)
          return true
        } catch {}
      }
    }

    return false
  }

  private async clickFirstAvailable(selectors: string[]): Promise<boolean> {
    if (!this.page) return false
    for (const selector of selectors) {
      const locator = this.page.locator(selector).first()
      if (await locator.count()) {
        if (await this.safeClick(locator)) return true
      }
    }
    return false
  }

  private async resolveSearchTitles() {
    const candidateTitles = (this.applicantProfile?.desiredTitles || []).map((title) => normalizeText(title)).filter(Boolean)
    try {
      const suggestion = await suggestJobTitlesFromProfile(this.applicantProfile || {})
      if (suggestion?.titles?.length) {
        this.searchTitles = suggestion.titles.slice(0, 8)
        await this.log(`AI selected TanitJobs titles: ${this.searchTitles.join(", ")}`)
        return
      }
    } catch (error) {
      await this.log(`AI title selection failed, using fallback titles: ${error instanceof Error ? error.message : String(error)}`, "skipped")
    }

    this.searchTitles = candidateTitles.length ? candidateTitles.slice(0, 8) : DEFAULT_TANITJOBS_TITLES
    await this.log(`Using fallback TanitJobs titles: ${this.searchTitles.join(", ")}`)
  }

  private async resolveSearchLocations() {
    const desired = normalizeText(this.applicantProfile?.desiredLocation)
    if (!desired || desired.toLowerCase() === "worldwide") {
      this.searchLocations = [""]
    } else if (this.applicantProfile?.remoteOnly || desired.toLowerCase() === "remote") {
      this.searchLocations = ["Remote"]
    } else {
      this.searchLocations = [desired]
    }

    await this.log(`TanitJobs search locations: ${this.searchLocations.filter(Boolean).join(", ") || "all Tunisia"}`)
  }

  private async isVerificationRequired() {
    if (!this.page) return false

    const url = this.page.url().toLowerCase()
    if (url.includes("captcha") || url.includes("challenge")) return true

    const bodyText = normalizeText(await this.page.locator("body").textContent().catch(() => "")).toLowerCase()
    return (
      bodyText.includes("verification de securite en cours") ||
      bodyText.includes("verifying you are human") ||
      bodyText.includes("service de securite") ||
      bodyText.includes("je ne suis pas un robot") ||
      bodyText.includes("i'm human") ||
      bodyText.includes("i am human")
    )
  }

  private async waitForVerificationResolution() {
    if (!this.page) return
    await this.log("TanitJobs verification required. Complete it manually in the open browser.", "status")

    const timeoutAt = Date.now() + 10 * 60 * 1000
    while (Date.now() < timeoutAt) {
      if (await this.isStopRequested()) {
        throw new Error("TanitJobs run stopped while waiting for verification")
      }

      const stillBlocked = await this.isVerificationRequired()
      if (!stillBlocked) {
        await this.page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {})
        await this.delay(POST_VERIFICATION_SETTLE_MS)
        await this.log("TanitJobs verification completed. Resuming bot.", "status")
        return
      }

      await this.delay(1500)
    }

    throw new Error("Timed out waiting for TanitJobs verification to be completed")
  }

  private async ensureVerificationCleared() {
    if (await this.isVerificationRequired()) {
      await this.waitForVerificationResolution()
    }
  }

  private async hasLoginForm() {
    if (!this.page) return false

    const emailField = this.page.locator(
      "input[type='email'], input[name*='email' i], input[name*='login' i], input[id*='email' i], input[id*='login' i]"
    ).first()
    const passwordField = this.page.locator(
      "input[type='password'], input[name*='password' i], input[id*='password' i]"
    ).first()

    return (await emailField.count()) > 0 && (await passwordField.count()) > 0
  }

  private async goToLoginPage() {
    if (!this.page) return

    await this.page.goto(TANITJOBS_URL, { waitUntil: "domcontentloaded", timeout: 60000 })
    await this.page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {})
    await this.ensureVerificationCleared()
    await this.delay(POST_NAVIGATION_SETTLE_MS)

    if (await this.hasLoginForm()) return

    await this.clickFirstAvailable([
      "a[href='/login/']",
      "a[href*='/login']",
      "a[href*='login']",
      "a[href*='connexion']",
      "a:has-text('Connexion')",
      "a:has-text('Se connecter')",
      "button:has-text('Connexion')",
      "button:has-text('Se connecter')",
    ])

    await this.page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {})
    await this.ensureVerificationCleared()
    await this.delay(POST_NAVIGATION_SETTLE_MS)

    if (await this.hasLoginForm()) return

    await this.log("TanitJobs login link did not expose the form yet. Trying the direct login page once.", "status")
    await this.page.goto(TANITJOBS_LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 60000 })
    await this.page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {})
    await this.ensureVerificationCleared()
    await this.delay(POST_NAVIGATION_SETTLE_MS)
  }

  private async isLoggedIn() {
    if (!this.page) return false
    const url = this.page.url().toLowerCase()
    const bodyText = normalizeText(await this.page.locator("body").textContent().catch(() => "")).toLowerCase()

    const logoutLike = this.page.locator(
      "a[href*='logout'], a[href*='deconnexion'], .logout, a:has-text('Déconnexion'), a:has-text('Logout')"
    ).first()
    if ((await logoutLike.count()) > 0) return true
    if (
      url.includes("/dashboard") ||
      url.includes("/profile") ||
      url.includes("/compte") ||
      url.includes("/mon-espace") ||
      url.includes("/candidate")
    ) {
      return true
    }

    if (await this.hasLoginForm()) return false
    if (bodyText.includes("connexion") && bodyText.includes("mot de passe")) return false

    return false
  }

  private async waitForManualLoginResolution() {
    if (!this.page) return

    await this.log("Complete TanitJobs login manually in the open browser, then the bot will continue.", "status")
    const timeoutAt = Date.now() + 10 * 60 * 1000

    while (Date.now() < timeoutAt) {
      if (await this.isStopRequested()) {
        throw new Error("TanitJobs run stopped while waiting for manual login")
      }

      await this.ensureVerificationCleared()
      if (await this.isLoggedIn()) {
        await this.page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {})
        await this.delay(POST_NAVIGATION_SETTLE_MS)
        await this.log("TanitJobs manual login completed. Resuming bot.", "status")
        return
      }

      await this.delay(1500)
    }

    throw new Error("Timed out waiting for TanitJobs manual login")
  }

  private async login() {
    if (!this.page) throw new Error("Browser page not initialized")

    await this.goToLoginPage()

    if (await this.isLoggedIn()) {
      await this.log("Already logged into TanitJobs")
      return
    }

    if (!(await this.hasLoginForm())) {
      await this.waitForManualLoginResolution()
      return
    }

    const emailFilled = await this.fillFirstAvailable(
      [
        "input[type='email']",
        "input[name*='email' i]",
        "input[name*='login' i]",
        "input[id*='email' i]",
        "input[id*='login' i]",
      ],
      this.email
    )

    const passwordFilled = await this.fillFirstAvailable(
      [
        "input[type='password']",
        "input[name*='password' i]",
        "input[id*='password' i]",
      ],
      this.password
    )

    if (emailFilled && passwordFilled) {
      const submitted = await this.clickFirstAvailable([
        "button[type='submit']",
        "input[type='submit']",
        "button:has-text('Se connecter')",
        "button:has-text('Connexion')",
        "button:has-text('Login')",
        "a:has-text('Se connecter')",
      ])

      if (submitted) {
        await this.page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {})
        await this.delay(POST_NAVIGATION_SETTLE_MS)
        await this.ensureVerificationCleared()
      }
    }

    if (!(await this.isLoggedIn()) && !(await this.hasLoginForm())) {
      await this.goToLoginPage()
    }

    if (!(await this.isLoggedIn())) {
      await this.waitForManualLoginResolution()
      return
    }

    await this.log("Logged into TanitJobs")
  }

  private async submitSearch(title: string, location: string) {
    if (!this.page) throw new Error("Browser page not initialized")

    await this.page.goto(TANITJOBS_URL, { waitUntil: "domcontentloaded", timeout: 60000 })
    await this.page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {})
    await this.ensureVerificationCleared()
    await this.delay(POST_NAVIGATION_SETTLE_MS)

    const keywordFilled = await this.fillFirstAvailable(
      [
        "input[name*='search' i]",
        "input[name*='keyword' i]",
        "input[name*='query' i]",
        "input[name='q']",
        "input[type='search']",
        "form input[type='text']",
      ],
      title
    )

    if (!keywordFilled) {
      throw new Error("Could not find the TanitJobs search input")
    }

    if (location) {
      await this.fillFirstAvailable(
        [
          "input[name*='location' i]",
          "input[name*='city' i]",
          "input[name*='lieu' i]",
          "input[placeholder*='ville' i]",
          "input[placeholder*='location' i]",
        ],
        location
      )
    }

    const searched = await this.clickFirstAvailable([
      "button[type='submit']",
      "input[type='submit']",
      "button:has-text('Rechercher')",
      "button:has-text('Chercher')",
      "button:has-text('Search')",
      "a:has-text('Rechercher')",
    ])

    if (!searched) {
      await this.page.keyboard.press("Enter").catch(() => {})
    }

    await this.page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {})
    await this.delay(POST_NAVIGATION_SETTLE_MS)
    await this.ensureVerificationCleared()
  }

  private async extractJobsFromResults(): Promise<TanitJobsJob[]> {
    if (!this.page) return []

    const currentUrl = this.page.url()
    const jobs = await this.page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll("a[href]"))
      return anchors
        .map((anchor) => {
          const href = (anchor as HTMLAnchorElement).href || ""
          const title = (anchor.textContent || "").replace(/\s+/g, " ").trim()
          const card = anchor.closest("article, .job-item, .offer-item, .listing-item, .media, li, .card, .result-item")
          const context = (card?.textContent || "").replace(/\s+/g, " ").trim()
          return { href, title, context }
        })
        .filter((item) => {
          const href = item.href.toLowerCase()
          if (!href.includes("tanitjobs.com")) return false
          if (href.includes("/login") || href.includes("/register") || href.includes("/candidat")) return false
          if (!(href.includes("/job") || href.includes("/emploi") || href.includes("/offre") || href.includes("/detail"))) return false
          return item.title.length > 3 || item.context.length > 20
        })
    })

    const seen = new Set<string>()
    const mapped: TanitJobsJob[] = []

    for (const item of jobs) {
      const href = normalizeText(item.href)
      if (!href || seen.has(href)) continue
      seen.add(href)
      mapped.push({
        id: extractJobId(href),
        title: normalizeText(item.title) || "TanitJobs opportunity",
        company: "",
        location: "",
        url: href.startsWith("http") ? href : currentUrl,
      })
      if (mapped.length >= 25) break
    }

    return mapped
  }

  private async searchJobs(title: string, location: string): Promise<TanitJobsJob[]> {
    await this.log(`Searching TanitJobs: "${title}"${location ? ` in "${location}"` : ""}`)
    await this.submitSearch(title, location)
    const jobs = await this.extractJobsFromResults()
    await this.log(`Found ${jobs.length} TanitJobs jobs for "${title}"`)
    return jobs
  }

  private async getJobDetailsFromPage() {
    if (!this.page) return { title: "", company: "", location: "", description: "" }

    const title = normalizeText(
      (await this.page.locator("h1, .job-title, .offer-title, .title").first().textContent().catch(() => "")) ||
      (await this.page.title().catch(() => ""))
    )

    const company = normalizeText(
      (await this.page.locator(".company, .company-name, .recruiter, [class*='company']").first().textContent().catch(() => "")) ||
      (await this.page.locator("a[href*='company'], a[href*='entreprise']").first().textContent().catch(() => ""))
    )

    const location = normalizeText(
      (await this.page.locator(".location, .city, [class*='location'], [class*='ville']").first().textContent().catch(() => ""))
    )

    const description = normalizeText(
      (await this.page.locator(".job-description, .description, #job-description, .offer-description, .content").first().textContent().catch(() => ""))
    )

    return { title, company, location, description }
  }

  private async getFieldLabel(field: Locator): Promise<string> {
    try {
      const label = await field.evaluate((element) => {
        const el = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        const attrText = [
          el.getAttribute("aria-label"),
          el.getAttribute("placeholder"),
          el.getAttribute("name"),
        ]
          .filter(Boolean)
          .join(" ")
        const id = el.id
        let labelText = ""
        if (id) {
          const linked = document.querySelector(`label[for="${id}"]`)
          if (linked?.textContent) labelText += ` ${linked.textContent}`
        }
        const parentLabel = el.closest("label")
        if (parentLabel?.textContent) labelText += ` ${parentLabel.textContent}`
        const fieldset = el.closest("fieldset")
        if (fieldset?.querySelector("legend")?.textContent) {
          labelText += ` ${fieldset.querySelector("legend")?.textContent}`
        }
        const wrapper = el.closest(".form-group, .field, .input-group, .form-row, .control-group, .row")
        if (wrapper?.textContent) labelText += ` ${wrapper.textContent}`
        return `${labelText} ${attrText}`.replace(/\s+/g, " ").trim()
      })
      return normalizeText(label)
    } catch {
      return ""
    }
  }

  private getRuleAnswer(question: string): string | null {
    const q = question.toLowerCase()
    if (!q) return null

    if (q.includes("first name") || q.includes("prenom")) return this.answers.firstName
    if (q.includes("last name") || q.includes("nom")) return this.answers.lastName
    if (q.includes("full name") || q.includes("nom complet")) return this.answers.fullName
    if (q.includes("email") || q.includes("e-mail") || q.includes("adresse mail")) return this.answers.email
    if (q.includes("phone") || q.includes("mobile") || q.includes("telephone")) return this.answers.phone
    if (q.includes("city") || q.includes("ville") || q.includes("location")) return this.answers.city
    if (q.includes("country") || q.includes("pays")) return this.answers.country
    if (q.includes("citizenship") || q.includes("nationalit")) return this.answers.citizenship
    if (q.includes("linkedin")) return this.answers.linkedinUrl
    if (q.includes("portfolio") || q.includes("site web") || q.includes("website")) return this.answers.portfolioUrl
    if (q.includes("salary") || q.includes("salaire") || q.includes("remuneration")) return this.answers.salaryExpectation
    if (q.includes("notice") || q.includes("preavis")) return this.answers.noticePeriod
    if (q.includes("experience") || q.includes("exp")) return this.answers.yearsExperience
    if (q.includes("how did you hear") || q.includes("source") || q.includes("connu")) return this.answers.referralSource
    if (q.includes("authorization") || q.includes("autorisation")) return this.answers.workAuthorization
    if (q.includes("sponsorship") || q.includes("visa")) return this.answers.sponsorshipRequired
    if (q.includes("relocation") || q.includes("mobilit")) return this.answers.openToRelocation
    if (q.includes("remote")) return this.answers.remotePreference
    if (q.includes("laptop") || q.includes("ordinateur")) return this.answers.hasPersonalLaptop
    if (q.includes("worked with") || q.includes("deja travaille")) return this.answers.workedBefore
    if (q.includes("sanction")) return this.answers.inSanctionedTerritories

    return null
  }

  private async askAi(question: string, fieldType: "text" | "select" | "radio" | "checkbox", options: string[], job: { title: string; company: string; location: string }) {
    try {
      const decision = await askGroqForFieldAnswer({
        question,
        fieldType,
        options,
        applicant: this.applicantProfile || {},
        job,
      })

      if (decision?.answer && !decision.shouldPause && decision.confidence >= 50) {
        return decision.answer
      }
    } catch {}

    return null
  }

  private async uploadCvIfNeeded(formRoot: Locator) {
    const fileInputs = formRoot.locator("input[type='file']")
    const count = await fileInputs.count()
    if (!count) return false

    for (let i = 0; i < count; i++) {
      const input = fileInputs.nth(i)
      const label = (await this.getFieldLabel(input)).toLowerCase()
      const looksLikeCv =
        !label ||
        label.includes("cv") ||
        label.includes("resume") ||
        label.includes("curriculum") ||
        label.includes("piece jointe") ||
        label.includes("fichier")

      if (!looksLikeCv) continue

      const currentValue = await input.evaluate((element) => (element as HTMLInputElement).value || "").catch(() => "")
      if (currentValue) {
        await this.log("TanitJobs CV already attached")
        return true
      }

      await input.setInputFiles(this.cvPath)
      await this.log("TanitJobs CV uploaded")
      await this.delay(1200)
      return true
    }

    return false
  }

  private async fillTextInputs(formRoot: Locator, job: { title: string; company: string; location: string }) {
    const fields = formRoot.locator("input:not([type='hidden']):not([type='file']):not([type='radio']):not([type='checkbox']):not([type='submit']):not([type='button']), textarea")
    const count = await fields.count()

    for (let i = 0; i < count; i++) {
      const field = fields.nth(i)
      const disabled = await field.isDisabled().catch(() => false)
      if (disabled) continue

      const currentValue = normalizeText(await field.inputValue().catch(() => ""))
      if (currentValue) continue

      const label = await this.getFieldLabel(field)
      if (!label) continue

      const lower = label.toLowerCase()
      let answer = this.getRuleAnswer(lower)

      if (!answer && (await field.evaluate((element) => element.tagName.toLowerCase() === "textarea"))) {
        if (lower.includes("cover") || lower.includes("motivation") || lower.includes("message") || lower.includes("presentation")) {
          answer =
            (await generateFrenchCoverLetter({
              applicant: this.applicantProfile || {},
              job,
            }).catch(() => null)) || fallbackFrenchCoverLetter(this.applicantProfile, job)
          await this.log("Generated French cover letter for TanitJobs")
        }
      }

      if (!answer) {
        answer = await this.askAi(label, "text", [], job)
      }

      if (!answer) continue

      await field.fill(answer)
      await this.log(`Filled TanitJobs field: ${label.slice(0, 60)}`)
      await this.delay(200)
    }
  }

  private async fillSelects(formRoot: Locator, job: { title: string; company: string; location: string }) {
    const selects = formRoot.locator("select")
    const count = await selects.count()

    for (let i = 0; i < count; i++) {
      const select = selects.nth(i)
      const label = await this.getFieldLabel(select)
      const options = await select.locator("option").evaluateAll((nodes) =>
        nodes.map((node) => ((node.textContent || "").replace(/\s+/g, " ").trim())).filter(Boolean)
      )
      const current = normalizeText(await select.inputValue().catch(() => ""))
      if (current && current !== "0" && current !== "") continue

      const lower = label.toLowerCase()
      let answer = this.getRuleAnswer(lower)
      if (!answer) {
        answer = await this.askAi(label, "select", options, job)
      }
      if (!answer) continue

      const desired = answer.toLowerCase()
      let matchedValue = ""

      const optionLocators = select.locator("option")
      const optionCount = await optionLocators.count()
      for (let j = 0; j < optionCount; j++) {
        const option = optionLocators.nth(j)
        const text = normalizeText(await option.textContent().catch(() => ""))
        const value = normalizeText(await option.getAttribute("value"))
        if (!text) continue
        if (text.toLowerCase() === desired || text.toLowerCase().includes(desired) || desired.includes(text.toLowerCase())) {
          matchedValue = value || text
          break
        }
      }

      if (!matchedValue) continue

      await select.selectOption({ value: matchedValue }).catch(async () => {
        await select.selectOption({ label: matchedValue })
      })
      await this.log(`Selected TanitJobs option: ${answer}`)
      await this.delay(200)
    }
  }

  private async fillRadioGroups(formRoot: Locator, job: { title: string; company: string; location: string }) {
    const radios = formRoot.locator("input[type='radio']")
    const count = await radios.count()
    const handled = new Set<string>()

    for (let i = 0; i < count; i++) {
      const radio = radios.nth(i)
      const name = normalizeText(await radio.getAttribute("name"))
      if (!name || handled.has(name)) continue
      handled.add(name)

      const group = formRoot.locator(`input[type='radio'][name="${name}"]`)
      const label = await this.getFieldLabel(group.first())
      const options: string[] = []
      const optionCount = await group.count()
      for (let j = 0; j < optionCount; j++) {
        const optionLabel = await this.getFieldLabel(group.nth(j))
        if (optionLabel) options.push(optionLabel)
      }

      let answer = this.getRuleAnswer(label.toLowerCase())
      if (!answer) {
        answer = await this.askAi(label, "radio", options, job)
      }
      if (!answer) continue

      const desired = answer.toLowerCase()
      for (let j = 0; j < optionCount; j++) {
        const option = group.nth(j)
        const optionLabel = (await this.getFieldLabel(option)).toLowerCase()
        if (optionLabel.includes(desired) || desired.includes(optionLabel)) {
          await this.safeClick(option)
          await this.log(`Selected TanitJobs radio: ${answer}`)
          await this.delay(150)
          break
        }
      }
    }
  }

  private async fillCheckboxes(formRoot: Locator, job: { title: string; company: string; location: string }) {
    const checkboxes = formRoot.locator("input[type='checkbox']")
    const count = await checkboxes.count()

    for (let i = 0; i < count; i++) {
      const checkbox = checkboxes.nth(i)
      const checked = await checkbox.isChecked().catch(() => false)
      if (checked) continue

      const label = await this.getFieldLabel(checkbox)
      const lower = label.toLowerCase()

      if (lower.includes("terms") || lower.includes("conditions") || lower.includes("privacy") || lower.includes("rgpd")) {
        await this.safeClick(checkbox)
        await this.log("Accepted TanitJobs consent checkbox")
        continue
      }

      const answer = this.getRuleAnswer(lower) || (await this.askAi(label, "checkbox", ["yes", "no"], job))
      if (answer?.toLowerCase() === "yes") {
        await this.safeClick(checkbox)
        await this.log(`Checked TanitJobs field: ${label.slice(0, 60)}`)
      }
    }
  }

  private async findActionButton(formRoot: Locator, labels: string[]) {
    const buttonSelectors = [
      "button",
      "input[type='submit']",
      "input[type='button']",
      "a",
      "[role='button']",
    ]

    for (const base of buttonSelectors) {
      const buttons = formRoot.locator(base)
      const count = await buttons.count()
      for (let i = 0; i < count; i++) {
        const button = buttons.nth(i)
        const text = normalizeText(
          [
            await button.textContent().catch(() => ""),
            await button.getAttribute("value").catch(() => ""),
            await button.getAttribute("aria-label").catch(() => ""),
            await button.getAttribute("title").catch(() => ""),
          ].join(" ")
        ).toLowerCase()
        if (!text) continue
        if (labels.some((label) => text.includes(label))) {
          return button
        }
      }
    }

    return null
  }

  private async dismissSuccessPopup() {
    if (!this.page) return
    await this.clickFirstAvailable([
      "button:has-text('OK')",
      "button:has-text('Fermer')",
      "button:has-text('Close')",
    ])
  }

  private async applyToJob(job: TanitJobsJob): Promise<TanitJobsApplyResult> {
    if (!this.page) throw new Error("Browser page not initialized")
    const page: Page = this.page

    await page.goto(job.url, { waitUntil: "domcontentloaded", timeout: 60000 })
    await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {})
    await this.ensureVerificationCleared()
    const details = await this.getJobDetailsFromPage()
    const resolvedJob = {
      ...job,
      title: details.title || job.title,
      company: details.company || job.company,
      location: details.location || job.location,
    }

    await this.log(`Applying to TanitJobs: ${resolvedJob.title} at ${resolvedJob.company || "Unknown company"}`)

    const alreadyAppliedText = normalizeText(await page.locator("body").textContent().catch(() => "")).toLowerCase()
    if (alreadyAppliedText.includes("deja postule") || alreadyAppliedText.includes("already applied")) {
      return {
        jobId: resolvedJob.id,
        title: resolvedJob.title,
        company: resolvedJob.company,
        location: resolvedJob.location,
        url: resolvedJob.url,
        status: "already_applied",
      }
    }

    const applyClicked = await this.clickFirstAvailable([
      "button:has-text('Postuler')",
      "button:has-text('Candidater')",
      "button:has-text('Apply')",
      "a:has-text('Postuler')",
      "a:has-text('Candidater')",
      "a:has-text('Apply')",
      "input[type='submit'][value*='Postul']",
    ])

    if (!applyClicked) {
      return {
        jobId: resolvedJob.id,
        title: resolvedJob.title,
        company: resolvedJob.company,
        location: resolvedJob.location,
        url: resolvedJob.url,
        status: "skipped",
        reason: "No TanitJobs apply button",
      }
    }

    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {})
    await this.delay(1500)
    await this.ensureVerificationCleared()

    const formRoot = page.locator("form").first()
    if (!(await formRoot.count())) {
      const bodyText = normalizeText(await page.locator("body").textContent().catch(() => "")).toLowerCase()
      if (bodyText.includes("merci") || bodyText.includes("candidature") || bodyText.includes("success")) {
        await this.dismissSuccessPopup()
        return {
          jobId: resolvedJob.id,
          title: resolvedJob.title,
          company: resolvedJob.company,
          location: resolvedJob.location,
          url: resolvedJob.url,
          status: "applied",
        }
      }
    }

    await this.uploadCvIfNeeded(formRoot)
    await this.fillTextInputs(formRoot, resolvedJob)
    await this.fillSelects(formRoot, resolvedJob)
    await this.fillRadioGroups(formRoot, resolvedJob)
    await this.fillCheckboxes(formRoot, resolvedJob)

    const submitButton =
      (await this.findActionButton(formRoot, ["envoyer", "postuler", "candidater", "valider", "soumettre", "submit"])) ||
      page.locator("button[type='submit'], input[type='submit']").first()

    if (!(await submitButton.count())) {
      return {
        jobId: resolvedJob.id,
        title: resolvedJob.title,
        company: resolvedJob.company,
        location: resolvedJob.location,
        url: resolvedJob.url,
        status: "failed",
        reason: "No submit button on TanitJobs form",
      }
    }

    await this.log("Submitting TanitJobs application")
    const clicked = await this.safeClick(submitButton)
    if (!clicked) {
      return {
        jobId: resolvedJob.id,
        title: resolvedJob.title,
        company: resolvedJob.company,
        location: resolvedJob.location,
        url: resolvedJob.url,
        status: "failed",
        reason: "Could not click TanitJobs submit button",
      }
    }

    await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {})
    await this.delay(1600)
    await this.ensureVerificationCleared()

    const bodyText = normalizeText(await page.locator("body").textContent().catch(() => "")).toLowerCase()
    const success =
      bodyText.includes("merci") ||
      bodyText.includes("candidature envoy") ||
      bodyText.includes("application sent") ||
      bodyText.includes("postulation envoy")

    if (!success) {
      const errors = normalizeText(
        await this.page.locator(".error, .invalid-feedback, .alert-danger, .help-block").allTextContents().then((values) => values.join(" ")).catch(() => "")
      )
      return {
        jobId: resolvedJob.id,
        title: resolvedJob.title,
        company: resolvedJob.company,
        location: resolvedJob.location,
        url: resolvedJob.url,
        status: "failed",
        reason: errors || "TanitJobs application may not have been submitted",
      }
    }

    await this.dismissSuccessPopup()

    return {
      jobId: resolvedJob.id,
      title: resolvedJob.title,
      company: resolvedJob.company,
      location: resolvedJob.location,
      url: resolvedJob.url,
      status: "applied",
    }
  }

  async run() {
    const userDataDir = path.join(process.cwd(), ".playwright", "tanitjobs-profile")
    this.browser = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      slowMo: 220,
      viewport: { width: 1440, height: 960 },
      channel: "chrome",
    })
    const existingPage = this.browser.pages()[0]
    this.page = existingPage || (await this.browser.newPage())

    try {
      await this.resolveSearchTitles()
      await this.resolveSearchLocations()
      await this.login()

      let appliedCount = 0
      const seen = new Set<string>()

      for (const location of this.searchLocations) {
        for (const title of this.searchTitles) {
          if (await this.isStopRequested()) {
            await this.log("TanitJobs stop requested. Finishing run...", "done")
            return this.results
          }

          const jobs = await this.searchJobs(title, location)

          for (const job of jobs) {
            if (seen.has(job.url)) continue
            seen.add(job.url)

            if (await this.isStopRequested()) {
              await this.log("TanitJobs stop requested. Finishing run...", "done")
              return this.results
            }

            const result = await this.applyToJob(job)
            this.results.push(result)
            await this.onResult?.(result)

            if (result.status === "applied") {
              appliedCount++
              await this.log(`TanitJobs applied successfully: ${result.title}`, "applied")
            } else if (result.status === "already_applied") {
              await this.log(`Already applied on TanitJobs: ${result.title}`, "skipped")
            } else {
              await this.log(`Skipped TanitJobs job: ${result.title}${result.reason ? ` (${result.reason})` : ""}`, result.status === "failed" ? "error" : "skipped")
            }

            if (appliedCount >= MAX_APPLIES_PER_RUN) {
              await this.log(`Reached TanitJobs apply cap of ${MAX_APPLIES_PER_RUN}`, "done")
              return this.results
            }

            await this.delay(DELAY_BETWEEN_JOBS)
          }
        }
      }

      return this.results
    } finally {
      await this.browser?.close().catch(() => {})
      this.browser = null
      this.page = null
    }
  }
}
