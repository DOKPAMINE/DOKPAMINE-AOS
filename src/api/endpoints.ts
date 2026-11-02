import { apiRequest, type ApiRequestOptions } from './client';
import type { BookDto, BookReviewSearchResponse, CatalogBook, LoginRequest, MeResponse, QuoteDto, ReviewDto, SessionDto, SignupRequest, SyncSnapshot, TokenResponse } from './types';

export const signup = (body: SignupRequest, signal?: AbortSignal) => apiRequest<TokenResponse>('/api/auth/signup', { method: 'POST', body, signal, authenticated: false });
export const login = (body: LoginRequest, signal?: AbortSignal) => apiRequest<TokenResponse>('/api/auth/login', { method: 'POST', body, signal, authenticated: false });
export const me = () => apiRequest<MeResponse>('/api/me');
export const catalogIsbn = (isbn: string) => apiRequest<CatalogBook>(`/api/catalog/isbn/${encodeURIComponent(isbn)}`);
export const catalogGenres = () => apiRequest<string[]>('/api/catalog/genres');
type SyncRequestOptions = Pick<ApiRequestOptions, 'accessToken' | 'signal'>;
export const putBook = (body: BookDto, options?: SyncRequestOptions) => apiRequest<BookDto>(`/api/books/${encodeURIComponent(body.id)}`, { method: 'PUT', body, ...options });
export const putSession = (body: SessionDto, options?: SyncRequestOptions) => apiRequest<SessionDto>(`/api/sessions/${encodeURIComponent(body.id)}`, { method: 'PUT', body, ...options });
export const putReview = (body: ReviewDto, options?: SyncRequestOptions) => apiRequest<ReviewDto>(`/api/reviews/${encodeURIComponent(body.id)}`, { method: 'PUT', body, ...options });
export const putQuote = (body: QuoteDto, options?: SyncRequestOptions) => apiRequest<QuoteDto>(`/api/quotes/${encodeURIComponent(body.id)}`, { method: 'PUT', body, ...options });
export const syncSnapshot = (options?: SyncRequestOptions) => apiRequest<SyncSnapshot>('/api/sync/snapshot', options);
export const searchBookReviews = (query: string) => apiRequest<BookReviewSearchResponse>(`/api/feed/books?query=${encodeURIComponent(query)}`);
