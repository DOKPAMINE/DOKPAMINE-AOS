import { Text } from 'react-native';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import Storage from 'expo-sqlite/kv-store';
import * as Notifications from 'expo-notifications';
import { tokenStorage } from '../../api/tokenStorage';
import { initializeDatabase, prepareRecordDatabase } from '../../db/client';
import { memorySQLite } from '../../db/__tests__/sqliteAdapter';
import type { SaveInput } from '../../db/repository';
import type { BookRecord } from '../../db/schema';
import { finishTimer, pauseTimer, startTimer } from '../../domain/timerState';
import ReadingScreen from '../ReadingScreen';
import { readingStorage } from '../storage';
import { requestReadingPermission } from '../notifications';
import { saveReading } from '../saveReading';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));
jest.mock('expo-sqlite/kv-store', () => {
    const values = new Map<string, string>();
    return { __esModule: true, default: {
        getItemSync: jest.fn((key: string) => values.get(key) ?? null),
        setItemSync: jest.fn((key: string, value: string) => { values.set(key, value); }),
        removeItemSync: jest.fn((key: string) => values.delete(key)),
        clearSync: () => values.clear(),
    } };
});
jest.mock('expo-notifications', () => ({
    AndroidImportance: { LOW: 2 }, setNotificationChannelAsync: jest.fn(),
    getPermissionsAsync: jest.fn(), requestPermissionsAsync: jest.fn(),
}));
jest.mock('../../api/tokenStorage', () => ({ tokenStorage: { getSession: jest.fn() } }));
jest.mock('../../db/client', () => ({ ...jest.requireActual('../../db/client'), initializeDatabase: jest.fn() }));
jest.mock('expo-font', () => ({ ...jest.requireActual('expo-font'), isLoaded: () => true, loadAsync: jest.fn() }));

const id = '00000000-0000-4000-8000-000000000001';
const sessionId = '00000000-0000-4000-8000-000000000002';
const t0 = Date.parse('2026-11-02T01:00:00Z');
const book: SaveInput<BookRecord> = { id, title: '데미안', author: '헤르만 헤세', isbn: null, publisher: null, totalPages: 240, currentPage: 84, genre: '소설', status: 'READING', coverUrl: null, completedCount: 0, completedAt: null };
let memory: ReturnType<typeof memorySQLite>;
let prepared: Awaited<ReturnType<typeof prepareRecordDatabase>>;
const routes = { 'reading-start': ReadingScreen, '(tabs)/index': () => <Text>홈</Text>, '(tabs)/calendar': () => <Text>캘린더 날짜별 기록</Text> };
const open = () => renderRouter(routes, { initialUrl: `/reading-start?bookId=${id}` });
beforeEach(async () => {
    Storage.clearSync();
    memory = memorySQLite();
    prepared = await prepareRecordDatabase(memory.sqlite);
    prepared.repository.books.save(book);
    jest.mocked(initializeDatabase).mockResolvedValue(prepared);
    jest.mocked(tokenStorage.getSession).mockResolvedValue({ userId: 'reader', accessToken: 'token', expiresAt: '2099-01-01' });
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ granted: false, canAskAgain: true } as Notifications.NotificationPermissionsStatus);
    jest.mocked(Notifications.requestPermissionsAsync).mockResolvedValue({ granted: false } as Notifications.NotificationPermissionsStatus);
    jest.useFakeTimers();
    jest.setSystemTime(t0);
});
afterEach(() => { memory.connection.close(); jest.restoreAllMocks(); jest.clearAllMocks(); jest.useRealTimers(); });

