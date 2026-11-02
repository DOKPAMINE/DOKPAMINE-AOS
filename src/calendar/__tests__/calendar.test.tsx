import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { router, useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';

import CalendarScreen from '../../../app/(tabs)/calendar';
import { initializeDatabase } from '../../db/client';
import type { BookRecord, SessionRecord } from '../../db/schema';

jest.mock('../../db/client', () => ({ initializeDatabase: jest.fn() }));

const now = Date.parse('2026-11-02T00:00:00+09:00');
const book: BookRecord = {
    id: 'book', title: '데미안', author: '헤르만 헤세', genre: '소설', totalPages: 240,
    currentPage: 240, status: 'DONE', completedAt: Date.parse('2026-10-31T14:59:59Z'),
    isbn: null, publisher: null, coverUrl: null, completedCount: 1,
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
    expect(screen.getByRole('button', { name: '10월 5일, 독서함' })).toBeSelected();
    expect(screen.getAllByText('데미안')).toHaveLength(2);
    expect(screen.getByText('직접 입력한 기록')).toBeOnTheScreen();
    expect(screen.getByText('30분')).toBeOnTheScreen();
    expect(screen.getByText('50쪽')).toBeOnTheScreen();
    expect(screen.getByText('1권')).toBeOnTheScreen();
    expect(screen.getAllByText('30분 · 50쪽')).toHaveLength(2);
    expect(screen.getByText('소설')).toBeOnTheScreen();
    expect(screen.getByText('헤르만 헤세')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '10월 7일, 독서 기록 없음' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '10월 6일, 독서함' }));
    expect(screen.getByRole('header', { name: '10월 6일 기록' })).toBeOnTheScreen();
    expect(screen.getByText('12:00 · 59초 · 0쪽')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '다음 달' }));
    expect(screen.getByRole('header', { name: '2026년 11월' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '11월 6일, 독서 기록 없음' })).toBeSelected();
    expect(screen.getByText('1시간 0분')).toBeOnTheScreen();
    expect(screen.getByText('10쪽')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '이전 달' }));
    expect(screen.getByRole('button', { name: '10월 6일, 독서함' })).toBeSelected();
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
    expect(screen.getByRole('button', { name: '11월 2일, 독서함' })).toBeSelected();
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
