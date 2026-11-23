import { act, fireEvent, renderRouter, screen, within } from 'expo-router/testing-library';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import CalendarScreen from '../../../app/(tabs)/calendar';
import { initializeDatabase } from '../../db/client';
import type { BookRecord, SessionRecord } from '../../db/schema';
import { colors } from '../../theme';

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
    expect(screen.getByText('이 달에는 독서 기록이 없어요.')).toBeOnTheScreen();
    expect(screen.getByText('0초')).toBeOnTheScreen();
    expect(screen.getByText('0쪽')).toBeOnTheScreen();
    expect(screen.getByText('0권')).toBeOnTheScreen();
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
    expect(screen.getAllByText('데미안')).toHaveLength(2);
    expect(screen.getByText('직접 입력한 기록')).toBeOnTheScreen();
    expect(screen.getByText('30분')).toBeOnTheScreen();
    expect(screen.getByText('50쪽')).toBeOnTheScreen();
    expect(screen.getByText('1권')).toBeOnTheScreen();
    expect(screen.getAllByText('30분 · 50쪽')).toHaveLength(2);
    expect(screen.getByText('소설/시')).toBeOnTheScreen();    expect(screen.getByText('헤르만 헤세')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '10월 7일, 독서 기록 없음' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '10월 6일, 1권 읽음: 데미안' }));
    expect(screen.getByRole('header', { name: '10월 6일 기록' })).toBeOnTheScreen();
    expect(screen.getByText('12:00 · 59초 · 0쪽')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '다음 달' }));
    expect(screen.getByRole('header', { name: '2026년 11월' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '11월 6일, 독서 기록 없음' })).toBeSelected();
    expect(screen.getByText('1시간 0분')).toBeOnTheScreen();
    expect(screen.getByText('10쪽')).toBeOnTheScreen();
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

