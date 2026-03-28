import Groq from "groq-sdk"

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
})

export interface ParsedCV {
  fullName: string
  currentTitle: string
  summary: string
  yearsExperience: number
  skills: string[]
  languages: string[]
  education: { degree: string; school: string; year?: number }[]
  experience: { title: string; company: string; from: string; to: string; description: string }[]
}

export async function parseCV(rawText: string): Promise<ParsedCV> {
  const response = await groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    messages: [
      {
        role: "user",
        content: `Extract structured information from this CV. Return ONLY valid JSON, no markdown, no explanation.

Return this exact JSON shape:
{
  "fullName": "string",
  "currentTitle": "string",
  "summary": "string",
  "yearsExperience": 0,
  "skills": ["string"],
  "languages": ["string"],
  "education": [{"degree": "string", "school": "string", "year": null}],
  "experience": [{"title": "string", "company": "string", "from": "string", "to": "string", "description": "string"}]
}

CV TEXT:
${rawText}`,
      },
    ],
  })
  const text = response.choices[0].message.content || ""
  const clean = text.replace(/```json|```/g, "").trim()
  return JSON.parse(clean) as ParsedCV
}

export async function enhanceCVSection(
  section: "summary" | "experience_description",
  text: string,
  context?: { title?: string; company?: string }
): Promise<string> {
  const prompt =
    section === "summary"
      ? `Rewrite this professional CV summary to be more impactful, concise, and ATS-friendly. Use strong action-oriented language. Return ONLY the improved text, no quotes, no explanation.\n\nOriginal:\n${text}`
      : `Rewrite this job experience description to be more impactful and ATS-friendly. Use bullet-point style with strong action verbs and quantifiable achievements where possible. Role: ${context?.title} at ${context?.company}. Return ONLY the improved text.\n\nOriginal:\n${text}`

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: prompt }],
  })
  return (response.choices[0].message.content || text).trim()
}

export interface CVScoreResult {
  overall: number
  sections: {
    summary: number
    skills: number
    experience: number
    education: number
  }
  suggestions: string[]
  missingKeywords: string[]
  strengths: string[]
}

export async function optimizeCV(
  cv: ParsedCV,
  targetRole?: string
): Promise<CVScoreResult> {
  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "user",
        content: `You are a professional CV reviewer. Analyze this CV and return a detailed score. Return ONLY valid JSON, no markdown.

JSON shape:
{
  "overall": 0,
  "sections": { "summary": 0, "skills": 0, "experience": 0, "education": 0 },
  "suggestions": ["string", "string", "string", "string", "string"],
  "missingKeywords": ["string"],
  "strengths": ["string", "string", "string"]
}

Rules:
- Scores are 0-100
- suggestions: exactly 5 specific, actionable improvements
- missingKeywords: important keywords/skills missing for ${targetRole || "a software engineer role"}
- strengths: top 3 strong points of this CV

CV DATA:
Name: ${cv.fullName}
Title: ${cv.currentTitle}
Summary: ${cv.summary}
Experience: ${cv.yearsExperience} years
Skills: ${cv.skills.join(", ")}
Languages: ${cv.languages.join(", ")}
Education: ${cv.education.map((e) => `${e.degree} at ${e.school}`).join("; ")}
Experience entries: ${cv.experience.map((e) => `${e.title} at ${e.company} (${e.from}-${e.to}): ${e.description.slice(0, 120)}`).join(" | ")}`,
      },
    ],
  })
  const text = response.choices[0].message.content || ""
  const clean = text.replace(/```json|```/g, "").trim()
  return JSON.parse(clean) as CVScoreResult
}

export interface JobMatchResult {
  score: number
  reason: string
  shouldApply: boolean
}

export async function scoreJobMatch(
  jobTitle: string,
  jobDescription: string,
  profile: {
    currentTitle: string
    skills: string[]
    yearsExperience: number
    summary: string
  }
): Promise<JobMatchResult> {
  const response = await groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    messages: [
      {
        role: "user",
        content: `Score how well this candidate matches this job. Return ONLY valid JSON, no markdown.

{
  "score": 0,
  "reason": "string",
  "shouldApply": true
}

CANDIDATE:
- Title: ${profile.currentTitle}
- Skills: ${profile.skills.join(", ")}
- Experience: ${profile.yearsExperience} years
- Summary: ${profile.summary}

JOB:
Title: ${jobTitle}
Description: ${jobDescription.slice(0, 1500)}`,
      },
    ],
  })
  const text = response.choices[0].message.content || ""
  const clean = text.replace(/```json|```/g, "").trim()
  return JSON.parse(clean) as JobMatchResult
}