import { and, desc, gt, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { appProjects, guestUsage, pageViews, users } from "@/lib/db/schema";
import { assertDbConfigured } from "./shared";

export async function recordPageView(
  path: string,
  sessionId?: string,
  userId?: string,
  ipAddress?: string,
  userAgent?: string,
  referrer?: string,
): Promise<void> {
  assertDbConfigured();
  await db.insert(pageViews).values({
    path,
    session_id: sessionId || null,
    user_id: userId || null,
    ip_address: ipAddress || null,
    user_agent: userAgent || null,
    referrer: referrer || null,
    created_at: new Date(),
  });
}

export async function getAnalyticsStats(days = 30): Promise<{
  totalPageViews: number;
  uniqueVisitors: number;
  totalUsers: number;
  totalProjects: number;
  totalGenerations: number;
  totalRefines: number;
  recentPageViews: { path: string; count: number }[];
  dailyViews: { date: string; views: number; unique: number }[];
  topReferrers: { referrer: string; count: number }[];
}> {
  assertDbConfigured();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const [pageViewsCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(pageViews)
    .where(gt(pageViews.created_at, startDate));

  const [uniqueVisitors] = await db
    .select({
      count: sql<number>`count(distinct coalesce(${pageViews.session_id}, ${pageViews.ip_address}))`,
    })
    .from(pageViews)
    .where(gt(pageViews.created_at, startDate));

  const [totalUsers] = await db.select({ count: sql<number>`count(*)` }).from(users);
  const [totalProjects] = await db.select({ count: sql<number>`count(*)` }).from(appProjects);

  const [guestTotals] = await db
    .select({
      generations: sql<number>`coalesce(sum(${guestUsage.generations_used}), 0)`,
      refines: sql<number>`coalesce(sum(${guestUsage.refines_used}), 0)`,
    })
    .from(guestUsage);

  const recentPageViews = await db
    .select({ path: pageViews.path, count: sql<number>`count(*)` })
    .from(pageViews)
    .where(gt(pageViews.created_at, startDate))
    .groupBy(pageViews.path)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

  const dailyViews = await db
    .select({
      date: sql<string>`to_char(${pageViews.created_at}::date, 'YYYY-MM-DD')`,
      views: sql<number>`count(*)`,
      unique: sql<number>`count(distinct coalesce(${pageViews.session_id}, ${pageViews.ip_address}))`,
    })
    .from(pageViews)
    .where(gt(pageViews.created_at, startDate))
    .groupBy(sql`${pageViews.created_at}::date`)
    .orderBy(sql`${pageViews.created_at}::date`);

  const topReferrersRaw = await db
    .select({ referrer: pageViews.referrer, count: sql<number>`count(*)` })
    .from(pageViews)
    .where(and(gt(pageViews.created_at, startDate), sql`${pageViews.referrer} IS NOT NULL`))
    .groupBy(pageViews.referrer)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

  const topReferrers = topReferrersRaw.filter(
    (referrer): referrer is { referrer: string; count: number } => referrer.referrer !== null,
  );

  return {
    totalPageViews: pageViewsCount?.count ?? 0,
    uniqueVisitors: uniqueVisitors?.count ?? 0,
    totalUsers: totalUsers?.count ?? 0,
    totalProjects: totalProjects?.count ?? 0,
    totalGenerations: guestTotals?.generations ?? 0,
    totalRefines: guestTotals?.refines ?? 0,
    recentPageViews,
    dailyViews,
    topReferrers,
  };
}
