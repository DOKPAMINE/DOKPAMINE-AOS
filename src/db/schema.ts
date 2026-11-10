import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { Genre } from '../domain/pageRules';

export type ReviewConflict = {
    latest?: { oneLine: string | null; body: string | null; visibility: 'PRIVATE' | 'PUBLIC'; version: number } | null;
};

const recordColumns = () => ({
    // ID는 호출자가 만든 UUID를 그대로 저장한다(특히 타이머 시작 시 생성한 세션 ID).
    id: text('id').primaryKey().notNull(),
    createdAt: integer('created_at').notNull(),
    syncPending: integer('sync_pending', { mode: 'boolean' }).notNull().default(true),
    localVersion: integer('local_version').notNull(),
    deleted: integer('deleted', { mode: 'boolean' }).notNull().default(false),
});

/** PRD 8장 / NFR-04~06: 개인 기록만 저장하며 계정 비밀값은 포함하지 않는다. */
export const books = sqliteTable('books', {
    ...recordColumns(),
    isbn: text('isbn'),
    title: text('title').notNull(),
    author: text('author').notNull(),
    publisher: text('publisher'),
    totalPages: integer('total_pages').notNull(),
    genre: text('genre').$type<Genre>().notNull(),
    coverUrl: text('cover_url'),
    status: text('status', { enum: ['WANT', 'READING', 'DONE'] }).notNull().default('READING'),
    currentPage: integer('current_page').notNull().default(0),
    completedCount: integer('completed_count').notNull().default(0),
    completedAt: integer('completed_at'),
    updatedAt: integer('updated_at').notNull(),
}, table => [
    check('books_total_pages', sql`${table.totalPages} >= 1`),
    check('books_current_page', sql`${table.currentPage} >= 0 AND ${table.currentPage} <= ${table.totalPages}`),
    check('books_status', sql`${table.status} IN ('WANT', 'READING', 'DONE')`),
]);

export const sessions = sqliteTable('sessions', {
    ...recordColumns(),
    bookId: text('book_id').notNull().references(() => books.id),
    startedAt: integer('started_at').notNull(),
    endedAt: integer('ended_at').notNull(),
    activeSeconds: integer('active_seconds').notNull(),
    startPage: integer('start_page').notNull(),
    endPage: integer('end_page'),
    source: text('source', { enum: ['TIMER', 'MANUAL'] }).notNull(),
}, table => [
    index('sessions_book_id').on(table.bookId),
    check('sessions_pages', sql`${table.startPage} >= 0 AND (${table.endPage} IS NULL OR ${table.endPage} >= 0)`),
    check('sessions_time', sql`${table.activeSeconds} >= 0 AND ${table.endedAt} >= ${table.startedAt}`),
    check('sessions_source', sql`${table.source} IN ('TIMER', 'MANUAL')`),
]);

export const reviews = sqliteTable('reviews', {
    ...recordColumns(),
    bookId: text('book_id').notNull().references(() => books.id),
    oneLine: text('one_line'),
    body: text('body'),
    visibility: text('visibility', { enum: ['PRIVATE', 'PUBLIC'] }).notNull().default('PRIVATE'),
    publishedAt: integer('published_at'),
    serverVersion: integer('server_version'),
    conflict: text('conflict', { mode: 'json' }).$type<ReviewConflict>(),
    updatedAt: integer('updated_at').notNull(),
}, table => [
    index('reviews_book_id').on(table.bookId),
    check('reviews_length', sql`length(coalesce(${table.oneLine}, '')) <= 100 AND length(coalesce(${table.body}, '')) <= 5000`),
    check('reviews_content', sql`length(trim(coalesce(${table.oneLine}, ''))) > 0 OR length(trim(coalesce(${table.body}, ''))) > 0`),
    check('reviews_visibility', sql`${table.visibility} IN ('PRIVATE', 'PUBLIC')`),
]);

export const quotes = sqliteTable('quotes', {
    ...recordColumns(),
    bookId: text('book_id').notNull().references(() => books.id),
    text: text('text').notNull(),
    page: integer('page'),
    memo: text('memo'),
    updatedAt: integer('updated_at').notNull(),
}, table => [
    index('quotes_book_id').on(table.bookId),
    check('quotes_length', sql`length(${table.text}) BETWEEN 1 AND 1000 AND length(coalesce(${table.memo}, '')) <= 500`),
    check('quotes_page', sql`${table.page} IS NULL OR ${table.page} >= 0`),
]);

export type BookRecord = typeof books.$inferSelect;
export type SessionRecord = typeof sessions.$inferSelect;
export type ReviewRecord = typeof reviews.$inferSelect;
export type QuoteRecord = typeof quotes.$inferSelect;
