import Groq from "groq-sdk"

const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null

export interface GroqApplicantProfile {
  fullName?: string | null
  currentTitle?: string | null
  summary?: string | null
  yearsExperience?: number | null
  skills?: string[]
  languages?: string[]
  desiredTitles?: string[]
  desiredLocation?: string | null
  remoteOnly?: boolean | null
}

export interface GroqFieldDecision {
  answer: string
  confidence: number
  shouldPause: boolean
  reason: string
}

export interface GroqTitleSuggestion {
  titles: string[]
  reason: string
}

export interface GroqCoverLetterParams {
  applicant: GroqApplicantProfile
  job: {
    title: string
    company: string
    location: string
    description?: string
  }
}

interface AskGroqParams {
  question: string
  fieldType: "text" | "select" | "radio" | "checkbox"
  options?: string[]
  applicant: GroqApplicantProfile
  job: {
    title: string
    company: string
    location: string
  }
}

function cleanJson(text: string) {
  return text.replace(/```json|```/gi, "").trim()
}

function extractJsonObject(text: string) {
  const cleaned = cleanJson(text)

  try {
    return JSON.parse(cleaned)
  } catch {}

  const firstBrace = cleaned.indexOf("{")
  if (firstBrace === -1) {
    throw new Error("No JSON object found in model response")
  }

  let depth = 0
  let inString = false
  let escaped = false

  for (let i = firstBrace; i < cleaned.length; i++) {
    const char = cleaned[i]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === "\\") {
        escaped = true
      } else if (char === "\"") {
        inString = false
      }
      continue
    }

    if (char === "\"") {
      inString = true
      continue
    }

    if (char === "{") {
      depth++
    } else if (char === "}") {
      depth--
      if (depth === 0) {
        return JSON.parse(cleaned.slice(firstBrace, i + 1))
      }
    }
  }

  throw new Error("Incomplete JSON object in model response")
}

export async function suggestJobTitlesFromProfile(applicant: GroqApplicantProfile): Promise<GroqTitleSuggestion | null> {
  if (!groq) return null

  const response = await groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You create job-search title suggestions from a candidate profile. Return only valid JSON with concise, searchable role titles.",
      },
      {
        role: "user",
        content: `Return ONLY valid JSON with this exact shape:
{"titles":["string"],"reason":"string"}

APPLICANT:
${JSON.stringify(applicant, null, 2)}

Rules:
- Suggest 8 to 12 concise job titles the candidate should search for on job platforms.
- Base the titles only on the applicant profile.
- Prefer titles that are likely to appear on LinkedIn searches.
- Avoid duplicates.
- Keep each title short, natural, and searchable.`,
      },
    ],
  })

  const text = response.choices[0]?.message?.content || ""
  const parsed = extractJsonObject(text) as { titles?: unknown; reason?: unknown }
  const titles = Array.isArray(parsed.titles)
    ? parsed.titles.map((title) => String(title || "").trim()).filter(Boolean)
    : []

  if (!titles.length) return null

  return {
    titles: Array.from(new Set(titles)).slice(0, 12),
    reason: String(parsed.reason || "").trim(),
  }
}

export async function askGroqForFieldAnswer(params: AskGroqParams): Promise<GroqFieldDecision | null> {
  if (!groq) return null

  const optionsText = (params.options || []).filter(Boolean).join(" | ") || "none"

  const response = await groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You answer job application form questions using only the applicant profile provided. Return only valid JSON. Be conservative. If the question is ambiguous or high-risk, set shouldPause to true.",
      },
      {
        role: "user",
        content: `Return ONLY valid JSON with this exact shape:
{"answer":"string","confidence":0,"shouldPause":false,"reason":"string"}

FIELD TYPE: ${params.fieldType}
QUESTION: ${params.question}
OPTIONS: ${optionsText}

JOB:
- Title: ${params.job.title}
- Company: ${params.job.company}
- Location: ${params.job.location}

APPLICANT:
${JSON.stringify(params.applicant, null, 2)}

Rules:
- Use only information present in the applicant profile or obvious direct derivations.
- For yes/no questions, answer yes or no.
- For numeric experience questions, answer with a plain number string like "4".
- If the question asks about salary, visa, sponsorship, legal authorization, relocation, B2B, payroll, or geographic eligibility and the profile is not explicit, set shouldPause to true.
- confidence must be 0 to 100.`,
      },
    ],
  })

  const text = response.choices[0]?.message?.content || ""
  const parsed = extractJsonObject(text) as GroqFieldDecision

  return {
    answer: String(parsed.answer || "").trim(),
    confidence: Number.isFinite(parsed.confidence) ? parsed.confidence : 0,
    shouldPause: Boolean(parsed.shouldPause),
    reason: String(parsed.reason || "").trim(),
  }
}

export async function generateFrenchCoverLetter(params: GroqCoverLetterParams): Promise<string | null> {
  if (!groq) return null

  const response = await groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    temperature: 0.4,
    messages: [
      {
        role: "system",
        content:
          "You write short French cover letters for job applications using only the applicant profile and job context provided. Return only the letter text, no markdown and no intro.",
      },
      {
        role: "user",
        content: `Rédige une lettre de motivation courte en français, naturelle et professionnelle.

Contraintes:
- 120 à 180 mots.
- Adapter la lettre au poste et à l'entreprise.
- Utiliser uniquement les informations présentes dans le profil candidat ou le contexte du poste.
- Ton direct, humain, crédible.
- Pas de liste à puces.
- Retourne uniquement la lettre finale.

POSTE:
${JSON.stringify(params.job, null, 2)}

PROFIL CANDIDAT:
${JSON.stringify(params.applicant, null, 2)}`,
      },
    ],
  })

  const text = response.choices[0]?.message?.content || ""
  const letter = cleanJson(text).trim()
  return letter || null
}
