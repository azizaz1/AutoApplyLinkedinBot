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