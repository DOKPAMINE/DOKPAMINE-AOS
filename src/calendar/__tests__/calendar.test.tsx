import { act, fireEvent, renderRouter, screen, within } from 'expo-router/testing-library';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import CalendarScreen from '../../../app/(tabs)/calendar';
import { initializeDatabase } from '../../db/client';
import type { BookRecord, SessionRecord } from '../../db/schema';
import { colors } from '../../theme';
import { COVER_TITLE_LINES } from '../DayCovers';

jest.mock('../../db/client', () => ({ initializeDatabase: jest.fn() }));

const now = Date.parse('2026-11-02T00:00:00+09:00');
const book: BookRecord = {
    id: 'book', title: '데미안', author: '헤르만 헤세', genre: '소설/시', totalPages: 240,
    currentPage: 240, status: 'DONE', completedAt: Date.parse('2026-10-31T14:59:59Z'),
    isbn: null, publisher: null, coverUrl: null, sideCoverUrl: null, yes24ProductUrl: null, catalogPending: false, completedCount: 1,
    createdAt: now, updatedAt: now, deleted: false, syncPending: true, localVersion: 1,
};
function session(id: string, day: string, seconds: number, extra: Partial<SessionRecord> = {}): SessionRecord {
    const startedAt = Date.parse(`${day}T12:00:00+09:00`);
    return { id, bookId: book.id, startedAt, endedAt: startedAt + seconds * 1000,
        activeSeconds: seconds, startPage: 0, endPage: null, source: 'TIMER',
        createdAt: startedAt, deleted: false, syncPending: true, localVersion: 1, ...extra };
}
const repository = {
    books: { list: jest.fn<BookRecord[], []>() },
    sessions: { list: jest.fn<SessionRecord[], []>() },
    subscribe: jest.fn<() => void, [() => void]>(),
};
let changed: () => void;
const unsubscribe = jest.fn();
const prepared = () => ({ repository }) as unknown as Awaited<ReturnType<typeof initializeDatabase>>;
function BookDestination() {
    const { id } = useLocalSearchParams();
    return <Text>{`책 상세 ${id}`}</Text>;
}
const routes = { '(tabs)/calendar': CalendarScreen, 'book/[id]': BookDestination };
type Node = ReturnType<typeof screen.getByText>;
function hostParent(node: Node): Node {
    let parent = node.parent;
    while (parent && typeof parent.type !== 'string') parent = parent.parent;
    if (!parent) throw new Error('호스트 부모를 찾지 못했어요.');
    return parent;
}

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    repository.books.list.mockReturnValue([book]);
    repository.sessions.list.mockReturnValue([]);
    repository.subscribe.mockImplementation(listener => { changed = listener; return unsubscribe; });
    jest.mocked(initializeDatabase).mockResolvedValue(prepared());
});
afterEach(() => jest.restoreAllMocks());

test('FR-05 S-60 로딩을 표시하고 빈 달에도 달력과 0 통계를 보여 줘요', async () => {
    let finish!: (value: Awaited<ReturnType<typeof initializeDatabase>>) => void;
    jest.mocked(initializeDatabase).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    await renderRouter(routes, { initialUrl: '/calendar' });
    expect(screen.getByText('독서 기록을 불러오고 있어요.')).toBeOnTheScreen();
    expect(screen.queryByText('0초')).toBeNull();
    await act(async () => finish(prepared()));
    expect(screen.getByRole('header', { name: '2026년 11월' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '11월 2일, 독서 기록 없음' })).toBeSelected();
    // 달력 아래 빈 달 안내와 S-62 장르별 자리의 안내가 함께 나온다.
    expect(screen.getAllByText('이 달에는 독서 기록이 없어요.')).toHaveLength(2);
    expect(screen.getByLabelText('총 독서시간 0초')).toBeOnTheScreen();
    expect(screen.getByLabelText('완독 0권')).toBeOnTheScreen();
    expect(screen.getByLabelText('읽은 일수 0일')).toBeOnTheScreen();
    expect(screen.getByLabelText('읽은 책 0권')).toBeOnTheScreen();
});

test('FR-05 S-60 달력 가로 스크롤 내용이 화면 폭을 채우고 날짜 칸은 최소 44를 유지해요', async () => {
    await renderRouter(routes, { initialUrl: '/calendar' });
    const scroll = screen.getByLabelText('2026년 11월 독서 달력');
    expect(scroll.props.horizontal).toBe(true);
    expect(StyleSheet.flatten(scroll.props.contentContainerStyle)).toMatchObject({ flexGrow: 1 });
    // 요일 칸 → 요일 줄 → 달력 View 순으로 올라가 달력도 남은 폭을 채우는지 확인한다.
    const weekday = screen.getByText('일');
    expect(StyleSheet.flatten(weekday.props.style)).toMatchObject({ flex: 1, minWidth: 44 });
    const calendar = hostParent(hostParent(weekday));
    expect(StyleSheet.flatten(calendar.props.style)).toMatchObject({ flexGrow: 1, minWidth: 44 * 7 });
    const day = StyleSheet.flatten(screen.getByRole('button', { name: '11월 2일, 독서 기록 없음' }).props.style);
    expect(day).toMatchObject({ flex: 1, minWidth: 44 });
});

