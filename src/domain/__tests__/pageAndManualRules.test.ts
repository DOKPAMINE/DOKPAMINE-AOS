import { parseStartedAt } from '../kstDate';
import { currentPageAfterSave, toManualSession, validateManualSession, type ValidManualSession } from '../manualSessionRules';
import { GENRES, latestPaged, parseEndPage, suggestedStartPage } from '../pageRules';
import { readingProgress } from '../readingProgress';
import { pagesRead, type ReadingSession } from '../readingTypes';

const startedAt = Date.parse('2026-10-29T12:00:00Z');
const now = startedAt + 3600000;
const session = (id: string, at: number, endPage: number | null, changes: Partial<ReadingSession> = {}): ReadingSession => ({
    id, bookId: 'book', startedAt: at, endedAt: at + 60000, activeSeconds: 60, startPage: 0, endPage,
    source: 'MANUAL', createdAt: at, deleted: false, syncPending: true, localVersion: at, ...changes,
});
const validate = (minutes = '20', start = '30', end = '50', at = startedAt) => validateManualSession(at, minutes, start, end, 200, now);
const validInput = (): ValidManualSession => {
    const result = validate();
    if (result.kind !== 'valid') throw new Error(result.message);
    return result;
};

test('FR-01 D5 장르는 Kotlin의 대표 장르 12개를 유지해요', () => {
    expect(GENRES).toEqual(['소설', 'SF', '시/에세이', '인문', '역사', '사회/정치', '경제/경영', '자기계발', '과학', '예술', '만화', '기타']);
});

test.each(['-1', '50.5', '1e2', '0xff', 'NaN', '2147483648'])('FR-03 S-43 0 이상 정수 범위가 아닌 끝 쪽 %s은 저장하지 않아요', input => {
    expect(parseEndPage(input, 30, 240).kind).toBe('invalid');
});
test('FR-03 S-43 빈칸은 시간만 저장하고 241쪽은 전체 240쪽 초과 오류예요', () => {
    expect(parseEndPage('  ', 30, 240)).toEqual({ kind: 'timeOnly' });
    expect(parseEndPage('241', 30, 240)).toEqual({ kind: 'invalid', message: '전체 쪽수(240쪽)보다 클 수 없어요.' });
    expect(parseEndPage(' 240 ', 30, 240)).toEqual({ kind: 'valid', endPage: 240 });
    expect(parseEndPage('30', 30, 240)).toEqual({ kind: 'valid', endPage: 30 });
    expect(parseEndPage('20', 30, 240)).toEqual({ kind: 'reread', endPage: 20 });
    expect(parseEndPage('0', 0, 240)).toEqual({ kind: 'valid', endPage: 0 });
});
test('FR-03 D6 30쪽에서 50쪽까지는 20쪽이고 되돌아 읽기와 시간만 기록은 0쪽이에요', () => {
    expect(pagesRead({ startPage: 30, endPage: 50 })).toBe(20);
    expect(pagesRead({ startPage: 112, endPage: 80 })).toBe(0);
    expect(pagesRead({ startPage: 30, endPage: null })).toBe(0);
    expect(readingProgress(84, 240)).toEqual({ label: '84 / 240쪽', ratio: 0.35 });
});
test('FR-02 D7 S-40 지난 끝 쪽 84를 다음 시작 쪽으로 자동 입력해요', () => {
    const paged = session('paged', startedAt, 84);
    const list = [session('old', startedAt - 1, 120), paged, session('time', startedAt + 1, null), session('deleted', startedAt + 2, 200, { deleted: true })];
    const currentPage = currentPageAfterSave(60, 240, [], list);
    expect(currentPage).toBe(84);
    expect(suggestedStartPage(currentPage, 240)).toBe(84);
    expect(suggestedStartPage(0, 240)).toBe(0);
    expect(suggestedStartPage(20, 240)).toBe(20);
    expect(latestPaged([session('zero', startedAt, 0)])?.endPage).toBe(0);
});

test('FR-02 D7 S-33 다시 읽기 뒤 현재 0쪽이면 0쪽을 제안해요', () => {
    const previous = session('finished', startedAt, 240);
    const currentPage = currentPageAfterSave(0, 240, [previous], [previous]);
    expect(suggestedStartPage(currentPage, 240)).toBe(0);
});

