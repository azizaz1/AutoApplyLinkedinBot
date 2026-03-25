import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { encrypt } from "@/lib/crypto"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const { linkedinEmail, linkedinPassword, tanitjobsEmail, tanitjobsPassword, keejobEmail, keejobPassword, desiredLocation, remoteOnly, minMatchScore, maxApplicationsDay, linkedinEnabled, tanitjobsEnabled, keejobEnabled } = body

  const data: Record<string, unknown> = {}
  if (linkedinEmail)     data.linkedinEmail     = linkedinEmail
  if (linkedinPassword)  data.linkedinPassEnc   = encrypt(linkedinPassword)
  if (tanitjobsEmail)    data.tanitjobsEmail    = tanitjobsEmail
  if (tanitjobsPassword) data.tanitjobsPassEnc  = encrypt(tanitjobsPassword)
  if (keejobEmail)       data.keejobEmail       = keejobEmail
  if (keejobPassword)    data.keejobPassEnc     = encrypt(keejobPassword)
  if (desiredLocation)   data.desiredLocation   = desiredLocation
  if (remoteOnly !== undefined)         data.remoteOnly          = remoteOnly
  if (minMatchScore !== undefined)      data.minMatchScore       = minMatchScore
  if (maxApplicationsDay !== undefined) data.maxApplicationsDay  = maxApplicationsDay
  if (linkedinEnabled !== undefined)    data.linkedinEnabled     = linkedinEnabled
  if (tanitjobsEnabled !== undefined)   data.tanitjobsEnabled    = tanitjobsEnabled
  if (keejobEnabled !== undefined)      data.keejobEnabled       = keejobEnabled

  const profile = await prisma.profile.upsert({
    where:  { userId: session.user.id },
    create: { userId: session.user.id, ...data },
    update: data,
  })

  return NextResponse.json({ success: true, profile })
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const profile = await prisma.profile.findUnique({
    where: { userId: session.user.id },
    select: {
      linkedinEmail: true, tanitjobsEmail: true, keejobEmail: true,
      linkedinEnabled: true, tanitjobsEnabled: true, keejobEnabled: true,
      desiredLocation: true, remoteOnly: true, minMatchScore: true, maxApplicationsDay: true,
    },
  })

  return NextResponse.json({ profile })
}