test('FR-05 FR-06 S-60 S-61 S-62 지정 날짜를 열고 날짜 선택과 월 이동으로 기록·통계를 갱신해요', async () => {
    repository.sessions.list.mockReturnValue([
        session('a', '2026-10-05', 600, { endPage: 20 }),
        session('b', '2026-10-05', 1200, { startPage: 20, endPage: 50, source: 'MANUAL' }),
        session('c', '2026-10-06', 59),
        session('deleted', '2026-10-07', 3600, { endPage: 100, deleted: true }),
        session('november', '2026-11-05', 3600, { endPage: 10 }),
    ]);
    await renderRouter(routes, { initialUrl: '/calendar?date=2026-10-05' });
    expect(screen.getByRole('header', { name: '2026년 10월' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '10월 5일, 1권 읽음: 데미안' })).toBeSelected();
    // S-61: 같은 책의 타이머 10분과 직접 입력 20분은 한 줄의 30분이 된다.
    expect(screen.getAllByText('데미안')).toHaveLength(1);
    expect(within(screen.getByRole('button', { name: '데미안, 30분, 책 상세 보기' })).getByText('30분')).toBeOnTheScreen();
    expect(screen.queryByText('직접 입력한 기록')).toBeNull();
    // S-62: 10월은 5·6일 이틀, 데미안 1권을 30분 59초 읽었고 10월 31일에 완독했다. 쪽수와 작가는 표시하지 않는다.
    expect(screen.getByLabelText('총 독서시간 30분')).toBeOnTheScreen();
    expect(screen.getByLabelText('완독 1권')).toBeOnTheScreen();
    expect(screen.getByLabelText('읽은 일수 2일')).toBeOnTheScreen();
    expect(screen.getByLabelText('읽은 책 1권')).toBeOnTheScreen();
    expect(screen.getByLabelText('소설/시, 30분')).toBeOnTheScreen();
    expect(screen.queryByText(/쪽/)).toBeNull();
    expect(screen.queryByText('헤르만 헤세')).toBeNull();
    expect(screen.getByRole('button', { name: '10월 7일, 독서 기록 없음' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '10월 6일, 1권 읽음: 데미안' }));
    expect(screen.getByRole('header', { name: '10월 6일 기록' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '데미안, 59초, 책 상세 보기' })).toBeOnTheScreen();
    expect(screen.queryByText(/12:00/)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: '다음 달' }));
    expect(screen.getByRole('header', { name: '2026년 11월' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '11월 6일, 독서 기록 없음' })).toBeSelected();
    expect(screen.getByLabelText('총 독서시간 1시간 0분')).toBeOnTheScreen();
    expect(screen.getByLabelText('완독 0권')).toBeOnTheScreen();
    expect(screen.getByLabelText('읽은 일수 1일')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '이전 달' }));
    expect(screen.getByRole('button', { name: '10월 6일, 1권 읽음: 데미안' })).toBeSelected();
});

test.each(['bad', '2026-02-29', '2026-11-31', '2026-1-01'])(
    'FR-05 S-60 잘못된 date=%s는 이번 달과 KST 오늘을 열어요', async date => {
        await renderRouter(routes, { initialUrl: `/calendar?date=${date}` });
        expect(screen.getByRole('header', { name: '2026년 11월' })).toBeOnTheScreen();
        expect(screen.getByRole('button', { name: '11월 2일, 독서 기록 없음' })).toBeSelected();
    },
);

test('FR-05 S-60 같은 라우트에 새 날짜 파라미터를 받으면 월과 선택 날짜를 바꿔요', async () => {
    await renderRouter(routes, { initialUrl: '/calendar?date=2026-10-31' });
    await act(async () => router.setParams({ date: '2024-02-29' }));
    expect(screen.getByRole('header', { name: '2024년 2월' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '2월 29일, 독서 기록 없음' })).toBeSelected();
});

test('FR-05 S-61 책 줄을 누르면 그 책 상세 화면으로 이동해요', async () => {
    repository.sessions.list.mockReturnValue([session('a', '2026-11-02', 600)]);
    await renderRouter(routes, { initialUrl: '/calendar' });
    await fireEvent.press(screen.getByRole('button', { name: '데미안, 10분, 책 상세 보기' }));
    expect(screen).toHavePathname('/book/book');
    expect(screen.getByText('책 상세 book')).toBeOnTheScreen();
});

