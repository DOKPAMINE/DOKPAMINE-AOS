import type { ReadingSession } from './readingTypes';

/** PRD D5: 자유 태그 대신 대표 장르 하나를 선택한다. */
export const GENRES = ['소설/시', '에세이', '인문/사회', '경제/경영', '자기계발', '과학/IT', '예술', '만화', '기타'] as const;
export type Genre = typeof GENRES[number];

/** FR-01 / BE Flyway V4: 이전 열두 장르 이름을 새 아홉 장르로 바꾸는 규칙 */
const LEGACY_GENRES: Readonly<Record<string, Genre>> = {
    '소설': '소설/시', 'SF': '소설/시', '시/에세이': '에세이',
    '인문': '인문/사회', '역사': '인문/사회', '사회/정치': '인문/사회', '과학': '과학/IT',
};

/** FR-01: 새 장르면 그대로, 이전 장르면 새 장르로 바꾸고, 모르는 값은 null을 돌려준다. */
export function normalizeGenre(value: string | null | undefined): Genre | null {
    if (typeof value !== 'string') return null;
    const name = value.trim();
    if ((GENRES as readonly string[]).includes(name)) return name as Genre;
    return LEGACY_GENRES[name] ?? null;
}

export type EndPageInput =
    | { readonly kind: 'timeOnly' }
    | { readonly kind: 'valid' | 'reread'; readonly endPage: number }
    | { readonly kind: 'invalid'; readonly message: string };

/** Kotlin Int 입력과 같은 범위이며 소수·지수·16진수 표기는 받지 않는다. */
export function parseInteger(input: string): number | null {
    const text = input.trim();
    if (!/^[+-]?\d+$/.test(text)) return null;
    const value = Number(text);
    return Number.isInteger(value) && value >= -2147483648 && value <= 2147483647 ? value : null;
}

/** FR-03 / S-43: 되돌아 읽기는 확인 대상으로 구분하고 쪽수 집계에서는 0으로 센다. */
export function parseEndPage(input: string, startPage: number, totalPages: number): EndPageInput {
    if (input.trim() === '') return { kind: 'timeOnly' };
    const page = parseInteger(input);
    if (page === null || page < 0) return { kind: 'invalid', message: '0 이상의 정수로 입력해 주세요.' };
    if (page > totalPages) return { kind: 'invalid', message: `전체 쪽수(${totalPages}쪽)보다 클 수 없어요.` };
    return { kind: page < startPage ? 'reread' : 'valid', endPage: page };
}

/** #66 / S-41~43: 독서 중 진행 막대는 입력한 지금 읽는 쪽을, 비었거나 잘못되면 시작 쪽을 보여 준다. */
export function readingDisplayPage(endPageDraft: string, startPage: number, totalPages: number): number {
    const page = parseEndPage(endPageDraft, startPage, totalPages);
    return page.kind === 'valid' || page.kind === 'reread' ? page.endPage : startPage;
}

/** 삭제·시간만 기록 제외. 시작 시각 → 생성 시각 → ID로 순서를 고정한다. 한 책의 기록을 받는다. */
export function latestPaged(sessions: readonly ReadingSession[]): ReadingSession | null {
    return sessions.reduce<ReadingSession | null>((latest, session) => {
        if (session.deleted || session.endPage === null) return latest;
        if (!latest || session.startedAt > latest.startedAt ||
            (session.startedAt === latest.startedAt && (session.createdAt > latest.createdAt ||
                (session.createdAt === latest.createdAt && session.id > latest.id)))) return session;
        return latest;
    }, null);
}

/** PRD D7 / S-40·S-33·S-36: 지난 끝 쪽을 제안하되, 마지막 쪽까지 읽었으면 처음부터 다시 읽는 것으로 보고 0쪽을 제안한다(#65). */
export function suggestedStartPage(currentPage: number, totalPages: number): number {
    if (currentPage >= totalPages) return 0;
    return Math.max(0, currentPage);
}
