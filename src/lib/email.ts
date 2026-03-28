import nodemailer from "nodemailer"
import { decrypt } from "./crypto"

export interface JobEmailItem {
  title: string
  company: string
  location?: string
  url?: string
  status: "applied" | "skipped" | "failed"
  reason?: string
}

interface SendRunSummaryOptions {
  to: string
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPassEnc: string
  applied: JobEmailItem[]
  skipped: JobEmailItem[]
  failed: JobEmailItem[]
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    applied: "background:#d1fae5;color:#065f46",
    skipped: "background:#fef3c7;color:#92400e",
    failed: "background:#fee2e2;color:#991b1b",
  }
  return `<span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;${map[status] ?? ""}">${status.toUpperCase()}</span>`
}

function jobRow(job: JobEmailItem) {
  const title = job.url
    ? `<a href="${job.url}" style="color:#1f2a24;font-weight:600;text-decoration:none">${job.title}</a>`
    : `<span style="font-weight:600;color:#1f2a24">${job.title}</span>`
  return `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #f0ebe0;vertical-align:top">
        <div>${title}</div>
        <div style="color:#7b715f;font-size:13px;margin-top:2px">${job.company}${job.location ? ` · ${job.location}` : ""}</div>
        ${job.reason ? `<div style="color:#9a9080;font-size:12px;margin-top:2px">${job.reason}</div>` : ""}
      </td>
      <td style="padding:12px 0 12px 16px;border-bottom:1px solid #f0ebe0;vertical-align:top;white-space:nowrap">${statusBadge(job.status)}</td>
    </tr>`
}

function buildHtml(opts: SendRunSummaryOptions) {
  const total = opts.applied.length + opts.skipped.length + opts.failed.length
  const interestingSkipped = opts.skipped.filter((j) => j.url).slice(0, 10)
  const date = new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.08)">

    <!-- Header -->
    <div style="background:#1f2a24;padding:32px;color:#f8f3ea">
      <div style="font-size:12px;letter-spacing:0.2em;text-transform:uppercase;color:#a0c4a0;margin-bottom:8px">AutoApply · Run complete</div>
      <div style="font-size:26px;font-weight:700">Job run summary</div>
      <div style="color:#a8c8a8;font-size:14px;margin-top:6px">${date}</div>
    </div>

    <!-- Stats row -->
    <div style="display:flex;padding:24px;gap:0;border-bottom:1px solid #f0ebe0">
      <div style="flex:1;text-align:center">
        <div style="font-size:32px;font-weight:700;color:#1f2a24">${opts.applied.length}</div>
        <div style="font-size:12px;color:#6da086;font-weight:600;letter-spacing:0.1em;text-transform:uppercase">Applied</div>
      </div>
      <div style="flex:1;text-align:center;border-left:1px solid #f0ebe0">
        <div style="font-size:32px;font-weight:700;color:#1f2a24">${opts.skipped.length}</div>
        <div style="font-size:12px;color:#c9a96e;font-weight:600;letter-spacing:0.1em;text-transform:uppercase">Skipped</div>
      </div>
      <div style="flex:1;text-align:center;border-left:1px solid #f0ebe0">
        <div style="font-size:32px;font-weight:700;color:#1f2a24">${total}</div>
        <div style="font-size:12px;color:#7b715f;font-weight:600;letter-spacing:0.1em;text-transform:uppercase">Total</div>
      </div>
    </div>

    <div style="padding:24px 32px">

      <!-- Applied jobs -->
      ${opts.applied.length > 0 ? `
      <div style="font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:0.15em;color:#346959;margin-bottom:12px">
        ✓ Successfully applied (${opts.applied.length})
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:28px">
        ${opts.applied.map(jobRow).join("")}
      </table>` : ""}

      <!-- Interesting skipped jobs -->
      ${interestingSkipped.length > 0 ? `
      <div style="font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:0.15em;color:#c9a96e;margin-bottom:4px">
        👀 You might be interested in (${interestingSkipped.length})
      </div>
      <div style="font-size:13px;color:#9a9080;margin-bottom:12px">These jobs were found but skipped — you can apply manually</div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:28px">
        ${interestingSkipped.map(jobRow).join("")}
      </table>` : ""}

      ${opts.applied.length === 0 && interestingSkipped.length === 0 ? `
      <div style="text-align:center;padding:24px;color:#9a9080;font-size:14px">
        No applications this run. The bot may need LinkedIn re-authentication.
      </div>` : ""}

    </div>

    <!-- Footer -->
    <div style="background:#f5f0e8;padding:20px 32px;text-align:center;font-size:12px;color:#9a9080">
      Sent by AutoApply · <a href="http://localhost:3000/dashboard" style="color:#6da086;text-decoration:none">Open dashboard</a>
    </div>
  </div>
</body>
</html>`
}

export async function sendRunSummaryEmail(opts: SendRunSummaryOptions): Promise<void> {
  const pass = decrypt(opts.smtpPassEnc)
  const transporter = nodemailer.createTransport({
    host: opts.smtpHost,
    port: opts.smtpPort,
    secure: opts.smtpPort === 465,
    auth: { user: opts.smtpUser, pass },
  })

  const appliedCount = opts.applied.length
  const subject = appliedCount > 0
    ? `✅ AutoApply — Applied to ${appliedCount} job${appliedCount > 1 ? "s" : ""} today`
    : `📋 AutoApply — Run complete, ${opts.skipped.length} jobs skipped`

  await transporter.sendMail({
    from: `"AutoApply" <${opts.smtpUser}>`,
    to: opts.to,
    subject,
    html: buildHtml(opts),
  })
}
