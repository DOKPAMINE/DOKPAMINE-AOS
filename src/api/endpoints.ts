import { apiRequest, type ApiRequestOptions } from './client';
import type { BookDto, BookReviewSearchResponse, CatalogBook, FeedItem, FeedListResponse, LoginRequest, MeResponse, PatchMeRequest, QuoteDto, ReviewDto, ReviewLikeResponse, SessionDto, SignupRequest, SyncSnapshot, TokenResponse, WeeklyRankingResponse } from './types';

export const signup = (body: SignupRequest, signal?: AbortSignal) => apiRequest<TokenResponse>('/api/auth/signup', { method: 'POST', body, signal, authenticated: false });
export const login = (body: LoginRequest, signal?: AbortSignal) => apiRequest<TokenResponse>('/api/auth/login', { method: 'POST', body, signal, authenticated: false });
export const me = () => apiRequest<MeResponse>('/api/me');
export const patchMe = (body: PatchMeRequest) => apiRequest<MeResponse>('/api/me', { method: 'PATCH', body });
export const weeklyRanking = (weekStart?: string, signal?: AbortSignal) => apiRequest<WeeklyRankingResponse>(
    `/api/ranking/weekly${weekStart === undefined ? '' : `?weekStart=${encodeURIComponent(weekStart)}`}`, { signal },
);
export const catalogIsbn = (isbn: string) => apiRequest<CatalogBook>(`/api/catalog/isbn/${encodeURIComponent(isbn)}`);
export const catalogGenres = () => apiRequest<string[]>('/api/catalog/genres');
type SyncRequestOptions = Pick<ApiRequestOptions, 'accessToken' | 'signal'>;
export const putBook = (body: BookDto, options?: SyncRequestOptions) => apiRequest<BookDto>(`/api/books/${encodeURIComponent(body.id)}`, { method: 'PUT', body, ...options });
export const putSession = (body: SessionDto, options?: SyncRequestOptions) => apiRequest<SessionDto>(`/api/sessions/${encodeURIComponent(body.id)}`, { method: 'PUT', body, ...options });
export const putReview = (body: ReviewDto, options?: SyncRequestOptions) => apiRequest<ReviewDto>(`/api/reviews/${encodeURIComponent(body.id)}`, { method: 'PUT', body, ...options });
export const putQuote = (body: QuoteDto, options?: SyncRequestOptions) => apiRequest<QuoteDto>(`/api/quotes/${encodeURIComponent(body.id)}`, { method: 'PUT', body, ...options });
export const syncSnapshot = (options?: SyncRequestOptions) => apiRequest<SyncSnapshot>('/api/sync/snapshot', options);
export const searchBookReviews = (query: string) => apiRequest<BookReviewSearchResponse>(`/api/feed/books?query=${encodeURIComponent(query)}`);
export const feedList = (signal?: AbortSignal) => apiRequest<FeedListResponse>('/api/feed', { signal });
export const feedItem = (id: string, signal?: AbortSignal) => apiRequest<FeedItem>(`/api/feed/${encodeURIComponent(id)}`, { signal });
export const likeReview = (id: string) => apiRequest<ReviewLikeResponse>(`/api/feed/${encodeURIComponent(id)}/like`, { method: 'POST' });
export const unlikeReview = (id: string) => apiRequest<ReviewLikeResponse>(`/api/feed/${encodeURIComponent(id)}/like`, { method: 'DELETE' });
