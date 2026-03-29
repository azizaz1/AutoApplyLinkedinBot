import { NextRequest, NextResponse } from "next/server"
import Groq from "groq-sdk"

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Extension-Secret",
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() })
}

export async function POST(req: NextRequest) {
  const secret = process.env.EXTENSION_SECRET || ""
  if (!secret || req.headers.get("X-Extension-Secret") !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders() })
  }

  const { question, fieldType, min, max, profile } = await req.json()

  const profileContext = profile
    ? `Candidate: ${profile.fullName}, ${profile.currentTitle}, ${profile.yearsExperience} years experience. Skills: ${profile.skills?.slice(0, 10).join(", ")}.`
    : "No profile available."

  const isHowMany = /how many|number of|how much|years of|months of/i.test(question)

  const prompt = (fieldType === "number" || isHowMany)
    ? `A job application form asks: "${question}"
Rules:
- Return ONLY a single integer or decimal number, nothing else
- No words, no units, no explanation — just the number (e.g. "5" or "3.5")
- The number must be${min !== undefined ? ` larger than ${min}` : " greater than 0"}${max !== undefined ? ` and no more than ${max}` : ""}
- Never return 0 or a negative number
- Be honest but reasonable based on the candidate profile
${profileContext}`
    : `A job application form asks: "${question}"
${profileContext}
Reply with ONLY the answer value, no explanation. Be concise (1-5 words or a number). Be honest but present the candidate positively.`

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 50,
  })

  let answer = (response.choices[0].message.content || "").trim().replace(/['"]/g, "")
  // For number/how-many questions, extract just the first number found
  if (fieldType === "number" || isHowMany) {
    const numMatch = answer.match(/\d+(\.\d+)?/)
    if (numMatch) answer = numMatch[0]
  }

  return Response.json({ answer }, { headers: corsHeaders() })
}

export const runtime = "nodejs"