test('FR-02 FR-03 S-40~45 시작·일시정지·재개·저장 후 책 쪽과 같은 UUID의 세션을 갱신해요', async () => {
    await open();
    expect(await screen.findByLabelText('시작 쪽')).toHaveDisplayValue('84');
    await fireEvent.changeText(screen.getByLabelText('시작 쪽'), '60');
    await fireEvent.press(screen.getByRole('button', { name: '독서 시작' }));
    const draft = readingStorage('reader').load()!;
    jest.setSystemTime(t0 + 61000);
    await fireEvent.press(screen.getByRole('button', { name: '잠깐 쉬기' }));
    expect(readingStorage('reader').load()?.timer.runningSinceMs).toBeNull();
    expect(screen.queryByText('기록 버리기')).toBeNull();
    jest.setSystemTime(t0 + 3600000);
    await fireEvent.press(screen.getByRole('button', { name: '계속 읽기' }));
    jest.setSystemTime(t0 + 3630000);
    await fireEvent.changeText(screen.getByLabelText('지금 읽는 쪽 (선택)'), '120');
    await fireEvent.press(screen.getByRole('button', { name: '마치기' }));
    await fireEvent.press(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByRole('header', { name: '저장 완료' })).toBeOnTheScreen();
    expect(prepared.repository.sessions.list()).toEqual([expect.objectContaining({ id: draft.timer.sessionId, source: 'TIMER', startPage: 60, endPage: 120, activeSeconds: 91, syncPending: true })]);
    expect(prepared.repository.books.get(id)).toMatchObject({ currentPage: 120, status: 'READING', syncPending: true });
    expect(readingStorage('reader').load()).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: '캘린더에서 보기' }));
    expect(await screen.findByText('캘린더 날짜별 기록')).toBeOnTheScreen();
    expect(screen).toHaveSearchParams({ date: '2026-11-02' });
});

test.each([true, false])('FR-02 S-41 S-42 재시작 복원은 일시정지=%s와 세션 ID·입력을 유지해요', async paused => {
    const initial = { ...startTimer(sessionId, id, 84, t0), endPageDraft: '100' };
    readingStorage('reader').save({ timer: paused ? pauseTimer(initial, t0 + 60000) : initial, confirmedChecks: 0 });
    jest.setSystemTime(t0 + 120000);
    await open();
    expect(await screen.findByRole('header', { name: paused ? '잠깐 쉬는 중이에요' : '독서 측정 중' })).toBeOnTheScreen();
    expect(screen.getByLabelText('지금 읽는 쪽 (선택)')).toHaveDisplayValue('100');
    expect(readingStorage('reader').load()?.timer.sessionId).toBe(sessionId);
    expect(screen.getByLabelText(`독서 시간 ${paused ? '00:01:00' : '00:02:00'}`)).toBeOnTheScreen();
});

test('FR-03 S-43 E-02 범위 오류는 저장하지 않고 빈칸은 시간만 저장해요', async () => {
    readingStorage('reader').save({ timer: finishTimer(startTimer(sessionId, id, 84, t0), t0 + 60000), confirmedChecks: 0 });
    await open();
    await fireEvent.changeText(await screen.findByLabelText('마지막으로 읽은 쪽 (선택)'), '241');
    await fireEvent.press(screen.getByRole('button', { name: '저장' }));
    expect(screen.getByText('페이지를 확인해 주세요')).toBeOnTheScreen();
    expect(prepared.repository.sessions.list()).toHaveLength(0);
    await fireEvent.changeText(screen.getByLabelText('마지막으로 읽은 쪽 (선택)'), '');
    await fireEvent.press(screen.getByRole('button', { name: '저장' }));
    expect(prepared.repository.sessions.get(sessionId)?.endPage).toBeNull();
    expect(prepared.repository.books.get(id)?.currentPage).toBe(84);
});

test('FR-03 S-44 완독 확인 후 끝 쪽·완독 횟수·날짜를 저장해요', async () => {
    const timer = { ...finishTimer(startTimer(sessionId, id, 84, t0), t0 + 60000), endPageDraft: '240' };
    readingStorage('reader').save({ timer, confirmedChecks: 0 });
    await open();
    await fireEvent.press(await screen.findByRole('button', { name: '저장' }));
    expect(prepared.repository.sessions.list()).toHaveLength(0);
    await fireEvent.press(screen.getByRole('button', { name: '완독으로 저장' }));
    expect(prepared.repository.books.get(id)).toMatchObject({ currentPage: 240, status: 'DONE', completedCount: 1, completedAt: t0 + 60000 });
    await act(() => { prepared.repository.atomic(() => saveReading(prepared.repository, timer, true, t0 + 70000)); });
    expect(prepared.repository.books.get(id)?.completedCount).toBe(1);
    expect(prepared.repository.sessions.list()).toHaveLength(1);
});

