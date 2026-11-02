import { apiRequest } from './client';
import type { BookDto, BookReviewSearchResponse, CatalogBook, LoginRequest, MeResponse, QuoteDto, ReviewDto, SessionDto, SignupRequest, SyncSnapshot, TokenResponse } from './types';

export const signup = (body: SignupRequest) => apiRequest<TokenResponse>('/api/auth/signup', { method: 'POST', body, authenticated: false });
export const login = (body: LoginRequest) => apiRequest<TokenResponse>('/api/auth/login', { method: 'POST', body, authenticated: false });
export const me = () => apiRequest<MeResponse>('/api/me');
export const catalogIsbn = (isbn: string) => apiRequest<CatalogBook>(`/api/catalog/isbn/${encodeURIComponent(isbn)}`);
export const catalogGenres = () => apiRequest<string[]>('/api/catalog/genres');
export const putBook = (body: BookDto) => apiRequest<BookDto>(`/api/books/${encodeURIComponent(body.id)}`, { method: 'PUT', body });
export const putSession = (body: SessionDto) => apiRequest<SessionDto>(`/api/sessions/${encodeURIComponent(body.id)}`, { method: 'PUT', body });
export const putReview = (body: ReviewDto) => apiRequest<ReviewDto>(`/api/reviews/${encodeURIComponent(body.id)}`, { method: 'PUT', body });
export const putQuote = (body: QuoteDto) => apiRequest<QuoteDto>(`/api/quotes/${encodeURIComponent(body.id)}`, { method: 'PUT', body });
export const syncSnapshot = () => apiRequest<SyncSnapshot>('/api/sync/snapshot');
export const searchBookReviews = (query: string) => apiRequest<BookReviewSearchResponse>(`/api/feed/books?query=${encodeURIComponent(query)}`);
