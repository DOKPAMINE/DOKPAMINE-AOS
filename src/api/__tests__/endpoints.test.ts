import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import * as SecureStore from 'expo-secure-store';

import { catalogGenres, catalogIsbn, feedItem, feedList, likeReview, login, me, putBook, putQuote, putReview, putSession, searchBookReviews, signup, syncSnapshot, unlikeReview } from '../endpoints';
import type { BookDto, BookReviewSearchResponse, CatalogBook, MeResponse, QuoteDto, ReviewDto, SessionDto, TokenResponse } from '../types';

jest.mock('@react-native-community/netinfo', () => ({ __esModule: true, default: { fetch: jest.fn() } }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn() }));

const fetchMock = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();
const originalFetch = globalThis.fetch;
const originalBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
const timestamp = '2026-10-29T16:30:00Z';
const book: BookDto = {
    id: '00000000-0000-4000-8000-000000000001', title: '데미안', author: '헤르만 헤세', totalPages: 240,
    genre: '소설', status: 'READING', currentPage: 84, completedCount: 0, completedAt: null,
    deleted: true, createdAt: timestamp, updatedAt: timestamp,
};
const session: SessionDto = {
    id: '00000000-0000-4000-8000-000000000002', bookId: book.id, startedAt: timestamp, endedAt: timestamp,
    activeSeconds: 0, startPage: 84, endPage: null, source: 'MANUAL', deleted: true, createdAt: timestamp,
};
const review: ReviewDto = {
    id: '00000000-0000-4000-8000-000000000003', bookId: book.id, oneLine: '다시 읽고 싶은 책이에요.', body: null,
    visibility: 'PRIVATE', deleted: true, createdAt: timestamp, updatedAt: timestamp,
};
const user: MeResponse = { id: '00000000-0000-4000-8000-000000000004', email: 'reader@example.test', nickname: '독자', rankingOptIn: false };
const quote: QuoteDto = { id: '00000000-0000-4000-8000-000000000005', bookId: book.id,
    text: '문장', page: null, memo: null, deleted: true, createdAt: timestamp, updatedAt: timestamp };
const token: TokenResponse = { accessToken: 'unit-test-only-token', expiresAt: timestamp, user };
const credentials = { email: user.email, password: 'unit-test-only-password' };
const newUser = { ...credentials, nickname: user.nickname };
const catalog: CatalogBook = { isbn: '9788937460449', title: '데미안', totalPages: null, source: 'nlk' };
const query = '데미안 & 나/책?';
const groups: BookReviewSearchResponse = [{
    bookKey: 'isbn:9788937460449', bookTitle: book.title, bookAuthor: book.author, isbn: '9788937460449', reviews: [{
        id: review.id, nickname: user.nickname, bookTitle: book.title, bookAuthor: book.author, genre: book.genre,
        oneLine: review.oneLine, body: null, publishedAt: null, likeCount: 0, likedByMe: false, mine: true,
    }],
}];

beforeEach(() => {
    jest.resetAllMocks();
    globalThis.fetch = fetchMock;
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.test';
    jest.mocked(NetInfo.fetch).mockResolvedValue({ isConnected: true, isInternetReachable: null } as NetInfoState);
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue('unit-test-only-token');
});

afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalBaseUrl === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
    else process.env.EXPO_PUBLIC_API_BASE_URL = originalBaseUrl;
});

