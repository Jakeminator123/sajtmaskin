import { and, asc, count, eq, gte, ilike, lte, sql } from 'drizzle-orm';
import { db } from './index';
import { books } from './schema';
import type { SearchParams } from '../url-state';

const PAGE_SIZE = 20;

function toNumber(value?: string) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function getBooks(params: SearchParams) {
  const page = Math.max(1, toNumber(params.page) ?? 1);
  const offset = (page - 1) * PAGE_SIZE;

  const conditions = [
    params.search
      ? ilike(books.title, `%${params.search}%`)
      : undefined,
    params.isbn ? eq(books.isbn, params.isbn) : undefined,
    params.lng ? eq(books.language, params.lng) : undefined,
    params.yr ? eq(books.publishedYear, toNumber(params.yr) ?? -1) : undefined,
    params.pgs ? gte(books.pageCount, toNumber(params.pgs) ?? 0) : undefined,
    params.rtg ? gte(books.averageRating, toNumber(params.rtg) ?? 0) : undefined,
  ].filter(Boolean);

  const whereClause = conditions.length ? and(...conditions) : undefined;

  const rows = await db
    .select()
    .from(books)
    .where(whereClause)
    .orderBy(asc(books.title))
    .limit(PAGE_SIZE)
    .offset(offset);

  const totalResult = await db
    .select({ total: count() })
    .from(books)
    .where(whereClause);

  return {
    rows,
    page,
    pageSize: PAGE_SIZE,
    total: totalResult[0]?.total ?? 0,
  };
}

export async function getFilterOptions() {
  const languages = await db
    .selectDistinct({ value: books.language })
    .from(books)
    .where(sql`${books.language} is not null`)
    .orderBy(asc(books.language));

  return {
    languages: languages.map((item) => item.value).filter(Boolean),
  };
}