test('FR-05 S-61 기록 항목은 해당 책 상세로 이동해요', async () => {
    repository.sessions.list.mockReturnValue([session('a', '2026-11-02', 600)]);
    await renderRouter(routes, { initialUrl: '/calendar' });
    await fireEvent.press(screen.getByRole('button', { name: '데미안, 12:00 · 10분 · 0쪽, 책 상세 보기' }));
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
    expect(screen.getByText('0권')).toBeOnTheScreen();
    expect(screen.getByText('0초')).toBeOnTheScreen();
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
    expect(StyleSheet.flatten(image.props.style)).toMatchObject({ flex: 1, height: '100%' });
    expect(image.props.resizeMode).toBe('cover');
    expect(screen.queryByText('●')).toBeNull();
    expect(screen.queryByText('날짜 아래에 그날 읽은 책 표지를 보여 주고, 테두리로 선택한 날짜를 표시해요.', hidden)).toBeNull();
    expect(screen.queryByText(/테두리로 선택한 날짜/, hidden)).toBeNull();
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
    repository.books.list.mockReturnValue([coverBook('none', '표지 없는 책', null), coverBook('broken', '깨진 표지 책', 'https://cover.test/broken.jpg')]);
    repository.sessions.list.mockReturnValue([
        session('n1', '2026-11-03', 600, { bookId: 'none' }),
        session('b1', '2026-11-04', 600, { bookId: 'broken' }),
        session('m1', '2026-11-05', 600, { bookId: 'missing' }),
    ]);
    await renderRouter(routes, { initialUrl: '/calendar' });
    const fallback = dayCell('11월 3일, 1권 읽음: 표지 없는 책').getByTestId('calendar-cover-default', hidden);
    expect(StyleSheet.flatten(fallback.props.style)).toMatchObject({ flex: 1, backgroundColor: colors.brand.sand });
    const broken = '11월 4일, 1권 읽음: 깨진 표지 책';
    await act(async () => fireEvent(dayCell(broken).getByTestId('calendar-cover-image', hidden), 'error'));
    expect(dayCell(broken).queryByTestId('calendar-cover-image', hidden)).toBeNull();
    expect(dayCell(broken).getByTestId('calendar-cover-default', hidden)).toBeTruthy();
    expect(dayCell('11월 5일, 1권 읽음: 찾을 수 없는 책').getByTestId('calendar-cover-default', hidden)).toBeTruthy();
    // 장르 글자는 S-62 장르별 통계에만 있고 날짜 칸에는 없다.
    for (const name of ['11월 3일, 1권 읽음: 표지 없는 책', broken, '11월 5일, 1권 읽음: 찾을 수 없는 책']) {
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

function coverTitles(name: string) {
    return dayCell(name).queryAllByTestId('calendar-cover-title', hidden).map(title => title.props.children);
}

test('FR-05 S-60 표지가 없거나 못 불러온 책은 기본 표지에 제목을, 찾을 수 없는 책은 "찾을 수 없는 책"을 보여 줘요', async () => {
    repository.books.list.mockReturnValue([
        coverBook('none', '표지 없는 책', null),
        coverBook('broken', '깨진 표지 책', 'https://cover.test/broken.jpg'),
        coverBook('photo', '사진 있는 책', 'https://cover.test/photo.jpg'),
    ]);
    repository.sessions.list.mockReturnValue([
        session('n1', '2026-11-03', 600, { bookId: 'none' }),
        session('b1', '2026-11-04', 600, { bookId: 'broken' }),
        session('m1', '2026-11-05', 600, { bookId: 'missing' }),
        session('p1', '2026-11-06', 600, { bookId: 'photo' }),
    ]);
    await renderRouter(routes, { initialUrl: '/calendar' });
    expect(coverTitles('11월 3일, 1권 읽음: 표지 없는 책')).toEqual(['표지 없는 책']);
    const broken = '11월 4일, 1권 읽음: 깨진 표지 책';
    expect(coverTitles(broken)).toEqual([]);
    await act(async () => fireEvent(dayCell(broken).getByTestId('calendar-cover-image', hidden), 'error'));
    expect(coverTitles(broken)).toEqual(['깨진 표지 책']);
    expect(coverTitles('11월 5일, 1권 읽음: 찾을 수 없는 책')).toEqual(['찾을 수 없는 책']);
    expect(coverTitles('11월 6일, 1권 읽음: 사진 있는 책')).toEqual([]);
    const title = dayCell('11월 3일, 1권 읽음: 표지 없는 책').getByTestId('calendar-cover-title', hidden);
    expect(StyleSheet.flatten(title.props.style)).toMatchObject({ fontSize: 11, textAlign: 'center' });
    expect(title.props).toMatchObject({ numberOfLines: 3, ellipsizeMode: 'tail', maxFontSizeMultiplier: 1 });
});

test('FR-05 S-60 2권으로 반씩 나뉜 칸에서도 기본 표지마다 제목을 칸 높이에 맞는 줄 수로 말줄임해요', async () => {
    repository.books.list.mockReturnValue([coverBook('a', '아주 긴 제목의 첫 번째 책', null), coverBook('b', '두 번째 책', 'https://cover.test/b.jpg')]);
    repository.sessions.list.mockReturnValue([
        session('a1', '2026-11-03', 1200, { bookId: 'a' }),
        session('b1', '2026-11-03', 600, { bookId: 'b' }),
        session('m1', '2026-11-03', 300, { bookId: 'missing' }),
    ]);
    await renderRouter(routes, { initialUrl: '/calendar' });
    const name = '11월 3일, 3권 읽음: 아주 긴 제목의 첫 번째 책, 두 번째 책, 찾을 수 없는 책';
    expect(coverTitles(name)).toEqual(['아주 긴 제목의 첫 번째 책']);
    await act(async () => fireEvent(dayCell(name).getByTestId('calendar-cover-image', hidden), 'error'));
    expect(coverTitles(name)).toEqual(['아주 긴 제목의 첫 번째 책', '두 번째 책']);
    const [first] = dayCell(name).getAllByTestId('calendar-cover-default', hidden);
    await act(async () => fireEvent(first, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 19, height: 58 } } }));
    const [firstTitle, secondTitle] = dayCell(name).getAllByTestId('calendar-cover-title', hidden);
    expect(firstTitle.props.numberOfLines).toBe(4);
    expect(secondTitle.props.numberOfLines).toBe(3);
    await act(async () => fireEvent(first, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 19, height: 5 } } }));
    expect(dayCell(name).getAllByTestId('calendar-cover-title', hidden)[0].props.numberOfLines).toBe(1);
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
