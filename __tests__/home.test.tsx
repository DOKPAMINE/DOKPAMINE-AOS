import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { AppState, Text, type AppStateStatus } from 'react-native';

import HomeScreen from '../app/(tabs)/index';
import { initializeDatabase } from '../src/db/client';
import type { BookRecord, SessionRecord } from '../src/db/schema';

jest.mock('../src/db/client', () => ({ initializeDatabase: jest.fn() }));

const now = new Date('2026-11-02T12:00:00+09:00').getTime();
const book = (id: string, title: string, status: BookRecord['status'] = 'READING'): BookRecord => ({
    id, title, status, author: '지은이', totalPages: 240, currentPage: 84, genre: '소설',
    isbn: null, publisher: null, coverUrl: null, completedCount: 0, completedAt: null,
    createdAt: now, updatedAt: now, deleted: false, syncPending: true, localVersion: 1,
});
const first = book('11111111-1111-4111-8111-111111111111', '첫 번째 책');
const second = book('22222222-2222-4222-8222-222222222222', '두 번째 책');
function session(id: string, date: string, activeSeconds: number, extra: Partial<SessionRecord> = {}): SessionRecord {
    const startedAt = Date.parse(date);
    return { id, bookId: first.id, startedAt, endedAt: startedAt + activeSeconds * 1000,
        activeSeconds, startPage: 0, endPage: null, source: 'TIMER', createdAt: startedAt,
        syncPending: true, localVersion: 1, deleted: false, ...extra };
}

const repository = {
    books: { list: jest.fn<BookRecord[], []>() },
    sessions: { list: jest.fn<SessionRecord[], []>() },
    subscribe: jest.fn<() => void, [() => void]>(),
};
let changed: () => void;
const unsubscribe = jest.fn();
function prepared() { return { repository } as unknown as Awaited<ReturnType<typeof initializeDatabase>>; }

function Destination() {
    const params = useLocalSearchParams();
    return <Text accessibilityRole="header">{JSON.stringify(params)}</Text>;
}
const routes = { index: HomeScreen, 'book-add': Destination, 'reading-start': Destination };

beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(now);
    repository.books.list.mockReturnValue([]);
    repository.sessions.list.mockReturnValue([]);
    repository.subscribe.mockImplementation(listener => { changed = listener; return unsubscribe; });
    jest.mocked(initializeDatabase).mockResolvedValue(prepared());
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

test('FR-04 S-10 로딩 후 책이 없으면 빈 안내와 두 등록 진입을 보여 줘요', async () => {
    let finish!: (value: Awaited<ReturnType<typeof initializeDatabase>>) => void;
    jest.mocked(initializeDatabase).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    await renderRouter(routes, { initialUrl: '/' });
    expect(screen.getByText('독서 기록을 불러오고 있어요.')).toBeOnTheScreen();
    expect(screen.queryByText('0일')).toBeNull();
    await act(async () => finish(prepared()));
    expect(screen.getByText('아직 등록한 책이 없어요. 첫 책을 등록해 주세요.')).toBeOnTheScreen();
    expect(screen.getByText('0일')).toBeOnTheScreen();
    expect(screen.getByText('0초')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '책 등록하기' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '읽고 싶은 책 등록하기' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: '오늘의 명언' })).toBeOnTheScreen();
}, 30_000);

test.each([['책 등록하기', '/book-add', {}], ['읽고 싶은 책 등록하기', '/book-add', {}]])(
    'FR-04 S-10 %s에서 등록 경로와 상태를 전달해요', async (label, pathname, params) => {
        await renderRouter(routes, { initialUrl: '/' });
        await fireEvent.press(screen.getByRole('button', { name: label }));
        expect(screen).toHavePathname(pathname);
        expect(screen.getByRole('header')).toHaveTextContent(JSON.stringify(params));
    },
);

test('FR-04 S-10 포커스로 복귀해도 초기화 대기 중 기존 기록을 유지해요', async () => {
    repository.books.list.mockReturnValue([first]);
    await renderRouter({ ...routes, _layout: () => <Stack screenOptions={{ headerShown: false }} /> }, { initialUrl: '/' });
    await screen.findByRole('radio', { name: '첫 번째 책, 지은이' });
    await fireEvent.press(screen.getByRole('button', { name: '책 등록하기' }));
    let finish!: (value: Awaited<ReturnType<typeof initializeDatabase>>) => void;
    jest.mocked(initializeDatabase).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    await act(async () => router.back());
    expect(screen.getByRole('radio', { name: '첫 번째 책, 지은이' })).toBeOnTheScreen();
    expect(screen.queryByText('독서 기록을 불러오고 있어요.')).toBeNull();
    await act(async () => finish(prepared()));
    expect(screen.getByRole('radio', { name: '첫 번째 책, 지은이' })).toBeOnTheScreen();
});

