;(function () {
  if (window.__autoApplyLoaded) return
  window.__autoApplyLoaded = true

  // ── State ──────────────────────────────────────────────────────────────────
  let running = false
  let profile = null
  let answers = {}
  let counts = { applied: 0, skipped: 0, failed: 0 }

  // ── Utilities ──────────────────────────────────────────────────────────────
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms + Math.random() * ms * 0.3))

  function isContextValid() {
    try { return !!chrome.runtime?.id } catch { return false }
  }

  function log(message, type = "info") {
    if (isContextValid()) {
      chrome.runtime.sendMessage({ type: "LOG", message, logType: type }).catch(() => {})
    }
    console.log(`[AutoApply:${type}] ${message}`)
  }

  async function waitForEl(selector, root = document, timeout = 12000) {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      const el = root.querySelector(selector)
      if (el) return el
      await sleep(400)
    }
    return null
  }

  // ── API (via background to bypass mixed-content block) ────────────────────
  async function bgFetch(url, method = "GET", headers = {}, body = null) {
    if (!isContextValid()) {
      running = false
      throw new Error("Extension reloaded — please refresh the LinkedIn tab and start again")
    }
    const response = await chrome.runtime.sendMessage({
      type: "FETCH",
      url,
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!response?.ok) throw new Error(response?.error || `HTTP ${response?.status}`)
    return response.data
  }

  async function fetchProfile(appUrl, secret) {
    return bgFetch(`${appUrl}/api/extension`, "GET", { "X-Extension-Secret": secret })
  }

  // Cache Groq answers so the same question isn't called twice
  const aiAnswerCache = {}

  async function askGroq(appUrl, secret, question, fieldType = "text", min, max) {
    const cacheKey = question.trim().toLowerCase()
    if (aiAnswerCache[cacheKey]) return aiAnswerCache[cacheKey]

    log(`AI answering: "${question.slice(0, 60)}"`)
    try {
      const data = await bgFetch(
        `${appUrl}/api/extension/answer`,
        "POST",
        { "Content-Type": "application/json", "X-Extension-Secret": secret },
        { question, fieldType, min, max, profile }
      )
      const answer = data?.answer || null
      if (answer) aiAnswerCache[cacheKey] = answer
      return answer
    } catch {
      return null
    }
  }

  async function saveResult(appUrl, secret, result) {
    bgFetch(`${appUrl}/api/extension`, "POST", {
      "Content-Type": "application/json",
      "X-Extension-Secret": secret,
    }, { ...result, userId: profile?.userId }).catch(() => {})
  }

  // ── Form field matching ────────────────────────────────────────────────────
  function getAnswer(labelText) {
    const l = (labelText || "").toLowerCase().trim()
    // Personal
    if (l.includes("first name"))                        return profile.fullName?.split(" ")[0] || ""
    if (l.includes("last name") || l.includes("surname")) return profile.fullName?.split(" ").slice(1).join(" ") || ""
    if (l.includes("full name") || l.includes("your name")) return profile.fullName || ""
    if (l.includes("phone") || l.includes("mobile"))    return answers.phone || ""
    if (l.includes("email"))                             return "" // LinkedIn pre-fills this
    if (l.includes("linkedin"))                          return answers.linkedinUrl || ""
    if (l.includes("website") || l.includes("portfolio") || l.includes("github")) return answers.linkedinUrl || ""
    if (l.includes("city"))                              return answers.city || profile.desiredLocation || ""
    if (l.includes("location") || l.includes("address")) return answers.city || profile.desiredLocation || ""
    if (l.includes("country"))                           return answers.country || ""
    if (l.includes("citizenship"))                       return answers.country || ""
    // Job preferences
    if (l.includes("years") && l.includes("experience")) return String(profile.yearsExperience || 3)
    if (l.includes("salary") || l.includes("compensation") || l.includes("expected")) return answers.salary || "0"
    if (l.includes("notice") || l.includes("start date") || l.includes("available")) return answers.noticePeriod || "1 month"
    if (l.includes("current title") || l.includes("job title")) return profile.currentTitle || ""
    // Yes/No questions
    if (l.includes("sponsor") || l.includes("visa"))    return "No"
    if (l.includes("authorized") || l.includes("legally") || l.includes("work permit")) return "Yes"
    if (l.includes("remote"))                            return profile.remoteOnly ? "Yes" : "No"
    if (l.includes("relocat"))                           return "Yes"
    if (l.includes("background check"))                  return "Yes"
    if (l.includes("disability"))                        return "I don't wish to answer"
    if (l.includes("gender"))                            return "Prefer not to say"
    if (l.includes("veteran") || l.includes("military")) return "I am not a protected veteran"
    if (l.includes("race") || l.includes("ethnicity"))  return "Decline to self-identify"
    return null
  }

  // ── React/SPA input setter ─────────────────────────────────────────────────
  function setNativeValue(el, value) {
    const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set
    if (setter) setter.call(el, value)
    else el.value = value
    el.dispatchEvent(new Event("input",  { bubbles: true }))
    el.dispatchEvent(new Event("change", { bubbles: true }))
  }

  async function fillInput(el, value) {
    if (!value || el.readOnly || el.disabled) return
    el.focus()
    await sleep(80)
    setNativeValue(el, value)
    await sleep(120)
    el.blur()
  }

  async function fillTypeahead(inp, value) {
    if (!value || inp.readOnly || inp.disabled) return

    // Clear and focus
    inp.focus()
    await sleep(200)
    setNativeValue(inp, "")
    await sleep(100)

    // Type the value to trigger autocomplete
    setNativeValue(inp, value)
    inp.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: value.slice(-1) }))
    inp.dispatchEvent(new Event("input", { bubbles: true }))
    inp.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: value.slice(-1) }))

    // Wait for dropdown to appear (up to 3s)
    let option = null
    for (let i = 0; i < 12; i++) {
      await sleep(250)
      option =
        document.querySelector(".basic-typeahead__selectable") ||
        document.querySelector("[data-basic-typeahead-option]") ||
        document.querySelector("ul[role='listbox'] li[role='option']") ||
        document.querySelector(".jobs-easy-apply-form-element__typeahead-option") ||
        document.querySelector("[role='listbox'] [role='option']")
      if (option) break
    }

    if (option) {
      option.click()
      await sleep(400)
    } else {
      // Fallback: just blur with whatever was typed
      inp.dispatchEvent(new Event("blur", { bubbles: true }))
    }
  }

  // ── Fill one modal page ────────────────────────────────────────────────────
  async function fillModalPage(modal, appUrl, secret) {
    const groups = modal.querySelectorAll(
      ".fb-dash-form-element, .jobs-easy-apply-form-section__grouping, [data-test-form-element], .artdeco-text-input--container"
    )

    for (const group of groups) {
      const labelEl = group.querySelector("label, legend, .fb-dash-form-element__label, [data-test-single-typeahead-entity-form-label]")
      const labelText = labelEl?.textContent?.trim() || ""

      // ── Text / number / tel / email inputs
      for (const inp of group.querySelectorAll('input[type="text"], input[type="number"], input[type="tel"], input[type="email"]')) {
        if (inp.value && inp.value.trim()) continue
        // Grab the full group text including helper/constraint text (e.g. "larger than 0.0")
        const fullGroupText = (group.innerText || group.textContent || "").replace(/\s+/g, " ").trim()
        const question = fullGroupText || labelText || inp.placeholder || inp.getAttribute("name") || ""
        let answer = getAnswer(question)
        if (!answer && question) {
          const isNumber = inp.type === "number"
          // Parse min/max from input attrs OR from label text like "larger than 0.0" / "between 1 and 10"
          let min = inp.min ? parseFloat(inp.min) : undefined
          let max = inp.max ? parseFloat(inp.max) : undefined
          const largerMatch = fullGroupText.match(/larger than ([\d.]+)/i) || fullGroupText.match(/greater than ([\d.]+)/i) || fullGroupText.match(/more than ([\d.]+)/i)
          const smallerMatch = fullGroupText.match(/less than ([\d.]+)/i) || fullGroupText.match(/up to ([\d.]+)/i)
          const betweenMatch = fullGroupText.match(/between ([\d.]+) and ([\d.]+)/i)
          if (largerMatch) min = parseFloat(largerMatch[1])
          if (smallerMatch) max = parseFloat(smallerMatch[1])
          if (betweenMatch) { min = parseFloat(betweenMatch[1]); max = parseFloat(betweenMatch[2]) }
          answer = await askGroq(appUrl, secret, question, isNumber ? "number" : "text", min, max)
        }
        // Validate number constraints before filling
        if (answer) {
          const num = parseFloat(answer)
          if (!isNaN(num)) {
            const minAttr = inp.min ? parseFloat(inp.min) : undefined
            const maxAttr = inp.max ? parseFloat(inp.max) : undefined
            if (minAttr !== undefined && num <= minAttr) answer = String(minAttr + 1)
            if (maxAttr !== undefined && num > maxAttr) answer = String(maxAttr)
          }
          await fillInput(inp, answer)
        }
      }

      // ── Textarea
      for (const ta of group.querySelectorAll("textarea")) {
        if (ta.value && ta.value.trim()) continue
        let answer = getAnswer(labelText)
        if (!answer && labelText) answer = await askGroq(appUrl, secret, labelText, "text")
        if (answer) await fillInput(ta, answer)
      }

      // ── Typeahead inputs (LinkedIn city/location autocomplete)
      for (const inp of group.querySelectorAll('input[role="combobox"]')) {
        if (inp.value && inp.value.trim()) continue
        const question = labelText || inp.placeholder || ""
        let answer = getAnswer(question)
        if (!answer && question) answer = await askGroq(appUrl, secret, question, "text")
        if (answer) await fillTypeahead(inp, answer)
      }

      // ── Select dropdown
      for (const sel of group.querySelectorAll("select")) {
        if (sel.value) continue
        let answer = getAnswer(labelText)
        if (!answer && labelText) answer = await askGroq(appUrl, secret, labelText, "text")
        if (answer) {
          const opt = Array.from(sel.options).find((o) =>
            o.text.toLowerCase().includes(answer.toLowerCase()) || o.value.toLowerCase() === answer.toLowerCase()
          )
          if (opt) {
            sel.value = opt.value
            sel.dispatchEvent(new Event("change", { bubbles: true }))
          } else if (sel.options.length > 1) {
            sel.selectedIndex = 1
            sel.dispatchEvent(new Event("change", { bubbles: true }))
          }
        }
      }

      // ── Radio buttons
      const radios = group.querySelectorAll('input[type="radio"]')
      if (radios.length > 0 && !Array.from(radios).some((r) => r.checked)) {
        let answer = getAnswer(labelText)
        if (!answer && labelText) answer = await askGroq(appUrl, secret, labelText, "text")
        answer = (answer || "Yes").toLowerCase()
        const match = Array.from(radios).find((r) => {
          const rLabel = (r.closest("label")?.textContent || r.value || "").trim().toLowerCase()
          return rLabel === answer || rLabel.startsWith(answer)
        })
        if (match) {
          match.click()
          await sleep(150)
        } else {
          radios[0].click()
          await sleep(150)
        }
      }
    }
  }

  // ── Navigate the full Easy Apply modal ────────────────────────────────────
  async function handleModal(modal, jobTitle, appUrl, secret) {
    const MAX_STEPS = 10

    for (let step = 0; step < MAX_STEPS; step++) {
      if (!running) return false
      await sleep(800)

      // Fill current page
      await fillModalPage(modal, appUrl, secret)
      await sleep(500)

      // Look for buttons (order matters)
      const submitBtn = modal.querySelector(
        'button[aria-label*="Submit application"], button[aria-label*="Submit"]'
      )
      const reviewBtn = modal.querySelector('button[aria-label*="Review"]')
      const nextBtn   = modal.querySelector(
        'button[aria-label*="Continue to next step"], button[aria-label*="Next"], button[aria-label*="Review your application"]'
      )

      if (submitBtn) {
        log(`Submitting: ${jobTitle}`)
        submitBtn.click()
        await sleep(2500)
        // Dismiss any post-submit modal
        const dismissBtn = document.querySelector('button[aria-label*="Dismiss"], button[aria-label*="Close"], [data-test-modal-close-btn]')
        if (dismissBtn) dismissBtn.click()
        return true
      }

      if (reviewBtn) {
        reviewBtn.click()
        await sleep(1500)
        continue
      }

      if (nextBtn) {
        nextBtn.click()
        await sleep(1500)
        continue
      }

      // Fallback: any primary button in the footer
      const primaryBtns = modal.querySelectorAll(".artdeco-button--primary")
      const footer = modal.querySelector(".jobs-easy-apply-footer, .ph5.pb4")
      const footerBtn = footer ? footer.querySelector(".artdeco-button--primary") : primaryBtns[primaryBtns.length - 1]

      if (footerBtn) {
        footerBtn.click()
        await sleep(1500)
      } else {
        log(`No button found on step ${step + 1} for ${jobTitle}`, "error")
        return false
      }
    }

    return false
  }

  // ── Apply to one job ───────────────────────────────────────────────────────
  async function applyToJob(card, appUrl, secret) {
    // Extract job info from the card
    const titleEl = card.querySelector(
      ".job-card-list__title--link, .job-card-list__title, .artdeco-entity-lockup__title, a[href*='/jobs/view/']"
    )
    const companyEl = card.querySelector(
      ".job-card-container__primary-description, .artdeco-entity-lockup__subtitle, .job-card-list__company-name"
    )
    // Deduplicate repeated title halves (LinkedIn sometimes doubles the text)
    function dedupe(text) {
      if (!text) return "Unknown"
      const t = text.trim().replace(/\s+/g, " ")
      const half = Math.floor(t.length / 2)
      if (t.slice(0, half) === t.slice(half).trim()) return t.slice(0, half).trim()
      return t
    }
    const jobTitle = dedupe(titleEl?.textContent)
    const company  = dedupe(companyEl?.textContent)

    // Extract job ID from card, data attribute, or link href
    const link = card.querySelector("a[href*='/jobs/view/']")
    const jobId =
      card.dataset.jobId ||
      card.querySelector("[data-job-id]")?.dataset?.jobId ||
      link?.href?.match(/\/jobs\/view\/(\d+)/)?.[1] ||
      ""

    log(`Checking: ${jobTitle} at ${company}`)

    // Click the job title link (most reliable way to trigger LinkedIn's SPA navigation)
    const titleLink = card.querySelector("a[href*='/jobs/view/']")
    if (titleLink) {
      titleLink.click()
    } else {
      card.click()
    }
    await sleep(2500)

    // Quick check: already applied? Use specific selectors, not broad text search
    const alreadyApplied =
      !!document.querySelector(".jobs-s-apply--applied") ||
      !!document.querySelector("[data-test-job-status-label]") ||
      !!document.querySelector(".jobs-applied-badge") ||
      !!card.querySelector(".job-card-container__apply-method--applied, .job-card-list__footer-wrapper .artdeco-inline-feedback--success")
    if (alreadyApplied) {
      log(`Skipped: ${jobTitle} — already applied`, "skipped")
      counts.skipped++
      chrome.runtime.sendMessage({ type: "COUNTS", counts }).catch(() => {})
      return
    }

    // Wait for the detail panel to load THIS specific job
    // The apply button carries a data-job-id we can match against
    const applySelectors = [
      "#jobs-apply-button-id",
      "[data-live-test-job-apply-button]",
      "button.jobs-apply-button[data-job-id]",
    ]
    let applyBtn = null

    for (let attempt = 0; attempt < 30; attempt++) {
      if (!running) return
      for (const sel of applySelectors) {
        const el = document.querySelector(sel)
        if (!el || el.offsetParent === null) continue
        if (jobId && el.dataset.jobId && el.dataset.jobId !== jobId) break
        applyBtn = el
        break
      }
      if (applyBtn) break
      // On attempt 10 (~4s), try clicking the link again in case first click missed
      if (attempt === 10) {
        const retryLink = card.querySelector("a[href*='/jobs/view/']")
        if (retryLink) retryLink.click()
      }
      await sleep(400)
    }

    if (!applyBtn) {
      log(`Skipped: ${jobTitle} — no Easy Apply button`, "skipped")
      counts.skipped++
      return
    }

    // Verify it's actually Easy Apply (not "Apply" which redirects externally)
    const ariaLabel = (applyBtn.getAttribute("aria-label") || applyBtn.textContent || "").toLowerCase()
    if (!ariaLabel.includes("easy apply")) {
      log(`Skipped: ${jobTitle} — not Easy Apply`, "skipped")
      counts.skipped++
      return
    }

    // Scroll into view and click
    applyBtn.scrollIntoView({ behavior: "smooth", block: "center" })
    await sleep(600)
    applyBtn.click()
    await sleep(2000)

    // Wait for modal
    const modal = await waitForEl(
      ".jobs-easy-apply-modal, [data-test-modal-id='easy-apply-modal'], .artdeco-modal[role='dialog']",
      document,
      8000
    )

    if (!modal) {
      log(`Failed: ${jobTitle} — modal didn't open`, "error")
      counts.failed++
      return
    }

    const submitted = await handleModal(modal, jobTitle, appUrl, secret)

    // Dismiss modal if still open
    const closeBtn = document.querySelector(
      'button[aria-label*="Dismiss"], button[aria-label*="Close this"], [data-test-modal-close-btn]'
    )
    if (closeBtn) { closeBtn.click(); await sleep(500) }

    if (submitted) {
      log(`Applied: ${jobTitle} at ${company}`, "applied")
      counts.applied++
      await saveResult(appUrl, secret, { jobId, title: jobTitle, company, url: `https://www.linkedin.com/jobs/view/${jobId}`, status: "applied" })
    } else {
      log(`Failed: ${jobTitle} — incomplete form`, "error")
      counts.failed++
    }

    chrome.runtime.sendMessage({ type: "COUNTS", counts }).catch(() => {})
  }

  // ── Main run loop ──────────────────────────────────────────────────────────
  async function run(settings) {
    running = true
    counts = { applied: 0, skipped: 0, failed: 0 }
    const { appUrl, secret, searchQuery, maxJobs = 20, phone, linkedinUrl, city, country, salary } = settings

    // Store quick-access answers
    answers = { phone, linkedinUrl, city, country, salary, noticePeriod: "1 month" }

    // Load profile from app
    try {
      log("Loading profile from app...")
      const data = await fetchProfile(appUrl, secret)
      profile = data.profile
      if (!profile) throw new Error("No profile data")
      log(`Profile: ${profile.fullName} | ${profile.currentTitle}`)
    } catch (e) {
      log(`Failed to load profile: ${e.message}`, "error")
      log("Check your App URL and Extension Secret in Settings.", "error")
      running = false
      chrome.runtime.sendMessage({ type: "DONE", counts }).catch(() => {})
      return
    }

    log(`Searching: "${searchQuery || profile.desiredTitles?.[0] || "Software Engineer"}" | Max: ${maxJobs} jobs`)
    await sleep(2000) // Wait for job cards to render

    let processed = 0
    let page = 0

    while (running && processed < maxJobs) {
      // Get unprocessed job cards
      const cardSelectors = [
        ".jobs-search-results__list-item",
        ".scaffold-layout__list-item",
      ]
      let cards = []
      for (const sel of cardSelectors) {
        cards = Array.from(document.querySelectorAll(sel)).filter(
          (el) => el.querySelector("a[href*='/jobs/view/']") && !el.dataset.processed
        )
        if (cards.length) break
      }

      if (!cards.length) {
        log("No more job cards found.", "info")
        break
      }

      for (const card of cards) {
        if (!running || processed >= maxJobs) break
        if (!isContextValid()) {
          console.log("[AutoApply] Extension reloaded. Stopping.")
          return
        }
        card.dataset.processed = "1"
        await applyToJob(card, appUrl, secret)
        processed++
        await sleep(3000 + Math.random() * 2000)
      }

      if (!running || processed >= maxJobs) break

      // Go to next page by updating the URL start param (25 jobs per page)
      page++
      const nextStart = page * 25
      const url = new URL(window.location.href)
      url.searchParams.set("start", nextStart)
      log(`Moving to page ${page + 1} (start=${nextStart})...`)
      window.history.pushState({}, "", url.toString())
      // Trigger LinkedIn's SPA router to load new results
      window.dispatchEvent(new PopStateEvent("popstate"))
      await sleep(5000)
    }

    running = false
    log(`Done! Applied: ${counts.applied} | Skipped: ${counts.skipped} | Failed: ${counts.failed}`)
    chrome.runtime.sendMessage({ type: "DONE", counts }).catch(() => {})
  }

  // ── Message listener ───────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "START") {
      if (!running) run(msg.settings)
      sendResponse({ ok: true })
      return true
    }
    if (msg.type === "STOP") {
      running = false
      log("Stopped by user.", "info")
      sendResponse({ ok: true })
      return true
    }
    if (msg.type === "STATUS") {
      sendResponse({ running, counts })
      return true
    }
  })

  console.log("[AutoApply] Content script ready on LinkedIn")
})()
