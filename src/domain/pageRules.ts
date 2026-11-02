import type { ReadingSession } from './readingTypes';

/** PRD D5: 자유 태그 대신 대표 장르 하나를 선택한다. */
export const GENRES = ['소설', 'SF', '시/에세이', '인문', '역사', '사회/정치', '경제/경영', '자기계발', '과학', '예술', '만화', '기타'] as const;
export type Genre = typeof GENRES[number];

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

/** PRD D7 / S-40: 가장 최근 쪽수 기록의 끝 쪽. 기록이 없으면 현재 쪽(새 책은 0쪽)을 쓴다. */
export function suggestedStartPage(sessions: readonly ReadingSession[], currentPage = 0): number {
    return latestPaged(sessions)?.endPage ?? currentPage;
}
