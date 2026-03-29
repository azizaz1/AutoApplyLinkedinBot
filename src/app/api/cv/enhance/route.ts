import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { enhanceCVSection } from "@/lib/claude"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { section, text, context } = await req.json()
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 })

  const enhanced = await enhanceCVSection(section, text, context)
  return NextResponse.json({ enhanced })
}

export const runtime = "nodejs"