test('FR-02 D7 S-34 시작 쪽은 줄인 전체 쪽수로 제한해요', () => {
    expect(suggestedStartPage(180, 150)).toBe(150);
    expect(suggestedStartPage(150, 150)).toBe(150);
    expect(suggestedStartPage(-1, 150)).toBe(0);
    expect(suggestedStartPage(180, 0)).toBe(0);
});
test('FR-02 D7 S-40 시작 시각이 같으면 생성 시각과 ID로 최근 기록을 고정해요', () => {
    const a = session('a', startedAt, 10);
    const b = session('b', startedAt, 20);
    const c = session('c', startedAt, 30, { createdAt: startedAt - 1 });
    expect(latestPaged([b, c, a])).toEqual(b);
    expect(latestPaged([a, c, b])).toEqual(b);
});

test('FR-02 T09 S-36 0분은 거절하고 1분은 60초로 저장해요', () => {
    expect(validate('0').kind).toBe('invalid');
    expect(validate('1')).toMatchObject({ kind: 'valid', activeSeconds: 60 });
});
test('FR-02 T09 S-36 20분이면 종료 시각은 시작 후 20분이며 종료가 현재와 같아도 허용해요', () => {
    expect(validate()).toEqual({ kind: 'valid', startedAt, endedAt: startedAt + 1200000, activeSeconds: 1200, startPage: 30, endPage: 50 });
    expect(validate('60').kind).toBe('valid');
    expect(validate('1', '30', '50', now)).toEqual({ kind: 'invalid', message: '독서 종료 시각은 현재 시각을 넘을 수 없어요.' });
});
test.each(['', '-1', '1.5', '2147483647', '999999999999', '1e2'])('FR-02 T09 S-36 잘못된 분 입력 %s은 예외 없이 거절해요', minutes => {
    expect(validate(minutes).kind).toBe('invalid');
});
test('FR-02 T09 S-36 안전한 정수와 날짜 범위를 넘는 시각은 거절해요', () => {
    expect(validate('1', '0', '', Number.MAX_SAFE_INTEGER).kind).toBe('invalid');
    expect(validate('1', '0', '', Number.NaN).kind).toBe('invalid');
    expect(validateManualSession(8640000000000000, '1', '0', '', 200, Number.MAX_SAFE_INTEGER).kind).toBe('invalid');
    expect(validateManualSession(startedAt, '35791394', '0', '', 200, Number.MAX_SAFE_INTEGER).kind).toBe('valid');
    expect(validateManualSession(startedAt, '35791395', '0', '', 200, Number.MAX_SAFE_INTEGER).kind).toBe('invalid');
});
test.each(['-1', '201', '1.5', ''])('FR-02 T09 S-36 시작 쪽 %s이 0부터 전체 쪽 사이가 아니면 거절해요', start => {
    expect(validate('20', start).kind).toBe('invalid');
});
test.each(['-1', '29', '50.5', '201'])('FR-02 T09 S-36 종료 쪽 %s이 시작 이상부터 전체 쪽 사이가 아니면 거절해요', end => {
    expect(validate('20', '30', end).kind).toBe('invalid');
});
test.each(['0', '30', '200'])('FR-02 T09 S-36 시작과 끝이 같은 %s쪽도 허용해요', page => {
    expect(validate('20', page, page).kind).toBe('valid');
});
test('FR-02 T09 S-36 종료 쪽을 비우면 시간만 저장해요', () => {
    expect(validate('20', '30', '  ')).toMatchObject({ kind: 'valid', endPage: null, activeSeconds: 1200 });
});