test('FR-03 E-02 되돌아 읽기는 확인하고 저장해요', async () => {
    readingStorage('reader').save({ timer: { ...finishTimer(startTimer(sessionId, id, 84, t0), t0 + 60000), endPageDraft: '60' }, confirmedChecks: 0 });
    await open();
    await fireEvent.press(await screen.findByRole('button', { name: '저장' }));
    expect(prepared.repository.sessions.list()).toHaveLength(0);
    await fireEvent.press(screen.getByRole('button', { name: '되돌아 읽기로 저장' }));
    expect(prepared.repository.books.get(id)?.currentPage).toBe(60);
});

test('NFR-04 S-45 기기 쓰기 실패는 책 변경을 롤백하고 같은 ID로 재시도해요', async () => {
    readingStorage('reader').save({ timer: { ...finishTimer(startTimer(sessionId, id, 84, t0), t0 + 60000), endPageDraft: '120' }, confirmedChecks: 0 });
    const save = jest.spyOn(prepared.repository.sessions, 'save').mockImplementationOnce(() => { throw new Error('SQLITE_FULL'); });
    await open();
    await fireEvent.press(await screen.findByRole('button', { name: '저장' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/저장하지 못했어요/);
    expect(prepared.repository.books.get(id)?.currentPage).toBe(84);
    expect(readingStorage('reader').load()?.timer.sessionId).toBe(sessionId);
    save.mockRestore();
    await fireEvent.press(screen.getByRole('button', { name: '저장' }));
    expect(prepared.repository.sessions.get(sessionId)?.endPage).toBe(120);
});

test('FR-15 NFR-08 S-46 알림 거절 상태에서도 재실행 시 90분 확인이 열려요', async () => {
    readingStorage('reader').save({ timer: startTimer(sessionId, id, 84, t0), confirmedChecks: 0 });
    jest.setSystemTime(t0 + 6 * 3600000);
    await open();
    expect(await screen.findByRole('header', { name: '계속 읽고 계신가요?' })).toBeOnTheScreen();
    expect(readingStorage('reader').load()?.timer.accumulatedMs).toBe(90 * 60000);
    await fireEvent.press(screen.getByRole('button', { name: '계속 읽고 있어요' }));
    await waitFor(() => expect(screen.queryByText('계속 읽고 계신가요?')).toBeNull());
    expect(readingStorage('reader').load()).toMatchObject({ confirmedChecks: 1, timer: { runningSinceMs: t0 + 6 * 3600000 } });
});

test('NFR-08 S-40 알림 권한은 첫 독서 시작 때 한 번만 요청하고 거절해도 이어져요', async () => {
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(await requestReadingPermission()).toContain('앱 안에서');
    expect(await requestReadingPermission()).toBeNull();
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
});

test('FR-02 S-42 계정이 바뀌어도 다른 계정의 타이머를 복원하지 않아요', () => {
    readingStorage('reader').save({ timer: pauseTimer(startTimer(sessionId, id, 84, t0), t0 + 60000), confirmedChecks: 0 });
    expect(readingStorage('other').load()).toBeNull();
    expect(readingStorage('reader').load()?.timer.runningSinceMs).toBeNull();
});

test.each(['없는', '삭제된'])('FR-02 S-40 S-42 복원할 책이 %s 책이면 임시 타이머를 비우고 선택한 책을 시작해요', async kind => {
    const oldBookId = '00000000-0000-4000-8000-000000000003';
    if (kind === '삭제된') {
        prepared.repository.books.save({ ...book, id: oldBookId });
        prepared.repository.books.softDelete(oldBookId);
    }
    readingStorage('reader').save({ timer: startTimer(sessionId, oldBookId, 84, t0), confirmedChecks: 0 });
    await open();
    expect(await screen.findByText(/진행 중이던 책을 찾을 수 없어/)).toBeOnTheScreen();
    expect(readingStorage('reader').load()).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: '독서 시작' }));
    expect(readingStorage('reader').load()?.timer.bookId).toBe(id);
});

test('FR-02 S-40 S-42 선택한 책도 삭제되면 초기화 안내와 홈 경로를 보여 줘요', async () => {
    readingStorage('reader').save({ timer: startTimer(sessionId, id, 84, t0), confirmedChecks: 0 });
    prepared.repository.books.softDelete(id);
    await open();
    expect(await screen.findByText(/진행 중이던 책을 찾을 수 없어/)).toBeOnTheScreen();
    expect(readingStorage('reader').load()).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: '홈으로' }));
    expect(await screen.findByText('홈')).toBeOnTheScreen();
});