test('NFR-04 FR-05 FR-06 S-60 기록 삭제와 변경을 구독하고 화면 종료 시 해제해요', async () => {
    repository.sessions.list.mockReturnValue([session('a', '2026-11-02', 600)]);
    const rendered = await renderRouter(routes, { initialUrl: '/calendar' });
    expect(screen.getByRole('button', { name: '11월 2일, 1권 읽음: 데미안' })).toBeSelected();
    repository.sessions.list.mockReturnValue([session('a', '2026-11-02', 600, { deleted: true })]);
    repository.books.list.mockReturnValue([{ ...book, completedAt: now, deleted: true }]);
    await act(async () => changed());
    expect(screen.getByRole('button', { name: '11월 2일, 독서 기록 없음' })).toBeSelected();
    expect(screen.queryByText('데미안')).toBeNull();
    expect(screen.getByLabelText('완독 0권')).toBeOnTheScreen();
    expect(screen.getByLabelText('읽은 책 0권')).toBeOnTheScreen();
    expect(screen.getByLabelText('총 독서시간 0초')).toBeOnTheScreen();
    await rendered.unmount();
    expect(unsubscribe).toHaveBeenCalled();
});

test('FR-05 S-60 초기화 오류와 읽기 오류에서 다시 시도할 수 있어요', async () => {
    jest.mocked(initializeDatabase).mockRejectedValueOnce(new Error('DB 실패'));
    await renderRouter(routes, { initialUrl: '/calendar' });
    expect(screen.getByRole('alert')).toHaveTextContent('독서 기록을 불러오지 못했어요.');
    repository.sessions.list.mockImplementationOnce(() => { throw new Error('읽기 실패'); });
    await fireEvent.press(screen.getByRole('button', { name: '다시 시도해 주세요' }));
    expect(screen.getByRole('alert')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '다시 시도해 주세요' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('0초')).toBeOnTheScreen();
});

function coverBook(id: string, title: string, coverUrl: string | null): BookRecord {
    return { ...book, id, title, coverUrl, status: 'READING', completedAt: null, completedCount: 0 };
}
const hidden = { includeHiddenElements: true };
function dayCell(name: string) {
    return within(screen.getByRole('button', { name }));
}
function coverUris(name: string) {
    return dayCell(name).queryAllByTestId('calendar-cover-image', hidden).map(image => image.props.source.uri);
}
function coverTitles(name: string) {
    return dayCell(name).queryAllByTestId('calendar-cover-title', hidden).map(title => title.props.children);
}
/** 날짜 칸의 표지 이미지가 불러오기에 실패한 상황을 만든다. */
async function failCover(name: string) {
    await act(async () => fireEvent(dayCell(name).getByTestId('calendar-cover-image', hidden), 'error'));
}

/** 기본 표지가 나오는 세 경우: 11월 3일 표지 없음, 4일 표지 불러오기 실패(실패 전에는 사진), 5일 찾을 수 없는 책 */
const fallbackDays = {
    none: '11월 3일, 1권 읽음: 표지 없는 책',
    broken: '11월 4일, 1권 읽음: 깨진 표지 책',
    missing: '11월 5일, 1권 읽음: 찾을 수 없는 책',
} as const;
async function renderFallbackDays(extraBooks: BookRecord[] = [], extraSessions: SessionRecord[] = []) {
    repository.books.list.mockReturnValue([
        coverBook('none', '표지 없는 책', null), coverBook('broken', '깨진 표지 책', 'https://cover.test/broken.jpg'), ...extraBooks,
    ]);
    repository.sessions.list.mockReturnValue([
        session('n1', '2026-11-03', 600, { bookId: 'none' }),
        session('b1', '2026-11-04', 600, { bookId: 'broken' }),
        session('m1', '2026-11-05', 600, { bookId: 'missing' }),
        ...extraSessions,
    ]);
    await renderRouter(routes, { initialUrl: '/calendar' });
}

test('FR-05 S-60 하루에 1권 읽은 날은 날짜 숫자 아래에 그 책의 앞표지가 표지 영역을 채워요', async () => {
    repository.books.list.mockReturnValue([coverBook('a', '데미안', 'https://cover.test/a.jpg')]);
    repository.sessions.list.mockReturnValue([session('a1', '2026-11-03', 600, { bookId: 'a' })]);
    await renderRouter(routes, { initialUrl: '/calendar' });
    const name = '11월 3일, 1권 읽음: 데미안';
    const cell = dayCell(name);
    expect(cell.getByText('3')).toBeOnTheScreen();
    expect(coverUris(name)).toEqual(['https://cover.test/a.jpg']);
    expect(StyleSheet.flatten(cell.getByTestId('calendar-cover-area', hidden).props.style)).toMatchObject({ width: '100%', aspectRatio: 2 / 3 });
    const image = cell.getByTestId('calendar-cover-image', hidden);
    expect(StyleSheet.flatten(image.props.style)).toMatchObject({ flex: 1, alignSelf: 'stretch' });
    expect(image.props.resizeMode).toBe('cover');
    expect(screen.queryByText('●')).toBeNull();
});

