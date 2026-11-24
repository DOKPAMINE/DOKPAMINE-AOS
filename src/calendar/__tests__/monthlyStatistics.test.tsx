import { preloadReactNative } from '../../__tests__/preloadReactNative';

import { renderRouter, screen, within } from 'expo-router/testing-library';
import { StyleSheet } from 'react-native';

import CalendarScreen from '../../../app/(tabs)/calendar';
import { initializeDatabase } from '../../db/client';
import type { BookRecord, SessionRecord } from '../../db/schema';
import { colors } from '../../theme';

// 첫 render가 react-native 컴포넌트 로딩을 떠안아 시간 제한을 넘지 않도록 파일 로딩 단계에서 불러온다(#103).
preloadReactNative();

jest.mock('../../db/client', () => ({ initializeDatabase: jest.fn() }));

const now = Date.parse('2026-11-24T12:00:00+09:00');
function makeBook(id: string, title: string, genre: BookRecord['genre'], extra: Partial<BookRecord> = {}): BookRecord {
    return {
        id, title, author: `${title} 작가`, genre, totalPages: 240, currentPage: 0, status: 'READING', completedAt: null,
        isbn: null, publisher: null, coverUrl: null, sideCoverUrl: null, yes24ProductUrl: null, catalogPending: false, completedCount: 0,
        createdAt: now, updatedAt: now, deleted: false, syncPending: true, localVersion: 1, ...extra,
    };
}
function session(id: string, bookId: string, day: string, seconds: number, extra: Partial<SessionRecord> = {}): SessionRecord {
    const startedAt = Date.parse(`${day}T12:00:00+09:00`);
    return { id, bookId, startedAt, endedAt: startedAt + seconds * 1000,
        activeSeconds: seconds, startPage: 0, endPage: 30, source: 'TIMER',
        createdAt: startedAt, deleted: false, syncPending: true, localVersion: 1, ...extra };
}
const repository = {
    books: { list: jest.fn<BookRecord[], []>() },
    sessions: { list: jest.fn<SessionRecord[], []>() },
    subscribe: jest.fn<() => void, [() => void]>(),
};
const prepared = () => ({ repository }) as unknown as Awaited<ReturnType<typeof initializeDatabase>>;
const routes = { '(tabs)/calendar': CalendarScreen };
const hidden = { includeHiddenElements: true };

const novel = makeBook('novel', '데미안', '소설/시', { status: 'DONE', currentPage: 240, completedCount: 1, completedAt: Date.parse('2026-11-20T21:00:00+09:00') });
const essay = makeBook('essay', '산책', '에세이');

/** 11월에 3일 동안 2권(소설 1시간, 에세이 30분)을 총 1시간 30분 읽고 소설 1권을 완독한 달 */
const novemberSessions = [
    session('n1', 'novel', '2026-11-03', 1200),
    session('n2', 'novel', '2026-11-03', 600, { startedAt: Date.parse('2026-11-03T20:00:00+09:00') }),
    session('e1', 'essay', '2026-11-10', 1800),
    session('n3', 'novel', '2026-11-20', 1800),
];

function statistics() {
    return within(screen.getByTestId('monthly-statistics'));
}
function genreRows() {
    return statistics().getAllByTestId('genre-row');
}
function fillWidth(row: ReturnType<typeof genreRows>[number]) {
    return StyleSheet.flatten(within(row).getByTestId('genre-bar-fill', hidden).props.style).width;
}

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    repository.books.list.mockReturnValue([novel, essay]);
    repository.sessions.list.mockReturnValue(novemberSessions);
    repository.subscribe.mockImplementation(() => jest.fn());
    jest.mocked(initializeDatabase).mockResolvedValue(prepared());
});
afterEach(() => jest.restoreAllMocks());

