import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ authenticated: false })
  }

  const applications = await prisma.application.findMany({
    where: { userId: session.user.id },
    include: { job: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  })

  return NextResponse.json({
    authenticated: true,
    sessionUser: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    },
    applicationCount: applications.length,
    applications: applications.map((application) => ({
      id: application.id,
      userId: application.userId,
      status: application.status,
      title: application.job.title,
      company: application.job.company,
    })),
  })
}

export const runtime = "nodejs"