test('FR-05 S-60 S-61 2권 읽은 날은 오래 읽은 책부터 두 표지를 좌우 반씩 보여 주고 누르면 테두리와 그날 기록이 나와요', async () => {
    repository.books.list.mockReturnValue([coverBook('a', '짧게 읽은 책', 'https://cover.test/a.jpg'), coverBook('b', '오래 읽은 책', 'https://cover.test/b.jpg')]);
    repository.sessions.list.mockReturnValue([
        session('a1', '2026-11-03', 600, { bookId: 'a' }),
        session('b1', '2026-11-03', 1200, { bookId: 'b' }),
    ]);
    await renderRouter(routes, { initialUrl: '/calendar' });
    const name = '11월 3일, 2권 읽음: 오래 읽은 책, 짧게 읽은 책';
    expect(coverUris(name)).toEqual(['https://cover.test/b.jpg', 'https://cover.test/a.jpg']);
    dayCell(name).getAllByTestId('calendar-cover-image', hidden)
        .forEach(image => expect(StyleSheet.flatten(image.props.style)).toMatchObject({ flex: 1 }));
    expect(StyleSheet.flatten(dayCell(name).getByTestId('calendar-cover-area', hidden).props.style)).toMatchObject({ flexDirection: 'row' });
    expect(dayCell(name).queryByText(/^\+/, hidden)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name }));
    expect(screen.getByRole('button', { name })).toBeSelected();
    expect(StyleSheet.flatten(screen.getByRole('button', { name }).props.style)).toMatchObject({ borderColor: colors.brand.espresso });
    expect(screen.getByRole('header', { name: '11월 3일 기록' })).toBeOnTheScreen();
    expect(screen.getByText('오래 읽은 책')).toBeOnTheScreen();
    expect(screen.getByText('짧게 읽은 책')).toBeOnTheScreen();
});

test('FR-05 S-60 3권 읽은 날은 오래 읽은 2권 표지와 표지 아래 "+1"을 보여 주고 5권이면 "+3"이에요', async () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    repository.books.list.mockReturnValue(ids.map(id => coverBook(id, `책${id}`, `https://cover.test/${id}.jpg`)));
    repository.sessions.list.mockReturnValue([
        session('a1', '2026-11-03', 300, { bookId: 'a' }),
        session('b1', '2026-11-03', 900, { bookId: 'b' }),
        session('c1', '2026-11-03', 600, { bookId: 'c' }),
        ...ids.map((id, index) => session(`${id}2`, '2026-11-04', 600 - index * 60, { bookId: id })),
    ]);
    await renderRouter(routes, { initialUrl: '/calendar' });
    const three = '11월 3일, 3권 읽음: 책b, 책c, 책a';
    expect(coverUris(three)).toEqual(['https://cover.test/b.jpg', 'https://cover.test/c.jpg']);
    const more = dayCell(three).getByText('+1', hidden);
    expect(more.props.accessible).toBe(false);
    expect(more.props.importantForAccessibility).toBe('no');
    const five = '11월 4일, 5권 읽음: 책a, 책b, 책c, 책d, 책e';
    expect(coverUris(five)).toEqual(['https://cover.test/a.jpg', 'https://cover.test/b.jpg']);
    expect(dayCell(five).getByText('+3', hidden)).toBeTruthy();
});

test('FR-05 S-60 표지가 없거나 못 불러오거나 책을 찾지 못하면 장르 글자 없이 기본 표지 색으로 채워요', async () => {
    await renderFallbackDays();
    const fallback = dayCell(fallbackDays.none).getByTestId('calendar-cover-default', hidden);
    expect(StyleSheet.flatten(fallback.props.style)).toMatchObject({ flex: 1, backgroundColor: colors.brand.sand });
    await failCover(fallbackDays.broken);
    expect(dayCell(fallbackDays.broken).queryByTestId('calendar-cover-image', hidden)).toBeNull();
    expect(dayCell(fallbackDays.broken).getByTestId('calendar-cover-default', hidden)).toBeTruthy();
    expect(dayCell(fallbackDays.missing).getByTestId('calendar-cover-default', hidden)).toBeTruthy();
    // 장르 글자는 S-62 장르별 통계에만 있고 날짜 칸에는 없다.
    for (const name of Object.values(fallbackDays)) {
        expect(dayCell(name).queryByText('소설/시', hidden)).toBeNull();
    }
});

