/** DOKPAMINE-BE/docs/API.md. 시각은 ISO-8601 UTC, ID는 클라이언트 UUID다. */
export interface MeResponse {
    id: string;
    email: string;
    nickname: string;
    rankingOptIn: boolean;
}

export interface TokenResponse {
    accessToken: string;
    expiresAt: string;
    user: MeResponse;
}

export interface LoginRequest {
    email: string;
    password: string;
}

export interface SignupRequest extends LoginRequest {
    nickname: string;
}

export interface CatalogBook {
    isbn: string;
    title?: string | null;
    author?: string | null;
    publisher?: string | null;
    totalPages?: number | null;
    genre?: string | null;
    coverUrl?: string | null;
    source: 'nlk' | 'kakao' | 'google' | 'openlibrary';
}

export interface BookDto {
    id: string;
    isbn?: string | null;
    title: string;
    author: string;
    publisher?: string | null;
    totalPages: number;
    genre: string;
    coverUrl?: string | null;
    status: 'WANT' | 'READING' | 'DONE';
    currentPage: number;
    completedCount: number;
    completedAt?: string | null;
    deleted: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface SessionDto {
    id: string;
    bookId: string;
    startedAt: string;
    endedAt: string;
    activeSeconds: number;
    startPage: number;
    endPage?: number | null;
    source: 'TIMER' | 'MANUAL';
    deleted: boolean;
    createdAt: string;
}

export interface ReviewDto {
    id: string;
    bookId: string;
    oneLine?: string | null;
    body?: string | null;
    visibility: 'PRIVATE' | 'PUBLIC';
    deleted: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface QuoteDto {
    id: string;
    bookId: string;
    text: string;
    page?: number | null;
    memo?: string | null;
    deleted: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface SyncSnapshot {
    books: BookDto[];
    sessions: SessionDto[];
    reviews: ReviewDto[];
    quotes: QuoteDto[];
}

export interface FeedItem {
    id: string;
    nickname: string;
    bookTitle: string;
    bookAuthor: string;
    genre: string;
    oneLine?: string | null;
    body?: string | null;
    publishedAt?: string | null;
    likeCount: number;
    likedByMe: boolean;
    mine: boolean;
}

export interface BookReviewGroup {
    bookKey: string;
    bookTitle: string;
    bookAuthor: string;
    isbn?: string | null;
    reviews: FeedItem[];
}

export type BookReviewSearchResponse = BookReviewGroup[];