test.each([true, false])('FR-03 S-44 저장 전에 이미 완독한 책은 완독 선택=%s여도 횟수·날짜·상태를 유지해요', complete => {
    prepared.repository.books.save({ ...book, status: 'DONE', currentPage: 240, completedCount: 2, completedAt: t0 + 30000 });
    const timer = { ...finishTimer(startTimer(sessionId, id, 84, t0), t0 + 60000), endPageDraft: '240' };
    prepared.repository.atomic(() => saveReading(prepared.repository, timer, complete, t0 + 70000));
    expect(prepared.repository.books.get(id)).toMatchObject({ status: 'DONE', completedCount: 2, completedAt: t0 + 30000 });
    expect(prepared.repository.sessions.list()).toHaveLength(1);
});

test('FR-03 S-45 읽고 싶은 책의 타이머를 저장하면 읽는 중으로 바꿔요', () => {
    prepared.repository.books.save({ ...book, status: 'WANT' });
    const timer = finishTimer(startTimer(sessionId, id, 84, t0), t0 + 60000);
    prepared.repository.atomic(() => saveReading(prepared.repository, timer, false, t0 + 70000));
    expect(prepared.repository.books.get(id)?.status).toBe('READING');
});

test.each([true, false])('NFR-04 S-42 S-45 저장 뒤 초기화가 실패한 세션의 삭제=%s를 복원 시 확인해요', async deleted => {
    readingStorage('reader').save({ timer: finishTimer(startTimer(sessionId, id, 84, t0), t0 + 60000), confirmedChecks: 0 });
    await open();
    jest.mocked(Storage.removeItemSync).mockImplementationOnce(() => { throw new Error('SQLITE_FULL'); });
    await fireEvent.press(await screen.findByRole('button', { name: '저장' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/저장하지 못했어요/);
    expect(prepared.repository.sessions.get(sessionId)).not.toBeNull();
    await screen.unmount();
    if (deleted) prepared.repository.sessions.softDelete(sessionId);
    await open();
    if (deleted) {
        expect(await screen.findByText(/이미 삭제한 독서 기록의 타이머/)).toBeOnTheScreen();
        expect(screen.getByRole('button', { name: '독서 시작' })).toBeOnTheScreen();
    } else {
        expect(await screen.findByRole('header', { name: '저장 완료' })).toBeOnTheScreen();
    }
    expect(readingStorage('reader').load()).toBeNull();
    expect(prepared.repository.sessions.list({ includeDeleted: true })).toHaveLength(1);
    expect(prepared.repository.sessions.get(sessionId, true)?.deleted).toBe(deleted);
});

test.each(['{', '{}', JSON.stringify({ timer: '{}', confirmedChecks: 0 })])('FR-02 S-42 손상된 임시 상태 %s는 한 번 비우고 안내해요', async raw => {
    Storage.setItemSync('reading-timer:reader', raw);
    await open();
    expect(await screen.findByText(/저장된 타이머 상태가 손상되어 초기화/)).toBeOnTheScreen();
    expect(readingStorage('reader').load()).toBeNull();
    expect(screen.getByRole('button', { name: '독서 시작' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '독서 시작' }));
    expect(readingStorage('reader').load()?.timer.bookId).toBe(id);
});

test('NFR-04 S-42 저장소 읽기 오류는 임시 기록을 지우지 않고 재시도해요', async () => {
    readingStorage('reader').save({ timer: startTimer(sessionId, id, 84, t0), confirmedChecks: 0 });
    jest.mocked(Storage.getItemSync).mockImplementationOnce(() => { throw new Error('SQLITE_BUSY'); });
    await open();
    expect(await screen.findByText(/타이머를 불러오지 못했어요/)).toBeOnTheScreen();
    expect(readingStorage('reader').load()?.timer.sessionId).toBe(sessionId);
    await fireEvent.press(screen.getByRole('button', { name: '다시 시도해 주세요' }));
    expect(await screen.findByRole('header', { name: '독서 측정 중' })).toBeOnTheScreen();
});
