/** DOKPAMINE-BE/docs/API.md. 시각은 ISO-8601 UTC, ID는 클라이언트 UUID다. */
export interface MeResponse {
    id: string;
    username?: string;
    nickname: string;
    rankingOptIn: boolean;
}

export type PatchMeRequest = Partial<Pick<MeResponse, 'nickname' | 'rankingOptIn'>>;

export interface RankingEntry {
    rank: number;
    userId: string;
    nickname: string;
    seconds: number;
    me: boolean;
}

export interface WeeklyRankingResponse {
    weekStart: string;
    participating: boolean;
    top: RankingEntry[];
    around: RankingEntry[];
}

export interface TokenResponse {
    accessToken: string;
    expiresAt: string;
    user: MeResponse;
}

export interface LoginRequest {
    username: string;
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
    sideCoverUrl?: string | null;
    yes24ProductUrl?: string | null;
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
    sideCoverUrl?: string | null;
    yes24ProductUrl?: string | null;
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
    version?: number | null;
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
    /** #113 감상이 연결된 사람의 책(user_books) UUID. 구버전 서버는 주지 않는다. */
    userBookId?: string | null;
    nickname: string;
    bookTitle: string;
    bookAuthor: string;
    /** #113 감상이 연결된 책의 앞표지 주소. 저장된 표지가 없으면 null이고 구버전 서버는 주지 않는다. */
    coverUrl?: string | null;
    genre: string;
    oneLine?: string | null;
    body?: string | null;
    publishedAt?: string | null;
    /** #113 독후감(body)이 처음 채워진 서버 시각. 독후감이 없던 적만 있으면 null이고 구버전 서버는 주지 않는다. */
    bodyWrittenAt?: string | null;
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

export type FeedListResponse = FeedItem[];
export type ReviewLikeResponse = Pick<FeedItem, 'likeCount' | 'likedByMe'>;

/** #132 FR-09 S-80 좋아요한 감상: 묶음 안 한 줄. 작성자의 책(userBookId)마다 한 줄이며 내가 좋아요한 공개 감상 수와 마지막 시각을 준다. */
export interface LikedPerson {
    authorId: string;
    nickname: string;
    userBookId: string;
    likedCount: number;
    lastLikedAt: string;
    mine: boolean;
}

/** #132 FR-09 S-80 좋아요한 감상 책 묶음. 묶음 규칙과 bookKey는 BookReviewGroup과 같고 people은 lastLikedAt 최신순이다. */
export interface LikedBookGroup {
    bookKey: string;
    isbn?: string | null;
    bookTitle: string;
    bookAuthor: string;
    coverUrl?: string | null;
    lastLikedAt: string;
    people: LikedPerson[];
}

/** #132 nextCursor는 해석하지 않는 문자열이다. 마지막 페이지는 null이다. */
export interface LikedBookPage {
    items: LikedBookGroup[];
    nextCursor?: string | null;
}