test('FR-06 S-62 11월에 3일 동안 2권을 1시간 30분 읽고 1권을 완독하면 요약에 1시간 30분·1권·3일·2권이 보여요', async () => {
    await renderRouter(routes, { initialUrl: '/calendar' });
    const stats = statistics();
    expect(stats.getByRole('header', { name: '2026년 11월 월간 통계' })).toBeOnTheScreen();
    expect(stats.getByLabelText('총 독서시간 1시간 30분')).toHaveTextContent('1시간 30분총 독서시간');
    expect(stats.getByLabelText('완독 1권')).toHaveTextContent('1권완독');
    expect(stats.getByLabelText('읽은 일수 3일')).toHaveTextContent('3일읽은 일수');
    expect(stats.getByLabelText('읽은 책 2권')).toHaveTextContent('2권읽은 책');
});

test('FR-06 S-62 월간 통계는 제목 그대로 날짜별 기록 아래에 있어요', async () => {
    await renderRouter(routes, { initialUrl: '/calendar' });
    const headers = screen.getAllByRole('header');
    const dayRecords = headers.indexOf(screen.getByRole('header', { name: '11월 24일 기록' }));
    expect(dayRecords).toBeGreaterThanOrEqual(0);
    expect(headers.indexOf(screen.getByRole('header', { name: '2026년 11월 월간 통계' }))).toBeGreaterThan(dayRecords);
});

test('FR-06 S-62 소설 1시간, 에세이 30분이면 소설 막대가 먼저이고 에세이 막대의 2배 길이예요', async () => {
    await renderRouter(routes, { initialUrl: '/calendar' });
    const [first, second] = genreRows();
    expect(first).toHaveProp('accessibilityLabel', '소설/시, 1시간 0분');
    expect(second).toHaveProp('accessibilityLabel', '에세이, 30분');
    expect(within(first).getByText('소설/시')).toBeOnTheScreen();
    expect(within(first).getByText('1시간 0분')).toBeOnTheScreen();
    expect(fillWidth(first)).toBe('100%');
    expect(fillWidth(second)).toBe('50%');
});

test('FR-06 S-62 쪽수와 작가별 통계는 표시하지 않아요', async () => {
    await renderRouter(routes, { initialUrl: '/calendar' });
    expect(statistics().queryByText(/쪽/, hidden)).toBeNull();
    expect(screen.queryByText('작가별')).toBeNull();
    expect(screen.queryByText('데미안 작가')).toBeNull();
    expect(screen.queryByText('산책 작가')).toBeNull();
    expect(statistics().getByRole('header', { name: '장르별' })).toBeOnTheScreen();
});

test('FR-06 S-62 기록이 없는 달은 숫자가 0이고 장르별 자리에 "이 달에는 독서 기록이 없어요."가 보여요', async () => {
    await renderRouter(routes, { initialUrl: '/calendar?date=2026-12-01' });
    const stats = statistics();
    expect(stats.getByRole('header', { name: '2026년 12월 월간 통계' })).toBeOnTheScreen();
    expect(stats.getByLabelText('총 독서시간 0초')).toBeOnTheScreen();
    expect(stats.getByLabelText('완독 0권')).toBeOnTheScreen();
    expect(stats.getByLabelText('읽은 일수 0일')).toBeOnTheScreen();
    expect(stats.getByLabelText('읽은 책 0권')).toBeOnTheScreen();
    expect(stats.getByText('이 달에는 독서 기록이 없어요.')).toBeOnTheScreen();
    expect(stats.queryAllByTestId('genre-row')).toHaveLength(0);
});

test('FR-06 S-62 삭제한 책의 기록은 요약 숫자와 장르별에 들어가지 않아요', async () => {
    repository.books.list.mockReturnValue([novel, { ...essay, deleted: true }]);
    await renderRouter(routes, { initialUrl: '/calendar' });
    const stats = statistics();
    expect(stats.getByLabelText('총 독서시간 1시간 0분')).toBeOnTheScreen();
    expect(stats.getByLabelText('읽은 일수 2일')).toBeOnTheScreen();
    expect(stats.getByLabelText('읽은 책 1권')).toBeOnTheScreen();
    expect(genreRows().map(row => row.props.accessibilityLabel)).toEqual(['소설/시, 1시간 0분']);
});

