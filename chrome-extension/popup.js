const SETTINGS_KEY = "autoapply_ext_settings"

// ── Tab switching ─────────────────────────────────────────────────────────────
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"))
    document.querySelectorAll(".pane").forEach((p) => p.classList.remove("active"))
    tab.classList.add("active")
    document.getElementById(`pane-${tab.dataset.tab}`).classList.add("active")
  })
})

// ── Load saved settings ───────────────────────────────────────────────────────
chrome.storage.local.get([SETTINGS_KEY], ({ [SETTINGS_KEY]: s = {} }) => {
  if (s.appUrl)      document.getElementById("appUrl").value      = s.appUrl
  if (s.secret)      document.getElementById("secret").value      = s.secret
  if (s.searchQuery) document.getElementById("searchQuery").value = s.searchQuery
  if (s.maxJobs)     document.getElementById("maxJobs").value     = s.maxJobs
  if (s.phone)       document.getElementById("phone").value       = s.phone
  if (s.linkedinUrl) document.getElementById("linkedinUrl").value = s.linkedinUrl
  if (s.city)        document.getElementById("city").value        = s.city
  if (s.country)     document.getElementById("country").value     = s.country
  if (s.salary)      document.getElementById("salary").value      = s.salary
})

// ── Save settings ─────────────────────────────────────────────────────────────
document.getElementById("btnSave").addEventListener("click", () => {
  const s = {
    appUrl:      document.getElementById("appUrl").value.trim().replace(/\/$/, "") || "http://localhost:3000",
    secret:      document.getElementById("secret").value.trim(),
    searchQuery: document.getElementById("searchQuery").value.trim(),
    maxJobs:     parseInt(document.getElementById("maxJobs").value) || 20,
    phone:       document.getElementById("phone").value.trim(),
    linkedinUrl: document.getElementById("linkedinUrl").value.trim(),
    city:        document.getElementById("city").value.trim(),
    country:     document.getElementById("country").value.trim(),
    salary:      document.getElementById("salary").value.trim(),
  }
  chrome.storage.local.set({ [SETTINGS_KEY]: s }, () => {
    const msg = document.getElementById("savedMsg")
    msg.style.display = "block"
    setTimeout(() => (msg.style.display = "none"), 2000)
  })
})

// ── Running state ─────────────────────────────────────────────────────────────
let isRunning = false

function setRunning(v) {
  isRunning = v
  const btn = document.getElementById("btnStart")
  const badge = document.getElementById("statusBadge")
  btn.textContent = v ? "Stop" : "Start Auto-Apply"
  btn.className = `btn-start ${v ? "running" : "idle"}`
  badge.textContent = v ? "Running" : "Idle"
  badge.className = `status-badge ${v ? "running" : "idle"}`
}

function updateCounts(counts) {
  if (!counts) return
  document.getElementById("cntApplied").textContent = counts.applied ?? 0
  document.getElementById("cntSkipped").textContent = counts.skipped ?? 0
  document.getElementById("cntFailed").textContent  = counts.failed  ?? 0
}

// Restore state from session storage
chrome.storage.session.get(["running", "counts", "logs"], ({ running, counts, logs }) => {
  if (running) setRunning(true)
  updateCounts(counts)
  if (logs?.length) {
    const box = document.getElementById("logBox")
    box.innerHTML = ""
    logs.forEach((l) => appendLog(l.message, l.type, l.time))
  }
})

// ── Log rendering ─────────────────────────────────────────────────────────────
function appendLog(message, type = "info", time) {
  const box = document.getElementById("logBox")
  const entry = document.createElement("div")
  entry.className = `log-entry ${type}`
  const t = time || new Date().toLocaleTimeString()
  entry.innerHTML = `<span class="time">${t}</span><span class="msg">${message}</span>`
  box.appendChild(entry)
  box.scrollTop = box.scrollHeight
}

// Listen for messages from background/content
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "LOG")    appendLog(msg.message, msg.logType)
  if (msg.type === "COUNTS") updateCounts(msg.counts)
  if (msg.type === "DONE") {
    updateCounts(msg.counts)
    setRunning(false)
    appendLog("Session complete.", "info")
  }
})

// ── Start / Stop ──────────────────────────────────────────────────────────────
document.getElementById("btnStart").addEventListener("click", async () => {
  if (isRunning) {
    // Send stop to active LinkedIn tab
    const tabs = await chrome.tabs.query({ url: "*://www.linkedin.com/*" })
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, { type: "STOP" }).catch(() => {})
    }
    setRunning(false)
    return
  }

  // Get settings
  const s = await new Promise((res) =>
    chrome.storage.local.get([SETTINGS_KEY], ({ [SETTINGS_KEY]: v = {} }) => res(v))
  )
  const settings = {
    appUrl:      s.appUrl || "http://localhost:3000",
    secret:      s.secret || "",
    searchQuery: s.searchQuery || "",
    maxJobs:     s.maxJobs || 20,
    phone:       s.phone || "",
    linkedinUrl: s.linkedinUrl || "",
    city:        s.city || "",
    country:     s.country || "",
    salary:      s.salary || "",
  }

  if (!settings.secret) {
    appendLog("No Extension Secret set. Go to Settings tab.", "error")
    return
  }

  // Reset log and counts
  document.getElementById("logBox").innerHTML = ""
  updateCounts({ applied: 0, skipped: 0, failed: 0 })
  chrome.storage.session.set({ logs: [], counts: { applied: 0, skipped: 0, failed: 0 }, running: true })
  setRunning(true)
  appendLog("Starting...", "info")

  const searchUrl = `https://www.linkedin.com/jobs/search/?f_AL=true&f_TPR=r86400&sortBy=DD&keywords=${encodeURIComponent(settings.searchQuery || "Software Engineer")}`

  // Find or open a LinkedIn tab and navigate it to the jobs search URL
  const existingTabs = await chrome.tabs.query({ url: "*://www.linkedin.com/*" })
  let tab = existingTabs[0]

  if (tab) {
    await chrome.tabs.update(tab.id, { url: searchUrl, active: true })
  } else {
    tab = await chrome.tabs.create({ url: searchUrl })
  }

  appendLog("Waiting for LinkedIn Jobs to load...", "info")

  // Wait for the tab to fully load after navigation
  await new Promise((resolve) => {
    function onUpdated(tabId, info) {
      if (tabId === tab.id && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(onUpdated)
        resolve()
      }
    }
    chrome.tabs.onUpdated.addListener(onUpdated)
    // Safety timeout in case the event is missed
    setTimeout(resolve, 8000)
  })

  // Extra wait for LinkedIn's JS to render job cards
  await new Promise((res) => setTimeout(res, 3000))

  // Inject fresh content script
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] })
  } catch (e) {
    appendLog(`Inject failed: ${e.message}`, "error")
  }

  await new Promise((res) => setTimeout(res, 800))

  // Send START
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "START", settings })
  } catch (e) {
    appendLog(`Could not start: ${e.message}`, "error")
    setRunning(false)
    chrome.storage.session.set({ running: false })
  }
})

// Open app settings link
document.getElementById("openSettings")?.addEventListener("click", (e) => {
  e.preventDefault()
  chrome.storage.local.get([SETTINGS_KEY], ({ [SETTINGS_KEY]: s = {} }) => {
    const url = (s.appUrl || "http://localhost:3000") + "/settings"
    chrome.tabs.create({ url })
  })
})
