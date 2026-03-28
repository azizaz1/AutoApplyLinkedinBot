// Handle API fetch requests from content script (bypasses mixed-content block)
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "FETCH") {
    fetch(msg.url, {
      method: msg.method || "GET",
      headers: msg.headers || {},
      body: msg.body || undefined,
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        sendResponse({ ok: res.ok, status: res.status, data })
      })
      .catch((err) => sendResponse({ ok: false, error: err.message }))
    return true // keep channel open for async response
  }
})

// Relay messages from content script → popup
chrome.runtime.onMessage.addListener((msg) => {
  if (!["LOG", "COUNTS", "DONE"].includes(msg.type)) return

  // Persist to session storage (so popup can read on open)
  if (msg.type === "COUNTS" || msg.type === "DONE") {
    chrome.storage.session.set({ counts: msg.counts, running: msg.type !== "DONE" })
  }
  if (msg.type === "LOG") {
    chrome.storage.session.get(["logs"], ({ logs = [] }) => {
      const entry = { message: msg.message, type: msg.logType, time: new Date().toLocaleTimeString() }
      chrome.storage.session.set({ logs: [...logs, entry].slice(-100) })
    })
  }

  // Forward to popup (if it's open) — ignore error if popup is closed
  chrome.runtime.sendMessage(msg).catch(() => {})
})