test('FR-05 S-60 기록이 없는 날과 삭제된 기록만 있는 날은 날짜 숫자와 빈 표지 자리만 보여요', async () => {
    repository.books.list.mockReturnValue([
        coverBook('a', '데미안', 'https://cover.test/a.jpg'),
        { ...coverBook('gone', '삭제된 책', 'https://cover.test/gone.jpg'), deleted: true },
    ]);
    repository.sessions.list.mockReturnValue([
        session('deleted', '2026-11-03', 600, { bookId: 'a', deleted: true }),
        session('gone1', '2026-11-04', 600, { bookId: 'gone' }),
    ]);
    await renderRouter(routes, { initialUrl: '/calendar' });
    for (const day of [3, 4, 10]) {
        const cell = dayCell(`11월 ${day}일, 독서 기록 없음`);
        expect(cell.getByText(String(day))).toBeOnTheScreen();
        const area = cell.getByTestId('calendar-cover-area', hidden);
        expect(StyleSheet.flatten(area.props.style)).toMatchObject({ width: '100%', aspectRatio: 2 / 3 });
        expect(cell.queryByTestId('calendar-cover-image', hidden)).toBeNull();
        expect(cell.queryByTestId('calendar-cover-default', hidden)).toBeNull();
    }
});

test('FR-05 S-60 날짜 칸 라벨에 읽은 권수와 모든 책 제목을 담고 표지는 보조 기술에서 건너뛰어요', async () => {
    repository.books.list.mockReturnValue([coverBook('a', '책제목1', 'https://cover.test/a.jpg'), coverBook('b', '책제목2', null), coverBook('c', '책제목3', null)]);
    repository.sessions.list.mockReturnValue([
        session('a1', '2026-11-03', 900, { bookId: 'a' }),
        session('b1', '2026-11-03', 600, { bookId: 'b' }),
        session('c1', '2026-11-03', 300, { bookId: 'c' }),
    ]);
    await renderRouter(routes, { initialUrl: '/calendar' });
    const button = screen.getByRole('button', { name: '11월 3일, 3권 읽음: 책제목1, 책제목2, 책제목3' });
    expect(StyleSheet.flatten(button.props.style)).toMatchObject({ minWidth: 44 });
    const area = within(button).getByTestId('calendar-cover-area', hidden);
    expect(area.props.accessible).toBe(false);
    expect(area.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(within(button).getByTestId('calendar-cover-image', hidden).props.accessible).toBe(false);
    expect(screen.getByRole('button', { name: '11월 4일, 독서 기록 없음' })).toBeOnTheScreen();
});

test('FR-05 S-60 표지가 없거나 못 불러온 책은 기본 표지에 제목을, 찾을 수 없는 책은 "찾을 수 없는 책"을 보여 줘요', async () => {
    await renderFallbackDays(
        [coverBook('photo', '사진 있는 책', 'https://cover.test/photo.jpg')],
        [session('p1', '2026-11-06', 600, { bookId: 'photo' })],
    );
    expect(coverTitles(fallbackDays.none)).toEqual(['표지 없는 책']);
    expect(coverTitles(fallbackDays.broken)).toEqual([]);
    await failCover(fallbackDays.broken);
    expect(coverTitles(fallbackDays.broken)).toEqual(['깨진 표지 책']);
    expect(coverTitles(fallbackDays.missing)).toEqual(['찾을 수 없는 책']);
    expect(coverTitles('11월 6일, 1권 읽음: 사진 있는 책')).toEqual([]);
    const title = dayCell(fallbackDays.none).getByTestId('calendar-cover-title', hidden);
    expect(StyleSheet.flatten(title.props.style)).toMatchObject({ fontSize: 11, textAlign: 'center' });
    expect(title.props).toMatchObject({ numberOfLines: COVER_TITLE_LINES, ellipsizeMode: 'tail', maxFontSizeMultiplier: 1 });
});

test('FR-05 S-60 2권으로 반씩 나뉜 칸에서도 기본 표지마다 제목을 고정 3줄에서 말줄임해요', async () => {
    repository.books.list.mockReturnValue([coverBook('a', '아주 긴 제목의 첫 번째 책', null), coverBook('b', '두 번째 책', 'https://cover.test/b.jpg')]);
    repository.sessions.list.mockReturnValue([
        session('a1', '2026-11-03', 1200, { bookId: 'a' }),
        session('b1', '2026-11-03', 600, { bookId: 'b' }),
        session('m1', '2026-11-03', 300, { bookId: 'missing' }),
    ]);
    await renderRouter(routes, { initialUrl: '/calendar' });
    const name = '11월 3일, 3권 읽음: 아주 긴 제목의 첫 번째 책, 두 번째 책, 찾을 수 없는 책';
    expect(coverTitles(name)).toEqual(['아주 긴 제목의 첫 번째 책']);
    await failCover(name);
    expect(coverTitles(name)).toEqual(['아주 긴 제목의 첫 번째 책', '두 번째 책']);
    dayCell(name).getAllByTestId('calendar-cover-title', hidden)
        .forEach(title => expect(title.props).toMatchObject({ numberOfLines: COVER_TITLE_LINES, ellipsizeMode: 'tail', maxFontSizeMultiplier: 1 }));
});

test('FR-05 S-60 기본 표지의 제목 글자는 보조 기술에서 건너뛰고 날짜 칸 라벨로만 전달해요', async () => {
    repository.books.list.mockReturnValue([coverBook('a', '표지 없는 책', null)]);
    repository.sessions.list.mockReturnValue([session('a1', '2026-11-03', 600, { bookId: 'a' })]);
    await renderRouter(routes, { initialUrl: '/calendar' });
    expect(screen.queryByText('표지 없는 책')).toBeNull();
    const cell = dayCell('11월 3일, 1권 읽음: 표지 없는 책');
    const title = cell.getByTestId('calendar-cover-title', hidden);
    expect(title.props).toMatchObject({ accessible: false, importantForAccessibility: 'no' });
    expect(cell.getByTestId('calendar-cover-default', hidden).props.importantForAccessibility).toBe('no-hide-descendants');
});

test('FR-05 S-60 안내 문구 없이도 선택한 날짜 칸만 accessibilityState.selected가 true예요', async () => {
    repository.sessions.list.mockReturnValue([session('a', '2026-11-03', 600)]);
    await renderRouter(routes, { initialUrl: '/calendar' });
    expect(screen.queryByText(/테두리로 선택한 날짜/, hidden)).toBeNull();
    const today = screen.getByRole('button', { name: '11월 2일, 독서 기록 없음' });
    const other = screen.getByRole('button', { name: '11월 3일, 1권 읽음: 데미안' });
    expect(today.props.accessibilityState).toMatchObject({ selected: true });
    expect(other.props.accessibilityState).toMatchObject({ selected: false });
    await fireEvent.press(other);
    expect(screen.getByRole('button', { name: '11월 3일, 1권 읽음: 데미안' }).props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByRole('button', { name: '11월 2일, 독서 기록 없음' }).props.accessibilityState).toMatchObject({ selected: false });
});

test('FR-05 S-60 기본 표지 제목은 표지를 채우는 absolute 레이어에 있어 날짜 칸과 표지 크기를 바꾸지 않아요', async () => {
    repository.books.list.mockReturnValue([coverBook('a', '기본 표지 책', null), coverBook('b', '사진 책', 'https://cover.test/b.jpg')]);
    repository.sessions.list.mockReturnValue([
        session('a1', '2026-11-23', 600, { bookId: 'a' }),
        session('b1', '2026-11-24', 600, { bookId: 'b' }),
    ]);
    await renderRouter(routes, { initialUrl: '/calendar?date=2026-11-24' });
    const cellNames = ['11월 22일, 독서 기록 없음', '11월 23일, 1권 읽음: 기본 표지 책', '11월 24일, 1권 읽음: 사진 책', '11월 25일, 독서 기록 없음'];
    for (const name of cellNames) {
        const button = screen.getByRole('button', { name });
        // 모든 날짜 칸은 같은 비율로 폭을 나누고 내용 크기로 넓어지지 않는다.
        expect(StyleSheet.flatten(button.props.style)).toMatchObject({ flex: 1, flexBasis: 0, minWidth: 44 });
        expect(button.props.onLayout).toBeUndefined();
        const area = within(button).getByTestId('calendar-cover-area', hidden);
        expect(StyleSheet.flatten(area.props.style)).toMatchObject({ width: '100%', aspectRatio: 2 / 3, overflow: 'hidden' });
        expect(area.props.onLayout).toBeUndefined();
    }
    const cell = dayCell('11월 23일, 1권 읽음: 기본 표지 책');
    const cover = cell.getByTestId('calendar-cover-default', hidden);
    expect(cover.props.onLayout).toBeUndefined();
    expect(StyleSheet.flatten(cover.props.style)).toMatchObject({ flex: 1, flexBasis: 0, overflow: 'hidden' });
    const layer = cell.getByTestId('calendar-cover-title-layer', hidden);
    expect(StyleSheet.flatten(layer.props.style)).toMatchObject({ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' });
    expect(layer.props.onLayout).toBeUndefined();
    const title = within(layer).getByTestId('calendar-cover-title', hidden);
    expect(title.props.children).toBe('기본 표지 책');
    expect(title.props).toMatchObject({ numberOfLines: COVER_TITLE_LINES, maxFontSizeMultiplier: 1, accessible: false, importantForAccessibility: 'no' });
    expect(title.props.onLayout).toBeUndefined();
    expect(screen.getByRole('button', { name: '11월 24일, 1권 읽음: 사진 책' })).toBeSelected();
});

/** S-61 날짜별 기록의 책 줄. 라벨은 "제목, 총 시간, 책 상세 보기"다. */
function dayBookRow(title: string, duration: string) {
    return screen.getByRole('button', { name: `${title}, ${duration}, 책 상세 보기` });
}
function dayBookRows() {
    return screen.queryAllByRole('button', { name: /, 책 상세 보기$/ });
}

test('FR-05 S-61 같은 날 같은 책을 30분, 50분 두 번 읽으면 그 책이 한 줄로 나오고 "1시간 20분"이 표시돼요', async () => {
    repository.sessions.list.mockReturnValue([
        session('a1', '2026-11-02', 1800),
        session('a2', '2026-11-02', 3000, { startedAt: Date.parse('2026-11-02T15:00:00+09:00'), source: 'MANUAL', endPage: 40 }),
    ]);
    await renderRouter(routes, { initialUrl: '/calendar' });
    expect(dayBookRows()).toHaveLength(1);
    const row = dayBookRow('데미안', '1시간 20분');
    expect(within(row).getByText('데미안')).toBeOnTheScreen();
    expect(within(row).getByText('1시간 20분')).toBeOnTheScreen();
});

test('FR-05 S-61 쪽수, 시작 시각, 타이머/직접 입력 구분은 표시하지 않아요', async () => {
    repository.sessions.list.mockReturnValue([
        session('a1', '2026-11-02', 1800, { endPage: 30 }),
        session('a2', '2026-11-02', 600, { startedAt: Date.parse('2026-11-02T15:30:00+09:00'), source: 'MANUAL', startPage: 30, endPage: 50 }),
    ]);
    await renderRouter(routes, { initialUrl: '/calendar' });
    const row = dayBookRow('데미안', '40분');
    expect(within(row).queryByText(/쪽/)).toBeNull();
    expect(screen.queryByText(/12:00|15:30/)).toBeNull();
    expect(screen.queryByText('타이머 기록')).toBeNull();
    expect(screen.queryByText('직접 입력한 기록')).toBeNull();
});

test('FR-05 S-61 각 줄 왼쪽에 책 앞표지가 보이고 표지가 없으면 기본 표지가 보여요', async () => {
    repository.books.list.mockReturnValue([coverBook('a', '사진 책', 'https://cover.test/a.jpg'), coverBook('b', '표지 없는 책', null)]);
    repository.sessions.list.mockReturnValue([
        session('a1', '2026-11-02', 1200, { bookId: 'a' }),
        session('b1', '2026-11-02', 600, { bookId: 'b' }),
    ]);
    await renderRouter(routes, { initialUrl: '/calendar' });
    const photo = dayBookRow('사진 책', '20분');
    const image = within(photo).getByTestId('book-cover-image', hidden);
    expect(image.props.source.uri).toBe('https://cover.test/a.jpg');
    // 홈(S-10)과 같은 66×99 표지
    expect(StyleSheet.flatten(image.props.style)).toMatchObject({ width: 66, height: 99 });
    // 표지 묶음이 가로 줄의 첫 자식이라 표지가 왼쪽, 제목·시간이 오른쪽이다.
    expect(StyleSheet.flatten(photo.props.style)).toMatchObject({ flexDirection: 'row' });
    expect(photo.children[0]).toBe(within(photo).getByTestId('day-book-cover', hidden));
    const none = dayBookRow('표지 없는 책', '10분');
    expect(within(none).queryByTestId('book-cover-image', hidden)).toBeNull();
    const fallback = within(none).getByTestId('book-cover-default', hidden);
    expect(within(fallback).getByText('소설/시', hidden)).toBeTruthy();
});

test('FR-05 S-61 표지를 불러오지 못하면 기본 표지로 바꿔 보여 줘요', async () => {
    repository.books.list.mockReturnValue([coverBook('a', '깨진 표지 책', 'https://cover.test/broken.jpg')]);
    repository.sessions.list.mockReturnValue([session('a1', '2026-11-02', 600, { bookId: 'a' })]);
    await renderRouter(routes, { initialUrl: '/calendar' });
    const row = () => within(dayBookRow('깨진 표지 책', '10분'));
    await act(async () => fireEvent(row().getByTestId('book-cover-image', hidden), 'error'));
    expect(row().queryByTestId('book-cover-image', hidden)).toBeNull();
    expect(row().getByTestId('book-cover-default', hidden)).toBeTruthy();
});

test('FR-05 S-61 책 순서가 위 달력 날짜 칸의 표지 순서와 같아요', async () => {
    const ids = ['a', 'b', 'c'];
    repository.books.list.mockReturnValue(ids.map(id => coverBook(id, `책${id}`, `https://cover.test/${id}.jpg`)));
    repository.sessions.list.mockReturnValue([
        // a는 한 번씩은 짧지만 합치면 가장 길고, b와 c는 같은 시간이라 먼저 시작한 c가 앞선다.
        session('a1', '2026-11-03', 600, { bookId: 'a', startedAt: Date.parse('2026-11-03T13:00:00+09:00') }),
        session('a2', '2026-11-03', 600, { bookId: 'a', startedAt: Date.parse('2026-11-03T14:00:00+09:00') }),
        session('b1', '2026-11-03', 900, { bookId: 'b', startedAt: Date.parse('2026-11-03T12:30:00+09:00') }),
        session('c1', '2026-11-03', 900, { bookId: 'c', startedAt: Date.parse('2026-11-03T12:00:00+09:00') }),
    ]);
    await renderRouter(routes, { initialUrl: '/calendar?date=2026-11-03' });
    expect(coverUris('11월 3일, 3권 읽음: 책a, 책c, 책b')).toEqual(['https://cover.test/a.jpg', 'https://cover.test/c.jpg']);
    expect(dayBookRows().map(row => row.props.accessibilityLabel)).toEqual([
        '책a, 20분, 책 상세 보기', '책c, 15분, 책 상세 보기', '책b, 15분, 책 상세 보기',
    ]);
});

test('FR-05 S-61 책 정보를 찾을 수 없는 기록은 "찾을 수 없는 책"과 기본 표지로 보이고 누를 수 없어요', async () => {
    repository.sessions.list.mockReturnValue([session('m1', '2026-11-02', 600, { bookId: 'missing' })]);
    await renderRouter(routes, { initialUrl: '/calendar' });
    const row = dayBookRow('찾을 수 없는 책', '10분');
    expect(within(row).getByText('찾을 수 없는 책')).toBeOnTheScreen();
    expect(within(row).getByTestId('book-cover-default', hidden)).toBeTruthy();
    expect(row).toBeDisabled();
    expect(row.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(row);
    expect(screen).toHavePathname('/calendar');
});

test('FR-05 S-61 삭제된 세션과 삭제된 책의 기록은 달력 칸처럼 날짜별 기록에서도 빠져요', async () => {
    repository.books.list.mockReturnValue([book, { ...coverBook('gone', '삭제된 책', null), deleted: true }]);
    repository.sessions.list.mockReturnValue([
        session('a1', '2026-11-02', 600),
        session('a-deleted', '2026-11-02', 3600, { deleted: true }),
        session('gone1', '2026-11-02', 1200, { bookId: 'gone' }),
    ]);
    await renderRouter(routes, { initialUrl: '/calendar' });
    expect(screen.getByRole('button', { name: '11월 2일, 1권 읽음: 데미안' })).toBeSelected();
    expect(dayBookRows().map(row => row.props.accessibilityLabel)).toEqual(['데미안, 10분, 책 상세 보기']);
    expect(screen.queryByText('찾을 수 없는 책')).toBeNull();
});

test('FR-05 S-61 줄마다 버튼 역할과 "제목, 시간, 책 상세 보기" 라벨이 있고 표지는 건너뛰며 높이는 최소 44예요', async () => {
    repository.sessions.list.mockReturnValue([session('a1', '2026-11-02', 4800)]);
    await renderRouter(routes, { initialUrl: '/calendar' });
    const row = dayBookRow('데미안', '1시간 20분');
    expect(row.props.accessibilityRole).toBe('button');
    expect(StyleSheet.flatten(row.props.style)).toMatchObject({ minHeight: 44 });
    const cover = within(row).getByTestId('day-book-cover', hidden);
    expect(cover.props).toMatchObject({ accessible: false, importantForAccessibility: 'no-hide-descendants' });
    // 기본 표지의 장르 글자는 보조 기술에 노출되지 않는다.
    expect(within(row).queryByText('소설/시')).toBeNull();
});

test('FR-05 S-61 기록이 없는 날은 제목 "N월 N일 기록"과 빈 상태 안내만 보여요', async () => {
    repository.sessions.list.mockReturnValue([session('a1', '2026-11-03', 600)]);
    await renderRouter(routes, { initialUrl: '/calendar' });
    expect(screen.getByRole('header', { name: '11월 2일 기록' })).toBeOnTheScreen();
    expect(screen.getByText('이 날짜에는 독서 기록이 없어요.')).toBeOnTheScreen();
    expect(dayBookRows()).toHaveLength(0);
});
