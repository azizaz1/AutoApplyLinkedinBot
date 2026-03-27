import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userId = session.user.id

  const applications = await prisma.application.findMany({
    where: { userId },
    include: { job: { select: { platform: true, company: true, title: true, url: true } } },
    orderBy: { createdAt: "desc" },
  })

  const total = applications.length
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekStart = new Date(todayStart)
  weekStart.setDate(weekStart.getDate() - 7)

  const applied    = applications.filter(a => a.status === "APPLIED").length
  const interviews = applications.filter(a => a.status === "INTERVIEW").length
  const failed     = applications.filter(a => a.status === "FAILED").length
  const rejected   = applications.filter(a => a.status === "REJECTED").length
  const pending    = applications.filter(a => a.status === "PENDING").length
  const offers     = applications.filter(a => a.status === "OFFER").length

  const getDate = (a: (typeof applications)[0]) => new Date(a.appliedAt ?? a.createdAt)

  const todayCount    = applications.filter(a => getDate(a) >= todayStart).length
  const thisWeekCount = applications.filter(a => getDate(a) >= weekStart).length

  const scores = applications.map(a => a.matchScore).filter(s => s > 0)
  const avgMatchScore = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0

  // Applications per day — last 30 days
  const thirtyDaysAgo = new Date(todayStart)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29)

  const byDay: { date: string; count: number }[] = []
  for (let i = 0; i < 30; i++) {
    const day = new Date(thirtyDaysAgo)
    day.setDate(day.getDate() + i)
    const nextDay = new Date(day)
    nextDay.setDate(nextDay.getDate() + 1)
    const count = applications.filter(a => {
      const d = getDate(a)
      return d >= day && d < nextDay
    }).length
    byDay.push({ date: day.toISOString().split("T")[0], count })
  }

  // Streak: consecutive days (going back from today) with at least 1 application
  let streak = 0
  for (let i = byDay.length - 1; i >= 0; i--) {
    if (byDay[i].count > 0) streak++
    else break
  }

  // Status breakdown (only show non-zero)
  const byStatus = [
    { status: "APPLIED",   count: applied,    color: "#6da086" },
    { status: "INTERVIEW", count: interviews,  color: "#f09b61" },
    { status: "OFFER",     count: offers,      color: "#4d9c73" },
    { status: "PENDING",   count: pending,     color: "#c8b99a" },
    { status: "FAILED",    count: failed,      color: "#e07070" },
    { status: "REJECTED",  count: rejected,    color: "#cc7777" },
  ].filter(s => s.count > 0)

  // Platform breakdown
  const platformCounts: Record<string, number> = {}
  for (const app of applications) {
    const p = app.job?.platform ?? "UNKNOWN"
    platformCounts[p] = (platformCounts[p] ?? 0) + 1
  }
  const byPlatform = Object.entries(platformCounts)
    .map(([platform, count]) => ({ platform, count }))
    .sort((a, b) => b.count - a.count)

  // Top companies
  const companyCounts: Record<string, number> = {}
  for (const app of applications) {
    const c = app.job?.company ?? "Unknown"
    companyCounts[c] = (companyCounts[c] ?? 0) + 1
  }
  const topCompanies = Object.entries(companyCounts)
    .map(([company, count]) => ({ company, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  // Recent activity (last 12)
  const recentActivity = applications.slice(0, 12).map(a => ({
    date:    (a.appliedAt ?? a.createdAt).toISOString(),
    title:   a.job?.title   ?? "Unknown position",
    company: a.job?.company ?? "Unknown company",
    url:     a.job?.url     ?? null,
    status:  a.status,
  }))

  return NextResponse.json({
    overview: {
      total, applied, interviews, failed, rejected, pending, offers,
      todayCount, thisWeekCount, avgMatchScore, streak,
      successRate: applied > 0 ? Math.round((interviews / applied) * 100) : 0,
    },
    byDay,
    byStatus,
    byPlatform,
    topCompanies,
    recentActivity,
  })
}
