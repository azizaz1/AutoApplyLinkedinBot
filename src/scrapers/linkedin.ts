/**
 * LinkedIn Easy Apply Bot — rewritten from scratch
 *
 * Strategy:
 * 1. Login via credentials (with saved session reuse)
 * 2. Search jobs using LinkedIn's Easy Apply filter (f_AL=true)
 * 3. For each job: navigate to the job page, click Easy Apply, fill the form
 * 4. Form filling: text/select/radio/file — guided by field labels + Groq fallback
 */

import { chromium, type Browser, type Page, type Locator } from "playwright"
import * as path from "node:path"
import * as fs from "node:fs"
import {
  askGroqForFieldAnswer,
  generateFrenchCoverLetter,
  suggestJobTitlesFromProfile,
  type GroqApplicantProfile,
} from "../lib/groq-apply"

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_APPLIES_PER_RUN = 15
const STEP_DELAY = 1200
const BETWEEN_JOBS_DELAY = 2500

const DEFAULT_JOB_TITLES = [
  "Customer Service Representative",
  "Call Center Agent",
  "Teleconseiller Francophone",
  "Support Client",
  "Agent Service Client",
  "Technical Support Agent",
  "Back Office Agent",
  "Chat Support Agent",
]

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

export interface LinkedInBotProfile extends GroqApplicantProfile {
  phone?: string | null
  linkedinUrl?: string | null
  portfolioUrl?: string | null
  city?: string | null
  country?: string | null
  noticePeriod?: string | null
  salaryExpectation?: string | null
  minSalary?: number | null
  workAuthorization?: string | null
  sponsorshipRequired?: string | null
  openToRelocation?: string | null
  remotePreference?: string | null
  baseCountry?: string | null
  citizenship?: string | null
  referralSource?: string | null
  livesInEurope?: string | null
  openToB2BContract?: string | null
  hasPersonalLaptop?: string | null
  workedBefore?: string | null
  inSanctionedTerritories?: string | null
}

type ApplyResultHandler = (result: ApplyResult) => Promise<void> | void
type LogHandler = (message: string, type?: string) => Promise<void> | void
type StopHandler = () => boolean | Promise<boolean>

// ─── Applicant answers (flat, easy to look up) ───────────────────────────────

interface Answers {
  firstName: string
  lastName: string
  fullName: string
  email: string
  phone: string
  city: string
  country: string
  citizenship: string
  linkedinUrl: string
  portfolioUrl: string
  yearsExperience: string
  noticePeriod: string
  salary: string
  referralSource: string
  workAuth: "yes" | "no"
  needsSponsorship: "yes" | "no"
  openToRelocation: "yes" | "no"
  remoteOk: "yes" | "no"
  livesInEurope: "yes" | "no"
  hasLaptop: "yes" | "no"
  workedBefore: "yes" | "no"
}

function buildAnswers(email: string, profile?: LinkedInBotProfile): Answers {
  const fullName = (profile?.fullName || "").replace(/\s+/g, " ").trim()
  const parts = fullName.split(" ").filter(Boolean)
  return {
    firstName: parts[0] || "Med",
    lastName: parts.slice(1).join(" ") || "Aziz",
    fullName: fullName || "Med Aziz",
    email,
    phone: profile?.phone || "+21600000000",
    city: profile?.city || profile?.desiredLocation || "Tunis",
    country: profile?.country || profile?.baseCountry || "Tunisia",
    citizenship: profile?.citizenship || profile?.country || "Tunisian",
    linkedinUrl: profile?.linkedinUrl || "",
    portfolioUrl: profile?.portfolioUrl || profile?.linkedinUrl || "",
    yearsExperience: profile?.yearsExperience ? String(profile.yearsExperience) : "3",
    noticePeriod: profile?.noticePeriod || "2 weeks",
    salary: profile?.salaryExpectation || (profile?.minSalary ? String(profile.minSalary) : "2000"),
    referralSource: profile?.referralSource || "LinkedIn",
    workAuth: profile?.workAuthorization === "no" ? "no" : "yes",
    needsSponsorship: profile?.sponsorshipRequired === "yes" ? "yes" : "no",
    openToRelocation: profile?.openToRelocation === "no" ? "no" : "yes",
    remoteOk: profile?.remotePreference === "no" ? "no" : "yes",
    livesInEurope: profile?.livesInEurope === "yes" ? "yes" : "no",
    hasLaptop: profile?.hasPersonalLaptop === "no" ? "no" : "yes",
    workedBefore: profile?.workedBefore === "yes" ? "yes" : "no",
  }
}

// ─── Bot ──────────────────────────────────────────────────────────────────────