test('FR-02 FR-04 S-10 읽는 중 책만 선택하고 같은 UUID로 독서 시작에 진입해요', async () => {
    repository.books.list.mockReturnValue([first, second, book('want', '읽고 싶은 책', 'WANT'), book('done', '완독한 책', 'DONE')]);
    await renderRouter(routes, { initialUrl: '/' });
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(screen.getAllByRole('progressbar')[0]).toHaveAccessibilityValue({ text: '84 / 240쪽' });
    expect(screen.getByRole('radio', { name: '첫 번째 책, 지은이' })).toBeChecked();
    await fireEvent.press(screen.getByRole('radio', { name: '두 번째 책, 지은이' }));
    expect(screen.getByRole('radio', { name: '두 번째 책, 지은이' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '첫 번째 책, 지은이' })).not.toBeChecked();
    await fireEvent.press(screen.getByRole('button', { name: '두 번째 책 독서 시작하기' }));
    expect(screen).toHavePathname('/reading-start');
    expect(screen.getByRole('header')).toHaveTextContent(JSON.stringify({ bookId: second.id }));
});

test('FR-04 FR-05 S-10 KST 연속일과 월요일부터의 주간 시간이 도메인 규칙과 일치해요', async () => {
    repository.books.list.mockReturnValue([first]);
    repository.sessions.list.mockReturnValue([
        session('today', '2026-11-01T15:00:00Z', 26 * 3600, { source: 'MANUAL' }),
        session('yesterday1', '2026-11-01T14:59:00Z', 30),
        session('yesterday2', '2026-11-01T09:00:00Z', 30),
        session('under-minute', '2026-10-31T09:00:00Z', 59),
        session('deleted', '2026-11-02T01:00:00Z', 3600, { deleted: true }),
        session('future', '2026-11-02T15:00:00Z', 3600),
    ]);
    await renderRouter(routes, { initialUrl: '/' });
    expect(screen.getByText('2일')).toBeOnTheScreen();
    expect(screen.getByText('26시간 0분')).toBeOnTheScreen();
});

test('NFR-04 FR-04 S-10 기록 변경으로 선택한 책이 없어지면 남은 책으로 갱신하고 구독을 해제해요', async () => {
    repository.books.list.mockReturnValue([first, second]);
    const rendered = await renderRouter(routes, { initialUrl: '/' });
    await fireEvent.press(screen.getByRole('radio', { name: '두 번째 책, 지은이' }));
    repository.books.list.mockReturnValue([first]);
    await act(async () => changed());
    expect(screen.getByRole('button', { name: '첫 번째 책 독서 시작하기' })).toBeOnTheScreen();
    repository.books.list.mockReturnValue([book('done', '완독한 책', 'DONE')]);
    await act(async () => changed());
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.getByText('읽는 중인 책이 없어요. 읽을 책을 등록해 주세요.')).toBeOnTheScreen();
    await rendered.unmount();
    expect(unsubscribe).toHaveBeenCalled();
});

test('FR-04 S-10 저장소 초기화 또는 읽기 오류에서 재시도할 수 있어요', async () => {
    jest.mocked(initializeDatabase).mockRejectedValueOnce(new Error('DB 실패'));
    await renderRouter(routes, { initialUrl: '/' });
    expect(screen.getByRole('alert')).toHaveTextContent('독서 기록을 불러오지 못했어요.');
    repository.books.list.mockImplementationOnce(() => { throw new Error('읽기 실패'); });
    await fireEvent.press(screen.getByRole('button', { name: '다시 시도해 주세요' }));
    expect(screen.getByRole('alert')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '다시 시도해 주세요' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('0일')).toBeOnTheScreen();
});

test('FR-05 S-10 앱 복귀 시 KST 날짜와 저장된 기록을 다시 읽어요', async () => {
    let onActive!: (state: AppStateStatus) => void;
    const remove = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
        onActive = listener; return { remove };
    });
    repository.sessions.list.mockReturnValue([session('today', '2026-11-02T01:00:00Z', 60)]);
    const rendered = await renderRouter(routes, { initialUrl: '/' });
    expect(screen.getByText('1일')).toBeOnTheScreen();
    jest.setSystemTime(Date.parse('2026-11-04T00:00:00+09:00'));
    await act(async () => onActive('active'));
    expect(screen.getByText('0일')).toBeOnTheScreen();
    await rendered.unmount();
    expect(remove).toHaveBeenCalled();
});