test.each([
    { name: 'FR-10 · S-03 회원가입', call: () => signup(newUser), path: '/api/auth/signup', method: 'POST', body: newUser, response: token, auth: false },
    { name: 'FR-10 · S-02 로그인', call: () => login(credentials), path: '/api/auth/login', method: 'POST', body: credentials, response: token, auth: false },
    { name: 'FR-10 · S-80 내 정보', call: me, path: '/api/me', method: 'GET', body: undefined, response: user, auth: true },
    { name: 'FR-01 · S-22 ISBN 조회', call: () => catalogIsbn(catalog.isbn), path: `/api/catalog/isbn/${catalog.isbn}`, method: 'GET', body: undefined, response: catalog, auth: true },
    { name: 'FR-01 · S-23 장르 목록', call: catalogGenres, path: '/api/catalog/genres', method: 'GET', body: undefined, response: ['소설', '기타'], auth: true },
    { name: 'NFR-05 · S-31 책 전송', call: () => putBook(book), path: `/api/books/${book.id}`, method: 'PUT', body: book, response: book, auth: true },
    { name: 'NFR-05 · S-36 세션 전송', call: () => putSession(session), path: `/api/sessions/${session.id}`, method: 'PUT', body: session, response: session, auth: true },
    { name: 'NFR-05 · S-51 감상 전송', call: () => putReview(review), path: `/api/reviews/${review.id}`, method: 'PUT', body: review, response: review, auth: true },
    { name: 'NFR-05 · S-52 문장 전송', call: () => putQuote(quote), path: `/api/quotes/${quote.id}`, method: 'PUT', body: quote, response: quote, auth: true },
    { name: 'NFR-05 · S-02 로그인 복원', call: syncSnapshot, path: '/api/sync/snapshot', method: 'GET', body: undefined,
        response: { books: [book], sessions: [session], reviews: [review], quotes: [quote] }, auth: true },
    { name: 'FR-16 · S-71 책별 감상 검색', call: () => searchBookReviews(query), path: `/api/feed/books?query=${encodeURIComponent(query)}`, method: 'GET', body: undefined, response: groups, auth: true },
    { name: 'FR-08 · S-70 최근 공개 감상', call: () => feedList(), path: '/api/feed', method: 'GET', body: undefined, response: groups[0].reviews, auth: true },
    { name: 'FR-08 · S-72 감상 상세', call: () => feedItem(review.id), path: `/api/feed/${review.id}`, method: 'GET', body: undefined, response: groups[0].reviews[0], auth: true },
    { name: 'FR-09 · S-72 좋아요', call: () => likeReview(review.id), path: `/api/feed/${review.id}/like`, method: 'POST', body: undefined, response: { likeCount: 1, likedByMe: true }, auth: true },
    { name: 'FR-09 · S-72 좋아요 취소', call: () => unlikeReview(review.id), path: `/api/feed/${review.id}/like`, method: 'DELETE', body: undefined, response: { likeCount: 0, likedByMe: false }, auth: true },
])('$name 계약의 경로·본문·인증 헤더와 응답을 그대로 사용해요', async row => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => row.response } as Response);
    expect(await row.call()).toEqual(row.response);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(`https://api.example.test${row.path}`, expect.objectContaining({
        method: row.method,
        body: row.body === undefined ? undefined : JSON.stringify(row.body),
        headers: {
            Accept: 'application/json',
            ...(row.body === undefined ? {} : { 'Content-Type': 'application/json' }),
            ...(row.auth ? { Authorization: 'Bearer unit-test-only-token' } : {}),
        },
    }));
    expect(SecureStore.getItemAsync).toHaveBeenCalledTimes(row.auth ? 1 : 0);
});

test('FR-16 · S-71 공개 감상이 없으면 빈 목록을 반환해요', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => [] } as unknown as Response);
    await expect(searchBookReviews('없는 책')).resolves.toEqual([]);
});

test('FR-01 · S-22 ISBN의 경로 구분 문자도 인코딩해요', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => catalog } as Response);
    await catalogIsbn('isbn/with?reserved');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.test/api/catalog/isbn/isbn%2Fwith%3Freserved');
});

test.each([feedItem, likeReview, unlikeReview])('FR-09 S-72 감상 ID의 경로 구분 문자도 인코딩해요', async endpoint => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) } as Response);
    await endpoint('review/with?reserved');
    expect(fetchMock.mock.calls[0][0]).toContain('/api/feed/review%2Fwith%3Freserved');
});

test.each([() => feedList(), () => feedItem(review.id), () => searchBookReviews(query), () => likeReview(review.id), () => unlikeReview(review.id)])(
    'NFR-06 S-70~72 오프라인이면 공개 감상 HTTP 요청을 보내지 않아요', async endpoint => {
        jest.mocked(NetInfo.fetch).mockResolvedValue({ isConnected: false, isInternetReachable: false } as NetInfoState);
        await expect(endpoint()).rejects.toMatchObject({ kind: 'offline' });
        expect(fetchMock).not.toHaveBeenCalled();
    },
);

test('FR-08 S-72 비공개·삭제 감상의 404를 보존해요', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({ code: 'NOT_FOUND', message: 'Not found' }) } as Response);
    await expect(feedItem(review.id)).rejects.toMatchObject({ status: 404 });
});