export class LinkedInBot {
  private browser: Browser | null = null
  private page: Page | null = null
  private answers: Answers
  private profile?: LinkedInBotProfile
  private storageStatePath = path.resolve(process.cwd(), ".playwright", "linkedin-session.json")
  private jobContext = { title: "", company: "", location: "" }
  private results: ApplyResult[] = []

  constructor(
    private email: string,
    private password: string,
    private cvPath: string,
    profile?: LinkedInBotProfile,
    private onResult?: ApplyResultHandler,
    private onLog?: LogHandler,
    private shouldStop?: StopHandler,
  ) {
    this.profile = profile
    this.answers = buildAnswers(email, profile)
  }

  // ── Utilities ───────────────────────────────────────────────────────────────

  private async log(msg: string, type = "status") {
    console.log(`[linkedin] ${msg}`)
    await this.onLog?.(msg, type)
  }

  private sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)) }

  private async stopped() { return this.shouldStop ? Boolean(await this.shouldStop()) : false }

  /** Move mouse naturally to an element then click it */
  private async humanClick(locator: Locator) {
    if (!this.page) return
    try {
      const box = await locator.boundingBox()
      if (!box) { await locator.click({ force: true }).catch(() => {}); return }

      // Current mouse position (start near center of viewport if unknown)
      const vp = this.page.viewportSize() ?? { width: 1280, height: 720 }
      const startX = vp.width / 2 + (Math.random() - 0.5) * 200
      const startY = vp.height / 2 + (Math.random() - 0.5) * 200

      // Target: random point inside the element
      const targetX = box.x + box.width * (0.3 + Math.random() * 0.4)
      const targetY = box.y + box.height * (0.3 + Math.random() * 0.4)

      // Move in small steps with slight curve
      const steps = 8 + Math.floor(Math.random() * 6)
      for (let i = 1; i <= steps; i++) {
        const t = i / steps
        // Bezier-like curve: add slight arc
        const arc = Math.sin(Math.PI * t) * (20 + Math.random() * 30)
        const x = startX + (targetX - startX) * t + arc * (Math.random() - 0.5)
        const y = startY + (targetY - startY) * t + arc * (Math.random() - 0.5)
        await this.page.mouse.move(x, y)
        await this.sleep(15 + Math.random() * 25)
      }
      await this.page.mouse.move(targetX, targetY)
      await this.sleep(80 + Math.random() * 120)
      await this.page.mouse.click(targetX, targetY)
    } catch {
      await locator.click({ force: true }).catch(() => {})
    }
  }

  // ── Browser ─────────────────────────────────────────────────────────────────

  private async launch() {
    await this.log("Launching browser...")
    const hasSaved = fs.existsSync(this.storageStatePath)
    this.browser = await chromium.launch({
      headless: false,
      slowMo: 60,
      args: ["--start-maximized", "--disable-blink-features=AutomationControlled"],
    })
    const ctx = await this.browser.newContext({
      viewport: null,
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      storageState: hasSaved ? this.storageStatePath : undefined,
    })
    this.page = await ctx.newPage()
    await this.log("Browser ready")
  }

  private async saveSession() {
    if (!this.page) return
    try {
      fs.mkdirSync(path.dirname(this.storageStatePath), { recursive: true })
      await this.page.context().storageState({ path: this.storageStatePath })
    } catch {}
  }

  private async close() {
    await this.browser?.close()
    this.browser = null
  }

  // ── Login ───────────────────────────────────────────────────────────────────

  private async isLoggedIn(): Promise<boolean> {
    if (!this.page) return false
    const url = this.page.url()
    // If we're on login/verification pages, definitely not logged in
    if (url.includes("/login") || this.isVerificationUrl(url)) return false
    // If we're on LinkedIn content pages, we're logged in
    if (url.includes("linkedin.com/feed") || url.includes("linkedin.com/jobs") || url.includes("linkedin.com/in/") || url.includes("linkedin.com/mynetwork")) return true
    // Otherwise check for nav element
    return this.page.evaluate(() =>
      Boolean(document.querySelector(".global-nav__me, nav.global-nav, [data-test-global-nav], header.global-nav, .scaffold-layout-container"))
    ).catch(() => false)
  }

  private async waitForCaptcha(): Promise<boolean> {
    await this.log("LinkedIn security check detected — please solve it in the browser.", "error")
    for (let i = 0; i < 300; i++) {
      await this.sleep(2000)
      if (await this.stopped()) return false
      const url = this.page?.url() || ""
      if (!url.includes("/checkpoint") && !url.includes("/challenge") && !url.includes("/captcha")) {
        if (await this.isLoggedIn()) { await this.saveSession(); await this.log("Captcha solved, resuming."); return true }
      }
    }
    await this.log("Captcha not solved in time.", "error")
    return false
  }

  private isVerificationUrl(url: string) {
    return (
      url.includes("/checkpoint") ||
      url.includes("/challenge") ||
      url.includes("/captcha") ||
      url.includes("/uas/") ||
      url.includes("/authwall") ||
      url.includes("account-restricted") ||
      url.includes("security-verification")
    )
  }

  async login(): Promise<boolean> {
    if (!this.page) throw new Error("Browser not launched")
    await this.log("Checking login status...")

    // Try going to feed first — might already be logged in via saved session
    await this.page.goto("https://www.linkedin.com/feed/", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {})
    await this.sleep(2000)

    await this.log(`Page URL after feed load: ${this.page.url()}`)

    if (await this.isLoggedIn()) {
      await this.log("Already logged in via saved session")
      return true
    }

    await this.log("Navigating to login page...")
    await this.page.goto("https://www.linkedin.com/login", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {})
    await this.sleep(1200)

    await this.log(`Login page URL: ${this.page.url()}`)

    // Fill credentials
    const emailInput = this.page.locator("input#username, input[name='session_key']").first()
    const passInput = this.page.locator("input#password, input[name='session_password']").first()

    const emailCount = await emailInput.count().catch(() => 0)
    await this.log(`Email input found: ${emailCount > 0}`)

    if (emailCount === 0) {
      await this.log("Login form not found. Check URL above.", "error")
      return false
    }

    await emailInput.fill(this.email)
    await this.sleep(300)
    await passInput.fill(this.password)
    await this.sleep(300)

    // Click submit
    const submitBtn = this.page.locator("button[type='submit']").first()
    const submitCount = await submitBtn.count().catch(() => 0)
    await this.log(`Submit button found: ${submitCount > 0}`)

    if (submitCount > 0) {
      await this.humanClick(submitBtn)
    } else {
      await this.page.keyboard.press("Enter")
    }

    // Wait for navigation
    await this.page.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => {})
    await this.sleep(3000)

    const urlAfter = this.page.url()
    await this.log(`URL after submit: ${urlAfter}`)

    // Verification/captcha check
    if (this.isVerificationUrl(urlAfter)) {
      await this.log("Security verification required — please complete it in the browser.", "error")
      const solved = await this.waitForCaptcha()
      if (!solved) return false
    }

    // Check login page body text for errors
    const bodyText = await this.page.evaluate(() => document.body?.innerText?.replace(/\s+/g, " ").trim().toLowerCase() || "").catch(() => "")
    if (bodyText.includes("quick security check") || bodyText.includes("security verification") || bodyText.includes("vérification")) {
      const solved = await this.waitForCaptcha()
      if (!solved) return false
    }

    if (await this.isLoggedIn()) {
      await this.saveSession()
      await this.log("Logged in successfully")
      return true
    }

    // Final URL + page state for diagnosis
    await this.log(`Final URL: ${this.page.url()}`, "error")
    const title = await this.page.title().catch(() => "")
    await this.log(`Page title: ${title}`, "error")

    await this.log("Login failed — credentials wrong, CAPTCHA, or unexpected redirect", "error")
    return false
  }

  // ── Job Search ──────────────────────────────────────────────────────────────

  async searchJobs(query: string, location: string): Promise<LinkedInJob[]> {
    if (!this.page) return []
    await this.log(`Searching: "${query}" in "${location}"`)

    const params = new URLSearchParams({ keywords: query, f_AL: "true", sortBy: "DD" })
    if (location && location.toLowerCase() !== "worldwide") params.set("location", location)

    await this.page.goto(`https://www.linkedin.com/jobs/search/?${params}`, {
      waitUntil: "domcontentloaded", timeout: 30000,
    }).catch(() => {})
    await this.sleep(2000)

    // Wait for job list
    const listLoaded = await this.page.waitForSelector(
      ".jobs-search__results-list, .scaffold-layout__list",
      { timeout: 10000 }
    ).then(() => true).catch(() => false)

    if (!listLoaded) {
      await this.log("No job results found for this query", "skipped")
      return []
    }

    // Scroll to load more
    for (let i = 0; i < 3; i++) {
      await this.page.evaluate(() => window.scrollBy(0, 500)).catch(() => {})
      await this.sleep(600)
    }

    const jobs = await this.page.evaluate((): LinkedInJob[] => {
      const trim = (s: string | null | undefined) => (s || "").replace(/\s+/g, " ").trim()
      const dedupe = (s: string) => { const half = Math.floor(s.length / 2); const a = s.slice(0, half).trim(); const b = s.slice(half).trim(); return a && a === b ? a : s }
      const cards = document.querySelectorAll(".jobs-search__results-list li, .scaffold-layout__list-item")
      const results: LinkedInJob[] = []

      cards.forEach((card) => {
        const link = card.querySelector("a[href*='/jobs/view/']") as HTMLAnchorElement | null
        if (!link) return
        const idMatch = link.href.match(/\/jobs\/view\/(\d+)/)
        if (!idMatch) return
        const titleEl = card.querySelector(".job-card-list__title--link, .job-card-list__title, .job-card-container__link")
        const companyEl = card.querySelector(".job-card-container__company-name, .artdeco-entity-lockup__subtitle")
        const locationEl = card.querySelector(".job-card-container__metadata-item, .artdeco-entity-lockup__caption")
        const applyText = trim(card.querySelector(".job-card-container__apply-method, .job-card-list__footer-wrapper")?.textContent).toLowerCase()
        const rawTitle = dedupe(trim(titleEl?.textContent || link.getAttribute("aria-label") || ""))
        // Only mark Easy Apply when explicitly confirmed — f_AL=true already filters, but some slip through
        const isEasyApply = applyText.includes("easy apply") || applyText.includes("postuler facilement") ||
          card.innerHTML.toLowerCase().includes("easy apply") || card.innerHTML.toLowerCase().includes("postuler facilement") ||
          applyText === "" // f_AL=true means all results should be Easy Apply; empty text = assume yes
        results.push({
          id: idMatch[1],
          title: rawTitle,
          company: trim(companyEl?.textContent),
          location: trim(locationEl?.textContent),
          url: `https://www.linkedin.com/jobs/view/${idMatch[1]}/`,
          isEasyApply,
        })
      })
      return results
    }).catch((): LinkedInJob[] => [])

    await this.log(`Found ${jobs.length} jobs`)
    return jobs
  }

  // ── Apply ───────────────────────────────────────────────────────────────────

  async applyToJob(job: LinkedInJob): Promise<ApplyResult> {
    if (!this.page) return { ...job, jobId: job.id, status: "failed", reason: "No browser page" }

    try {
      // Navigate to job URL — LinkedIn renders it as split view (list left, detail right)
      await this.page.goto(job.url, { waitUntil: "domcontentloaded", timeout: 30000 })
      await this.sleep(2000)

      // Get accurate title/company from the detail panel
      const details = await this.page.evaluate(() => {
        const t = (sels: string[]) => {
          for (const s of sels) { const v = document.querySelector(s)?.textContent?.replace(/\s+/g, " ").trim(); if (v) return v }
          return ""
        }
        return {
          title: t(["h1", ".job-details-jobs-unified-top-card__job-title h1", ".jobs-unified-top-card__job-title h1"]),
          company: t([".job-details-jobs-unified-top-card__company-name a", ".job-details-jobs-unified-top-card__company-name", ".jobs-unified-top-card__company-name a"]),
        }
      }).catch(() => ({ title: "", company: "" }))

      const title = details.title || job.title
      const company = details.company || job.company
      this.jobContext = { title, company, location: job.location }

      await this.log(`Applying: ${title} @ ${company}`)

      // Check if already applied
      const alreadyApplied = await this.page.locator(
        "button:has-text('Applied'), [aria-label*='Applied' i]"
      ).first().isVisible({ timeout: 1500 }).catch(() => false)
      if (alreadyApplied) {
        return { jobId: job.id, title, company, status: "already_applied" }
      }

      // Find and click Easy Apply button
      const opened = await this.openEasyApply()
      if (!opened) {
        return { jobId: job.id, title, company, status: "skipped", reason: "Easy Apply button not found" }
      }

      // Run the application form
      const result = await this.runApplicationForm()
      return { jobId: job.id, title, company, ...result }

    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      await this.log(`Error: ${reason}`, "error")
      return { jobId: job.id, title: job.title, company: job.company, status: "failed", reason }
    }
  }

  private async openEasyApply(): Promise<boolean> {
    if (!this.page) return false

    // Scroll to top so apply button is in view
    await this.page.evaluate(() => window.scrollTo(0, 0)).catch(() => {})

    // Wait for job title to confirm page loaded
    await this.page.waitForSelector("h1", { state: "visible", timeout: 10000 }).catch(() => {})
    await this.sleep(1500)

    // Wait for networkidle so all JS has finished rendering
    await this.page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {})
    await this.sleep(500)

    // Debug: dump what Playwright actually sees
    const debugInfo = await this.page.evaluate(() => {
      const allBtns = Array.from(document.querySelectorAll("button"))
      return {
        total: allBtns.length,
        hasApplyAttr: !!document.querySelector("[data-live-test-job-apply-button]"),
        hasApplyId: !!document.querySelector("#jobs-apply-button-id"),
        hasJobsApplyClass: !!document.querySelector("button.jobs-apply-button"),
        btnSample: allBtns.slice(0, 20).map((b) => ({
          id: b.id,
          cls: b.className.split(" ").filter((c) => c.includes("apply") || c.includes("jobs")).join(" "),
          attrs: Array.from(b.attributes).map((a) => a.name).filter((n) => n.includes("data") || n.includes("aria")).join(" "),
          text: (b.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40),
        })),
      }
    }).catch(() => null)

    await this.log(`DEBUG buttons: total=${debugInfo?.total} | hasApplyAttr=${debugInfo?.hasApplyAttr} | hasApplyId=${debugInfo?.hasApplyId} | hasJobsClass=${debugInfo?.hasJobsApplyClass}`)
    if (debugInfo?.btnSample) {
      for (const b of debugInfo.btnSample.filter((b) => b.cls || b.attrs.includes("aria-label"))) {
        await this.log(`  btn id="${b.id}" class="${b.cls}" attrs="${b.attrs}" text="${b.text}"`)
      }
    }

    // Try all known selectors
    const applyBtn = this.page.locator(
      "[data-live-test-job-apply-button], " +
      "#jobs-apply-button-id, " +
      "button.jobs-apply-button[data-job-id]"
    ).first()

    const found = await applyBtn.isVisible({ timeout: 3000 }).catch(() => false)

    if (!found) {
      await this.log(`No apply button found after networkidle`, "skipped")
      return false
    }

    const label = await applyBtn.getAttribute("aria-label").catch(() => "Easy Apply")
    await this.log(`Clicking: "${label}"`)
    await this.humanClick(applyBtn)
    await this.sleep(2000)

    // Confirm modal appeared
    const modal = await this.page.locator(
      ".jobs-easy-apply-modal, [data-test-modal-id='easy-apply-modal'], " +
      "[role='dialog']:has(.jobs-easy-apply-form-section), " +
      "[role='dialog']:has(button.artdeco-button--primary)"
    ).first().isVisible({ timeout: 8000 }).catch(() => false)

    if (modal) return true

    return this.page.locator("[role='dialog']").filter({
      has: this.page.locator("input, select, textarea")
    }).first().isVisible({ timeout: 3000 }).catch(() => false)
  }

  // ── Application Form ────────────────────────────────────────────────────────

  private getDialog(): Locator {
    return this.page!.locator(
      ".jobs-easy-apply-modal, [data-test-modal-id='easy-apply-modal'], [role='dialog']"
    ).first()
  }

  private async runApplicationForm(): Promise<Pick<ApplyResult, "status" | "reason">> {
    if (!this.page) return { status: "failed", reason: "No page" }

    for (let step = 0; step < 15; step++) {
      if (await this.stopped()) {
        await this.dismissDialog()
        return { status: "skipped", reason: "Stopped" }
      }

      const dialog = this.getDialog()
      const dialogVisible = await dialog.isVisible({ timeout: 3000 }).catch(() => false)
      if (!dialogVisible) {
        // Dialog closed — check if it's because we submitted
        if (await this.checkSubmitted()) return { status: "applied" }
        return { status: "skipped", reason: "Dialog closed unexpectedly" }
      }

      const heading = await dialog.locator("h2, h3").first().textContent().catch(() => "")
      await this.log(`Step ${step + 1}${heading ? `: ${heading.trim()}` : ""}`)

      await this.sleep(STEP_DELAY)
      await this.fillStep(dialog)
      await this.sleep(400)

      const advanced = await this.clickPrimaryButton(dialog)
      if (!advanced) {
        return { status: "skipped", reason: "Could not advance form (no button)" }
      }

      await this.sleep(1500)

      // Check if submitted after click
      if (await this.checkSubmitted()) {
        // Dismiss success dialog
        await this.page.locator("button[aria-label='Dismiss'], button:has-text('Done')").first().click({ force: true }).catch(() => {})
        await this.log("Application submitted!")
        return { status: "applied" }
      }

      // Check for inline error
      const err = await this.page.evaluate(() => {
        const el = document.querySelector(".artdeco-inline-feedback--error")
        return el?.textContent?.replace(/\s+/g, " ").trim() || ""
      }).catch(() => "")
      if (err) await this.log(`Form error: ${err}`, "error")
    }

    await this.dismissDialog()
    return { status: "skipped", reason: "Reached step limit" }
  }

  private async clickPrimaryButton(dialog: Locator): Promise<boolean> {
    // Primary button inside dialog
    const primary = dialog.locator("button.artdeco-button--primary").last()
    if (await primary.isVisible({ timeout: 3000 }).catch(() => false)) {
      const text = await primary.textContent().catch(() => "")
      await this.log(`Clicking "${text?.trim() || "primary button"}"`)
      await this.humanClick(primary)
      return true
    }

    // Text-based fallbacks
    for (const label of ["Submit application", "Submit", "Next", "Continue", "Review", "Send", "Soumettre", "Postuler", "Suivant"]) {
      const btn = dialog.locator(`button:has-text("${label}")`).last()
      if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
        await this.log(`Clicking "${label}"`)
        await btn.click({ force: true }).catch(() => {})
        return true
      }
    }

    // Page-wide fallback
    const pageBtn = this.page!.locator("button.artdeco-button--primary:visible").last()
    if (await pageBtn.count().catch(() => 0) > 0) {
      const text = await pageBtn.textContent().catch(() => "")
      await this.log(`Page-wide click: "${text?.trim()}"`)
      await this.humanClick(pageBtn)
      return true
    }

    await this.log("No primary button found in form", "error")
    return false
  }

  private async checkSubmitted(): Promise<boolean> {
    if (!this.page) return false
    const body = await this.page.evaluate(() => document.body?.innerText?.toLowerCase() || "").catch(() => "")
    return (
      body.includes("application submitted") ||
      body.includes("your application was sent") ||
      body.includes("you've applied") ||
      body.includes("candidature envoy") ||
      body.includes("applied to")
    )
  }

  private async dismissDialog() {
    if (!this.page) return
    for (const sel of ["button[aria-label='Dismiss']", "button[aria-label='Close']", "button:has-text('Discard')", "button:has-text('Exit')"]) {
      const btn = this.page.locator(sel).first()
      if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
        await btn.click({ force: true }).catch(() => {})
        await this.sleep(500)
        break
      }
    }
  }

  // ── Form Filling ─────────────────────────────────────────────────────────────

  private async fillStep(dialog: Locator) {
    await this.uploadResume(dialog)
    await this.fillTextFields(dialog)
    await this.fillSelects(dialog)
    await this.fillRadios(dialog)
    await this.fillCheckboxes(dialog)
  }

  private async uploadResume(dialog: Locator) {
    const fileInput = dialog.locator("input[type='file']").first()
    if (!(await fileInput.isVisible({ timeout: 1000 }).catch(() => false))) return
    const hasFile = await fileInput.evaluate((el) => (el as HTMLInputElement).files?.length || 0).catch(() => 0)
    if (hasFile > 0) { await this.log("Resume already attached"); return }
    const resolved = path.resolve(this.cvPath)
    if (!fs.existsSync(resolved)) { await this.log("CV file not found: " + resolved, "error"); return }
    await fileInput.setInputFiles(resolved).catch(() => {})
    await this.log("Resume uploaded")
    await this.sleep(600)
  }

  private async getLabel(el: Locator): Promise<string> {
    return el.evaluate((node) => {
      const input = node as HTMLInputElement
      const id = input.id
      const ownLabel = id ? document.querySelector(`label[for="${id}"]`) : null
      const wrapper = input.closest("[data-test-form-element], .jobs-easy-apply-form-section__grouping, .fb-dash-form-element, fieldset") || input.parentElement
      return [
        ownLabel?.textContent,
        input.getAttribute("aria-label"),
        input.getAttribute("placeholder"),
        input.getAttribute("name"),
        wrapper?.querySelector("label, legend, h3")?.textContent,
      ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim().toLowerCase()
    }).catch(() => "")
  }

  private matchAnswer(label: string): string {
    const l = label.toLowerCase()
    if (/first.?name|pr[eé]nom/.test(l)) return this.answers.firstName
    if (/last.?name|family.?name|nom de famille/.test(l)) return this.answers.lastName
    if (/full.?name|nom complet/.test(l)) return this.answers.fullName
    if (/email|e-mail/.test(l)) return this.answers.email
    if (/phone|mobile|t[eé]l/.test(l)) return this.answers.phone
    if (/city|ville|location/.test(l)) return this.answers.city
    if (/country|pays|nationality/.test(l)) return this.answers.country
    if (/citizenship/.test(l)) return this.answers.citizenship
    if (/linkedin/.test(l)) return this.answers.linkedinUrl
    if (/portfolio|website|site/.test(l)) return this.answers.portfolioUrl
    if (/salary|salaire|compensation|r[eé]mun/.test(l)) return this.answers.salary
    if (/notice|pr[eé]avis/.test(l)) return this.answers.noticePeriod
    if (/experience|ann[eé]e|year/.test(l)) return this.answers.yearsExperience
    if (/how did you hear|source|r[eé]f[eé]rence/.test(l)) return this.answers.referralSource
    if (/company|current employer/.test(l)) return this.answers.fullName  // avoid blank
    return ""
  }

  private matchYesNo(label: string): "yes" | "no" | null {
    const l = label.toLowerCase()
    if (/authorized|work permit|legally eligible/.test(l)) return this.answers.workAuth
    if (/sponsor/.test(l)) return this.answers.needsSponsorship
    if (/relocat/.test(l)) return this.answers.openToRelocation
    if (/remote/.test(l)) return this.answers.remoteOk
    if (/europe/.test(l)) return this.answers.livesInEurope
    if (/laptop|personal computer|pc/.test(l)) return this.answers.hasLaptop
    if (/worked (with|for|at|before)/.test(l)) return this.answers.workedBefore
    return null
  }

  private async fillTextFields(dialog: Locator) {
    const inputs = await dialog.locator("input[type='text'], input[type='tel'], input[type='number'], input[type='email'], textarea").all().catch(() => [])
    for (const input of inputs) {
      try {
        if (!(await input.isVisible().catch(() => false))) continue
        const disabled = await input.evaluate((el) => (el as HTMLInputElement).disabled || el.getAttribute("aria-disabled") === "true").catch(() => false)
        if (disabled) continue

        const label = await this.getLabel(input)
        const current = await input.inputValue().catch(() => "")

        // Cover letter
        const isTextarea = await input.evaluate((el) => el.tagName === "TEXTAREA").catch(() => false)
        if (isTextarea && /cover.?letter|motivation|why (do you|are you)/i.test(label)) {
          if (!current.trim()) {
            const letter = await this.generateCoverLetter()
            await input.fill(letter).catch(() => {})
            await this.triggerChange(input)
            await this.log("Cover letter filled")
          }
          continue
        }

        if (current.trim()) { await this.triggerChange(input); continue }

        const answer = this.matchAnswer(label)
        if (answer) {
          await input.fill(answer).catch(() => {})
          await this.triggerChange(input)
          await this.log(`Filled "${label.split(" ").slice(0, 4).join(" ")}": ${answer}`)
          continue
        }

        // Groq fallback
        if (this.profile) {
          const decision = await askGroqForFieldAnswer({
            question: label,
            fieldType: isTextarea ? "text" : "text",
            applicant: this.profile,
            job: this.jobContext,
          }).catch(() => null)
          if (decision?.answer && !decision.shouldPause && decision.confidence >= 60) {
            await input.fill(decision.answer).catch(() => {})
            await this.triggerChange(input)
            await this.log(`Groq filled: ${decision.answer}`)
          }
        }
      } catch {}
    }
  }

  private async fillSelects(dialog: Locator) {
    const selects = await dialog.locator("select").all().catch(() => [])
    for (const select of selects) {
      try {
        if (!(await select.isVisible().catch(() => false))) continue
        const label = await this.getLabel(select)
        const opts = await select.evaluate((el) =>
          Array.from((el as HTMLSelectElement).options).map((o) => ({ v: o.value, t: o.text.trim().toLowerCase() }))
        ).catch(() => [] as { v: string; t: string }[])

        // Check current selection
        const current = await select.inputValue().catch(() => "")
        const currentText = opts.find((o) => o.v === current)?.t || ""
        if (current && !["", "select", "select an option", "choose"].includes(currentText)) continue

        // Try yes/no answer
        const yn = this.matchYesNo(label)
        if (yn) {
          const match = opts.find((o) => o.t === yn || o.t.includes(yn))
          if (match?.v) { await select.selectOption(match.v).catch(() => {}); continue }
        }

        // Try string answer
        const answer = this.matchAnswer(label).toLowerCase()
        if (answer) {
          const match = opts.find((o) => o.t.includes(answer) || answer.includes(o.t))
          if (match?.v) { await select.selectOption(match.v).catch(() => {}); await this.log(`Selected "${label.slice(0, 30)}": ${match.t}`); continue }
        }

        // Groq fallback
        if (this.profile && opts.length > 1) {
          const decision = await askGroqForFieldAnswer({
            question: label,
            fieldType: "select",
            options: opts.map((o) => o.t),
            applicant: this.profile,
            job: this.jobContext,
          }).catch(() => null)
          if (decision?.answer && !decision.shouldPause && decision.confidence >= 60) {
            const match = opts.find((o) => o.t.includes(decision.answer.toLowerCase()))
            if (match?.v) { await select.selectOption(match.v).catch(() => {}); await this.log(`Groq select: ${decision.answer}`); continue }
          }
        }

        // Default: pick first non-empty option
        const first = opts.find((o) => o.v && !["", "0"].includes(o.v))
        if (first) await select.selectOption(first.v).catch(() => {})
      } catch {}
    }
  }

  private async fillRadios(dialog: Locator) {
    const radios = await dialog.locator("input[type='radio']").all().catch(() => [])
    const handled = new Set<string>()
    for (const radio of radios) {
      try {
        const name = await radio.getAttribute("name").catch(() => "")
        if (!name || handled.has(name)) continue
        handled.add(name)

        // Skip if already checked
        const checked = await dialog.locator(`input[type='radio'][name="${name}"]:checked`).count().catch(() => 0)
        if (checked > 0) continue

        // Get group label from fieldset/container
        const groupText = await radio.evaluate((el) => {
          const group = el.closest("fieldset, [role='radiogroup'], .jobs-easy-apply-form-section__grouping, .fb-dash-form-element") || el.parentElement
          return group?.textContent?.replace(/\s+/g, " ").trim().toLowerCase() || ""
        }).catch(() => "")

        const desired = this.matchYesNo(groupText) || "yes"

        // Find all radios in this group
        const group = await dialog.locator(`input[type='radio'][name="${name}"]`).all().catch(() => [])
        let selected = false
        for (const option of group) {
          const value = (await option.getAttribute("value").catch(() => "") || "").toLowerCase()
          const optId = await option.getAttribute("id").catch(() => "")
          const labelText = optId
            ? ((await dialog.locator(`label[for="${optId}"]`).textContent().catch(() => "")) ?? "").toLowerCase()
            : ""
          if (value === desired || labelText.includes(desired)) {
            await option.check({ force: true }).catch(() => {})
            selected = true
            break
          }
        }
        if (!selected && group[0]) await group[0].check({ force: true }).catch(() => {})
      } catch {}
    }
  }

  private async fillCheckboxes(dialog: Locator) {
    const checkboxes = await dialog.locator("input[type='checkbox']").all().catch(() => [])
    for (const cb of checkboxes) {
      try {
        if (!(await cb.isVisible().catch(() => false))) continue
        if (await cb.isChecked().catch(() => true)) continue
        const required = await cb.evaluate((el) => {
          const input = el as HTMLInputElement
          if (input.required) return true
          const wrap = input.closest("[data-test-form-element], .jobs-easy-apply-form-section__grouping, fieldset") || input.parentElement
          return (wrap?.textContent || "").includes("*")
        }).catch(() => false)
        if (required) await cb.check({ force: true }).catch(() => {})
      } catch {}
    }
  }

  private async triggerChange(input: Locator) {
    await input.evaluate((el) => {
      el.dispatchEvent(new Event("input", { bubbles: true }))
      el.dispatchEvent(new Event("change", { bubbles: true }))
      el.dispatchEvent(new FocusEvent("blur", { bubbles: true }))
    }).catch(() => {})
  }

  private async generateCoverLetter(): Promise<string> {
    const letter = await generateFrenchCoverLetter({
      applicant: this.profile || {},
      job: { ...this.jobContext, description: "" },
    }).catch(() => null)
    return String(letter || "").trim() || this.defaultCoverLetter()
  }

  private defaultCoverLetter(): string {
    const { fullName, firstName } = this.answers
    const { title, company } = this.jobContext
    return `Bonjour,\n\nJe souhaite postuler pour le poste de ${title || "ce poste"} chez ${company || "votre entreprise"}. Mon parcours et mes compétences me permettent de contribuer rapidement à votre équipe avec sérieux et efficacité.\n\nJe suis disponible pour un entretien à votre convenance.\n\nCordialement,\n${fullName || firstName}`
  }

  // ── Main Entry Point ─────────────────────────────────────────────────────────

  async run(email: string, password: string): Promise<ApplyResult[]> {
    this.email = email
    this.password = password
    this.answers = buildAnswers(email, this.profile)

    try {
      await this.launch()
      if (!(await this.login())) {
        await this.log("Could not log in. Aborting.", "error")
        return []
      }

      // Determine search titles: profile desiredTitles > DEFAULT_JOB_TITLES, AI only supplements
      const profileTitles = (this.profile?.desiredTitles || []).filter(Boolean)
      let titles: string[] = profileTitles.length ? profileTitles : DEFAULT_JOB_TITLES
      if (this.profile && !profileTitles.length) {
        // Only ask AI if profile has no explicit desired titles
        try {
          const suggestion = await suggestJobTitlesFromProfile(this.profile)
          if (suggestion?.titles?.length) {
            titles = suggestion.titles
            await this.log(`AI job titles: ${titles.join(", ")}`)
          }
        } catch {}
      }
      await this.log(`Searching for: ${titles.slice(0, 5).join(", ")}${titles.length > 5 ? "..." : ""}`)

      // Determine location
      const location = this.profile?.remoteOnly
        ? "Remote"
        : (this.profile?.desiredLocation || "Worldwide")

      let applied = 0

      for (const title of titles) {
        if (await this.stopped() || applied >= MAX_APPLIES_PER_RUN) break

        const jobs = await this.searchJobs(title, location)

        for (const job of jobs) {
          if (await this.stopped() || applied >= MAX_APPLIES_PER_RUN) break
          if (!job.isEasyApply) { await this.log(`Skipping non-Easy Apply: ${job.title}`, "skipped"); continue }

          const result = await this.applyToJob(job)
          this.results.push(result)
          await this.onResult?.(result)

          if (result.status === "applied") applied++
          await this.sleep(BETWEEN_JOBS_DELAY)
        }
      }

      await this.log(`Run complete — Applied: ${applied}`, "done")
      return this.results
    } finally {
      await this.close()
    }
  }
}
