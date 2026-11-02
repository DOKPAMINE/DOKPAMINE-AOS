/** PRD 8장 / SessionDto 필드명. 도메인 시각은 epoch 밀리초이며 API 경계에서 ISO-8601로 변환한다. */
export interface ReadingSession {
    readonly id: string;
    readonly bookId: string;
    readonly startedAt: number;
    readonly endedAt: number;
    readonly activeSeconds: number;
    readonly startPage: number;
    readonly endPage: number | null;
    readonly source: 'TIMER' | 'MANUAL';
    readonly deleted: boolean;
    readonly createdAt: number;
    readonly syncPending: boolean;
    readonly localVersion: number;
}

/** FR-06 집계에 필요한 BookDto 필드만 정의한다. */
export interface StatisticsBook {
    readonly id: string;
    readonly genre: string;
    readonly author: string;
    readonly completedAt: number | null;
    readonly deleted: boolean;
}

export function pagesRead(session: Pick<ReadingSession, 'startPage' | 'endPage'>): number {
    return session.endPage === null ? 0 : Math.max(0, session.endPage - session.startPage);
}
