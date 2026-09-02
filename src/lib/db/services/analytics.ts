import { and, desc, gt, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { appProjects, guestUsage, pageViews, users } from "@/lib/db/schema";
import { assertDbConfigured } from "./shared";

const PATH_MAX = 512;
const REFERRER_MAX = 1024;
const USER_AGENT_MAX = 512;
const IP_MAX = 128;
const SESSION_MAX = 128;

export function clipAnalyticsField(value: string | undefined | null, max: number): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max);
}

export async function recordPageView(
  path: string,
  sessionId?: string,
  userId?: string,
  ipAddress?: string,
  userAgent?: string,
  referrer?: string,
): Promise<void> {
  assertDbConfigured();
  const clippedPath = clipAnalyticsField(path, PATH_MAX);
  if (!clippedPath) return;
  await db.insert(pageViews).values({
    path: clippedPath,
    session_id: clipAnalyticsField(sessionId, SESSION_MAX),
    user_id: userId || null,
    ip_address: clipAnalyticsField(ipAddress, IP_MAX),
    user_agent: clipAnalyticsField(userAgent, USER_AGENT_MAX),
    referrer: clipAnalyticsField(referrer, REFERRER_MAX),
    created_at: new Date(),
  });
}

export async function getAnalyticsStats(days = 30): Promise<{
  days: number;
  totalPageViews: number;
  uniqueVisitors: number;
  totalUsers: number;
  totalProjects: number;
  totalGenerations: number;
  totalRefines: number;
  metricScopes: {
    totalPageViews: "period";
    uniqueVisitors: "period";
    totalUsers: "period";
    totalProjects: "period";
    totalGenerations: "all_time";
    totalRefines: "all_time";
  };
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

  const [totalUsers] = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(gt(users.created_at, startDate));
  const [totalProjects] = await db
    .select({ count: sql<number>`count(*)` })
    .from(appProjects)
    .where(gt(appProjects.created_at, startDate));

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
    days,
    totalPageViews: pageViewsCount?.count ?? 0,
    uniqueVisitors: uniqueVisitors?.count ?? 0,
    totalUsers: totalUsers?.count ?? 0,
    totalProjects: totalProjects?.count ?? 0,
    totalGenerations: guestTotals?.generations ?? 0,
    totalRefines: guestTotals?.refines ?? 0,
    metricScopes: {
      totalPageViews: "period",
      uniqueVisitors: "period",
      totalUsers: "period",
      totalProjects: "period",
      totalGenerations: "all_time",
      totalRefines: "all_time",
    },
    recentPageViews,
    dailyViews,
    topReferrers,
  };
}
