import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const schedule = await prisma.schedule.findUnique({ where: { userId: session.user.id } })
  return NextResponse.json(schedule ?? { enabled: false, time: "09:00", days: [1, 2, 3, 4, 5], lastRunAt: null })
}

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const { enabled, time, days } = body as { enabled: boolean; time: string; days: number[] }

  if (typeof enabled !== "boolean") return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  if (typeof time !== "string" || !/^\d{2}:\d{2}$/.test(time)) return NextResponse.json({ error: "Invalid time" }, { status: 400 })
  if (!Array.isArray(days) || days.some((d) => typeof d !== "number" || d < 0 || d > 6))
    return NextResponse.json({ error: "Invalid days" }, { status: 400 })

  const schedule = await prisma.schedule.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, enabled, time, days },
    update: { enabled, time, days },
  })

  return NextResponse.json(schedule)
}
