import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { parseCV } from "@/lib/claude"
import path from "path"
import fs from "fs/promises"
import pdfParse from "pdf-parse"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const formData = await req.formData()
    const file = formData.get("cv") as File | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }
    if (!file.name.endsWith(".pdf")) {
      return NextResponse.json({ error: "Only PDF files are accepted" }, { status: 400 })
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 })
    }

    // Save file to disk (use S3 in production)
    const uploadDir = path.join(process.cwd(), "public", "uploads", session.user.id)
    await fs.mkdir(uploadDir, { recursive: true })
    const fileName = `cv_${Date.now()}.pdf`
    const filePath = path.join(uploadDir, fileName)
    const buffer = Buffer.from(await file.arrayBuffer())
    await fs.writeFile(filePath, buffer)

    // Extract text from PDF
    const pdfData = await pdfParse(buffer)
    const rawText = pdfData.text

    if (!rawText || rawText.length < 100) {
      return NextResponse.json({ error: "Could not extract text from PDF" }, { status: 422 })
    }

    // Parse with Claude
    const parsed = await parseCV(rawText)

    // Save to DB
    const profile = await prisma.profile.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        cvFileName: file.name,
        cvFileUrl: `/uploads/${session.user.id}/${fileName}`,
        cvParsedAt: new Date(),
        fullName: parsed.fullName,
        currentTitle: parsed.currentTitle,
        summary: parsed.summary,
        yearsExperience: parsed.yearsExperience,
        skills: parsed.skills,
        languages: parsed.languages,
        education: parsed.education,
        experience: parsed.experience,
      },
      update: {
        cvFileName: file.name,
        cvFileUrl: `/uploads/${session.user.id}/${fileName}`,
        cvParsedAt: new Date(),
        fullName: parsed.fullName,
        currentTitle: parsed.currentTitle,
        summary: parsed.summary,
        yearsExperience: parsed.yearsExperience,
        skills: parsed.skills,
        languages: parsed.languages,
        education: parsed.education,
        experience: parsed.experience,
      },
    })

    return NextResponse.json({ success: true, profile, parsed })
  } catch (err) {
    console.error("CV upload error:", err)
    return NextResponse.json({ error: "Failed to process CV" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const { fullName, currentTitle, summary, yearsExperience, skills, languages, education, experience } = body

  const profile = await prisma.profile.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      fullName, currentTitle, summary, yearsExperience,
      skills: skills || [],
      languages: languages || [],
      education: education || [],
      experience: experience || [],
      cvParsedAt: new Date(),
    },
    update: {
      fullName, currentTitle, summary, yearsExperience,
      skills: skills || [],
      languages: languages || [],
      education: education || [],
      experience: experience || [],
    },
  })

  return NextResponse.json({ success: true, profile })
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const profile = await prisma.profile.findUnique({
    where: { userId: session.user.id },
  })
  return NextResponse.json({ profile })
}

export const runtime = "nodejs"