test.each([
    ['2026-02-30', '12:00'], ['2026-10-29', '24:00'], ['2026-10-29', '12:60'],
    ['2026-10-29', '9:05'], ['2026/10/29', '12:00'], ['1899-12-31', '23:59'], ['0226-10-29', '12:00'],
])('FR-02 T09 S-36 잘못된 날짜 %s와 시각 %s은 거절해요', (date, time) => {
    expect(parseStartedAt(date, time)).toBeNull();
});
test('FR-02 T09 S-36 날짜와 시각은 KST로 엄격하게 해석하고 앞뒤 공백을 허용해요', () => {
    expect(parseStartedAt(' 2026-10-29 ', ' 21:00 ')).toBe(startedAt);
    expect(parseStartedAt('2026-10-29', '23:59')).toBe(Date.parse('2026-10-29T14:59:00Z'));
    expect(parseStartedAt('1900-01-01', '00:00')).toBe(Date.parse('1899-12-31T15:00:00Z'));
    expect(parseStartedAt('2024-02-29', '00:00')).not.toBeNull();
    // KST에는 DST 공백이 없으며 기기 시간대와 무관하게 같은 시각을 반환한다.
    expect(parseStartedAt('2026-03-08', '02:30')).toBe(Date.parse('2026-03-07T17:30:00Z'));
});
test('FR-02 T09 NFR-05 수정한 TIMER는 같은 ID와 생성 시각을 유지한 MANUAL과 동기화 대기가 돼요', () => {
    const original = session('stable-client-uuid', startedAt, 10, { source: 'TIMER', createdAt: startedAt - 1000, syncPending: false, localVersion: now });
    const first = toManualSession(validInput(), original.id, original.bookId, original, now);
    const second = toManualSession(validInput(), first.id, first.bookId, first, now - 1);
    expect(first).toMatchObject({ id: original.id, createdAt: original.createdAt, source: 'MANUAL', syncPending: true, localVersion: now + 1 });
    expect(second.localVersion).toBe(now + 2);
    expect(second.createdAt).toBe(first.createdAt);
    expect(new Set([first.id, second.id]).size).toBe(1);
    expect(toManualSession(validInput(), 'new', 'book', null, now)).toMatchObject({ id: 'new', createdAt: now, source: 'MANUAL', localVersion: now });
});
test('FR-02 T09 NFR-05 다른 책이나 다른 ID 또는 삭제 기록을 덮어쓰지 않아요', () => {
    const original = session('id', startedAt, 10);
    expect(() => toManualSession(validInput(), 'other', 'book', original, now)).toThrow();
    expect(() => toManualSession(validInput(), 'id', 'other', original, now)).toThrow();
    expect(() => toManualSession(validInput(), 'id', 'book', { ...original, deleted: true }, now)).toThrow();
    expect(() => toManualSession(validInput(), 'id', 'book', { ...original, localVersion: Number.MAX_SAFE_INTEGER }, now)).toThrow();
});
test('FR-02 T09 S-36 가장 최근 쪽수 기록을 추가하거나 수정하면 현재 쪽을 따라가요', () => {
    const older = session('older', startedAt - 86400000, 50);
    const latest = session('latest', startedAt, 120);
    expect(currentPageAfterSave(50, 200, [older], [older, latest])).toBe(120);
    expect(currentPageAfterSave(120, 200, [older, latest], [older, { ...latest, endPage: 80 }])).toBe(80);
    expect(currentPageAfterSave(120, 200, [older, latest], [older, { ...latest, endPage: null }])).toBe(50);
    expect(currentPageAfterSave(120, 200, [latest], [{ ...latest, endPage: null }])).toBe(0);
    expect(currentPageAfterSave(120, 200, [older, latest], [older, { ...latest, deleted: true }])).toBe(50);
});
test('FR-02 T09 S-36 과거 기록 추가나 수정은 다시 읽기의 현재 0쪽을 바꾸지 않아요', () => {
    const latest = session('latest', startedAt, 100);
    const old = session('old', startedAt - 86400000, 150);
    expect(currentPageAfterSave(0, 200, [latest], [{ ...latest }, old])).toBe(0);
    expect(currentPageAfterSave(0, 200, [old, latest], [{ ...old, endPage: 160 }, { ...latest }])).toBe(0);
});
test('FR-02 T09 S-36 최근 기록 순서가 바뀌면 현재 쪽은 전체 쪽수 범위로 제한해요', () => {
    const stale = session('stale', startedAt, 180);
    const newer = session('newer', startedAt + 60000, 100);
    expect(currentPageAfterSave(100, 150, [stale, newer], [stale, { ...newer, startedAt: startedAt - 60000 }])).toBe(150);
    expect(currentPageAfterSave(100, -1, [newer], [stale])).toBe(0);
});