test('FR-06 S-62 삭제한 책의 기록만 있는 달은 빈 달 안내가 나오고 숫자는 0이에요', async () => {
    repository.books.list.mockReturnValue([{ ...essay, deleted: true }]);
    repository.sessions.list.mockReturnValue([session('e1', 'essay', '2026-11-10', 1800)]);
    await renderRouter(routes, { initialUrl: '/calendar' });
    // 달력 아래 안내(readingDays)와 장르별 자리 안내가 모두 나온다.
    expect(screen.getAllByText('이 달에는 독서 기록이 없어요.')).toHaveLength(2);
    expect(statistics().getByLabelText('총 독서시간 0초')).toBeOnTheScreen();
    expect(statistics().getByLabelText('읽은 책 0권')).toBeOnTheScreen();
});

test('FR-06 S-62 요약 숫자와 장르 줄은 각각 한 요소로 읽고 막대는 보조 기술에서 숨겨요', async () => {
    await renderRouter(routes, { initialUrl: '/calendar' });
    for (const label of ['총 독서시간 1시간 30분', '완독 1권', '읽은 일수 3일', '읽은 책 2권']) {
        expect(statistics().getByLabelText(label)).toHaveProp('accessible', true);
    }
    for (const row of genreRows()) expect(row).toHaveProp('accessible', true);
    // 막대는 보조 기술 트리에서 빠지고(기본 조회에 안 잡힘), 숨김 요소까지 포함해야 찾을 수 있다.
    expect(screen.queryAllByTestId('genre-bar-track')).toHaveLength(0);
    const tracks = screen.getAllByTestId('genre-bar-track', hidden);
    expect(tracks).toHaveLength(2);
    for (const track of tracks) {
        expect(track).toHaveProp('accessibilityElementsHidden', true);
        expect(track).toHaveProp('importantForAccessibility', 'no-hide-descendants');
    }
});

test('FR-06 S-62 큰 글자에서도 숫자·라벨이 잘리지 않도록 줄 수와 높이를 고정하지 않고 좁으면 줄바꿈해요', async () => {
    await renderRouter(routes, { initialUrl: '/calendar' });
    const stats = statistics();
    const item = stats.getByLabelText('총 독서시간 1시간 30분');
    const summary = StyleSheet.flatten(item.parent?.props.style);
    expect(summary).toMatchObject({ flexDirection: 'row', flexWrap: 'wrap' });
    // 한 칸 최소 폭 132(44 × 3): 휴대폰 폭에서는 2×2, 넓으면 한 줄에 4개
    expect(StyleSheet.flatten(item.props.style)).toMatchObject({ flexGrow: 1, minWidth: 132 });
    for (const node of [item, ...genreRows()]) {
        expect(StyleSheet.flatten(node.props.style).height).toBeUndefined();
        for (const text of within(node).queryAllByText(/.+/, hidden)) {
            expect(text.props.numberOfLines).toBeUndefined();
            expect(text.props.allowFontScaling).not.toBe(false);
        }
    }
});

test('FR-06 S-62 막대는 테마 토큰 색(채움 text.muted, 배경 brand.sand)을 써요', async () => {
    await renderRouter(routes, { initialUrl: '/calendar' });
    const [first] = genreRows();
    expect(StyleSheet.flatten(within(first).getByTestId('genre-bar-track', hidden).props.style))
        .toMatchObject({ backgroundColor: colors.brand.sand, flex: 1 });
    expect(StyleSheet.flatten(within(first).getByTestId('genre-bar-fill', hidden).props.style))
        .toMatchObject({ backgroundColor: colors.text.muted });
});
