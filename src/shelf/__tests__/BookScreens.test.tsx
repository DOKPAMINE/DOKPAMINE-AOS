import { Alert, Text } from 'react-native';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { BookDetailScreen } from '../BookDetailScreen';
import { BookEditScreen } from '../BookEditScreen';
import { initializeDatabase, prepareRecordDatabase } from '../../db/client';
import { createRecordRepository, type RecordRepository } from '../../db/repository';
import { memorySQLite } from '../../db/__tests__/sqliteAdapter';
import Storage from 'expo-sqlite/kv-store';
import { tokenStorage } from '../../api/tokenStorage';
import { bookVisibilityPreferences, reviewPreferences } from '../../my/preferences';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));
jest.mock('../../db/client', () => ({ ...jest.requireActual('../../db/client'), initializeDatabase: jest.fn() }));
jest.mock('../../sync/runtime', () => ({ startRecordSync: jest.fn() }));
jest.mock('expo-sqlite/kv-store', () => {
    const store = new Map<string, string>();
    return { __esModule: true, default: { store,
        getItemSync: jest.fn((key: string) => store.get(key) ?? null), setItemSync: jest.fn((key: string, value: string) => { store.set(key, value); }) } };
});
jest.mock('../../api/tokenStorage', () => ({ tokenStorage: { getSession: jest.fn() } }));
jest.mock('expo-font', () => ({ ...jest.requireActual('expo-font'), isLoaded: () => true, loadAsync: jest.fn() }));

const id = '00000000-0000-4000-8000-000000000001';
const routes = { 'book/[id]/index': BookDetailScreen, 'book/[id]/edit': BookEditScreen,
    'book/[id]/records/index': () => <Text>기록 목록 연결</Text>, 'book/[id]/review': () => <Text>감상과 문장 연결</Text> };
let memory: ReturnType<typeof memorySQLite>;
let repository: RecordRepository;
beforeEach(async () => {
    memory = memorySQLite();
    const prepared = await prepareRecordDatabase(memory.sqlite);
    repository = prepared.repository;
    jest.mocked(initializeDatabase).mockResolvedValue(prepared);
    (Storage as unknown as { store: Map<string, string> }).store.clear();
    jest.mocked(tokenStorage.getSession).mockResolvedValue({ accessToken: 'token', expiresAt: '2099-01-01T00:00:00Z', userId: 'reader' });
    repository.books.save({ id, title: '데미안', author: '헤세', isbn: null, publisher: null, coverUrl: null, sideCoverUrl: null, yes24ProductUrl: null,
        genre: '소설/시', status: 'READING', totalPages: 240, currentPage: 84, completedCount: 0, completedAt: null });
});
afterEach(() => { memory.connection.close(); jest.restoreAllMocks(); });

test('NFR-04 S-34 과거 세션보다 작은 전체 쪽수는 입력을 보존하고 수정 안내를 보여요', async () => {
    repository.sessions.save({ id: '00000000-0000-4000-8000-000000000002', bookId: id,
        startedAt: 0, endedAt: 1000, activeSeconds: 1, source: 'TIMER', startPage: 200, endPage: null });
    await renderRouter(routes, { initialUrl: `/book/${id}/edit` });
    await fireEvent.changeText(await screen.findByLabelText('전체 쪽수'), '100');
    await fireEvent.press(screen.getByRole('button', { name: '저장' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/시작·종료 쪽/);
    expect(screen.getByLabelText('전체 쪽수').props.value).toBe('100');
    expect(repository.books.get(id)?.totalPages).toBe(240);
    expect(screen).toHavePathname(`/book/${id}/edit`);
});

test.each([['기록 보기', 'records', '기록 목록 연결'], ['감상과 문장', 'review', '감상과 문장 연결']])(
    'FR-04 S-31 책 상세의 %s는 책 ID를 유지한 %s 경로로 이동해요', async (label, suffix, target) => {
        await renderRouter(routes, { initialUrl: `/book/${id}` });
        await fireEvent.press(await screen.findByRole('button', { name: label }));
        expect(await screen.findByText(target)).toBeOnTheScreen();
        expect(screen).toHavePathname(`/book/${id}/${suffix}`);
    });

test('FR-01 S-34 오류 힌트는 해당 입력란에만 붙고 변경하면 해제돼요', async () => {
    await renderRouter(routes, { initialUrl: `/book/${id}/edit` });
    await fireEvent.changeText(await screen.findByLabelText('전체 쪽수'), '10');
    await fireEvent.press(screen.getByRole('button', { name: '저장' }));
    expect(screen.getByLabelText('전체 쪽수').props.accessibilityHint).toBe('전체 쪽수는 현재 읽은 84쪽 이상으로 입력해 주세요.');
    for (const name of ['제목', '저자', '출판사 (선택)']) expect(screen.getByLabelText(name).props.accessibilityHint).toBeUndefined();
    await fireEvent.changeText(screen.getByLabelText('전체 쪽수'), '240');
    expect(screen.getByLabelText('전체 쪽수').props.accessibilityHint).toBeUndefined();
    expect(screen.queryByRole('alert')).toBeNull();
});

test('FR-01 S-34 출판사 입력은 서버의 100자 제한을 제공하고 수정 내용을 저장해요', async () => {
    await renderRouter(routes, { initialUrl: `/book/${id}/edit` });
    const publisher = await screen.findByLabelText('출판사 (선택)');
    expect(publisher.props.maxLength).toBe(100);
    await fireEvent.changeText(publisher, '문학 출판사');
    await fireEvent.press(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByRole('header', { name: '데미안' })).toBeOnTheScreen();
    expect(repository.books.get(id)?.publisher).toBe('문학 출판사');
});

const oneLineId = '00000000-0000-4000-8000-000000000011';
const reportId = '00000000-0000-4000-8000-000000000012';
const saveReviews = (oneLine: 'PRIVATE' | 'PUBLIC', report: 'PRIVATE' | 'PUBLIC') => {
    repository.reviews.save({ id: oneLineId, bookId: id, oneLine: '한줄평', body: null, visibility: oneLine, publishedAt: null });
    repository.reviews.save({ id: reportId, bookId: id, oneLine: null, body: '독후감', visibility: report, publishedAt: null });
    for (const row of repository.reviews.list()) repository.reviews.markSynced(row.id, row.localVersion);
};
const visibilitySwitch = () => screen.getByRole('switch', { name: '감상 공개' });
const alertButton = (alert: jest.SpyInstance, text: string) => alert.mock.calls.at(-1)?.[2]?.find((item: { text: string }) => item.text === text);

test.each([['PRIVATE', '비공개'], ['PUBLIC', '공개']] as const)('#89 FR-08 S-31 S-81 감상이 없고 저장값도 없는 책은 기본 공개 범위 %s로 시작해요', async (fallback, label) => {
    reviewPreferences.save('reader', fallback);
    await renderRouter(routes, { initialUrl: `/book/${id}` });
    expect(await screen.findByText(`첫 감상은 ${label}로 저장돼요`)).toBeOnTheScreen();
    expect(visibilitySwitch().props.accessibilityState).toEqual({ checked: fallback === 'PUBLIC' });
});

test('#89 FR-08 S-31 감상이 없는 책은 확인 없이 스위치를 바꾸고 계정별 책 저장값으로 기기에 남겨요', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    const first = await renderRouter(routes, { initialUrl: `/book/${id}` });
    expect(await screen.findByText('첫 감상은 비공개로 저장돼요')).toBeOnTheScreen();
    await fireEvent(visibilitySwitch(), 'valueChange', true);
    expect(alert).not.toHaveBeenCalled();
    expect(screen.getByText('첫 감상은 공개로 저장돼요')).toBeOnTheScreen();
    expect(bookVisibilityPreferences.load('reader', id)).toBe('PUBLIC');
    expect(bookVisibilityPreferences.load('other-reader', id)).toBeNull();
    expect(reviewPreferences.load('reader')).toBe('PRIVATE');
    expect(repository.reviews.list()).toEqual([]);
    await first.unmount();
    await renderRouter(routes, { initialUrl: `/book/${id}` });
    expect(await screen.findByText('첫 감상은 공개로 저장돼요')).toBeOnTheScreen();
    expect(visibilitySwitch().props.accessibilityState.checked).toBe(true);
});

test('#89 FR-08 S-31 감상이 없는 책의 저장값이 기본 공개 범위보다 우선해요', async () => {
    reviewPreferences.save('reader', 'PUBLIC');
    bookVisibilityPreferences.save('reader', id, 'PRIVATE');
    await renderRouter(routes, { initialUrl: `/book/${id}` });
    expect(await screen.findByText('첫 감상은 비공개로 저장돼요')).toBeOnTheScreen();
});

test('#89 FR-08 S-31 감상이 생기면 책 저장값 대신 감상들의 공개 범위로 판단해요', async () => {
    bookVisibilityPreferences.save('reader', id, 'PUBLIC');
    saveReviews('PRIVATE', 'PRIVATE');
    await renderRouter(routes, { initialUrl: `/book/${id}` });
    expect(await screen.findByText('나만 보고 있어요')).toBeOnTheScreen();
    expect(visibilitySwitch().props.accessibilityState.checked).toBe(false);
});

test('#89 FR-08 S-31 비공개 책을 공개로 바꾸고 확인하면 한줄평과 독후감 전체가 공개·동기화 대기가 돼요', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    saveReviews('PRIVATE', 'PRIVATE');
    await renderRouter(routes, { initialUrl: `/book/${id}` });
    expect(await screen.findByText('나만 보고 있어요')).toBeOnTheScreen();
    await fireEvent(visibilitySwitch(), 'valueChange', true);
    expect(alert).toHaveBeenCalledWith('감상을 공개할까요?', expect.stringContaining('「데미안」의 한줄평과 독후감이 모두 공개돼요.'), expect.any(Array));
    expect(repository.reviews.list().every(row => row.visibility === 'PRIVATE')).toBe(true);
    await act(async () => alertButton(alert, '공개')?.onPress?.());
    expect(repository.reviews.list()).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: oneLineId, visibility: 'PUBLIC', syncPending: true }),
        expect.objectContaining({ id: reportId, visibility: 'PUBLIC', syncPending: true })]));
    expect(screen.getByText('감상 2개를 공개로 바꿨어요 · 동기화 대기')).toBeOnTheScreen();
    expect(screen.getByText('공개 중이에요')).toBeOnTheScreen();
    expect(visibilitySwitch().props.accessibilityState.checked).toBe(true);
});

test('#89 FR-08 S-31 공개 확인에서 취소하면 아무것도 바뀌지 않아요', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    saveReviews('PRIVATE', 'PRIVATE');
    const before = repository.reviews.list();
    await renderRouter(routes, { initialUrl: `/book/${id}` });
    await fireEvent(await screen.findByRole('switch', { name: '감상 공개' }), 'valueChange', true);
    await act(async () => alertButton(alert, '취소')?.onPress?.());
    expect(repository.reviews.list()).toEqual(before);
    expect(visibilitySwitch().props.accessibilityState.checked).toBe(false);
    expect(screen.getByText('나만 보고 있어요')).toBeOnTheScreen();
});

test('#89 FR-08 S-31 공개 책을 비공개로 바꾸면 확인 없이 전체가 비공개·동기화 대기가 돼요', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    saveReviews('PUBLIC', 'PUBLIC');
    await renderRouter(routes, { initialUrl: `/book/${id}` });
    expect(await screen.findByText('공개 중이에요')).toBeOnTheScreen();
    await fireEvent(visibilitySwitch(), 'valueChange', false);
    expect(alert).not.toHaveBeenCalled();
    expect(repository.reviews.list().map(row => [row.visibility, row.syncPending])).toEqual([['PRIVATE', true], ['PRIVATE', true]]);
    expect(screen.getByText('감상 2개를 비공개로 바꿨어요 · 동기화 대기')).toBeOnTheScreen();
});

test('#89 FR-08 S-31 공개 범위를 바꿔도 책 상세의 대표 한줄평이 바뀌지 않아요', async () => {
    let clock = 100000;
    const prepared = await prepareRecordDatabase(memory.sqlite);
    const timed = createRecordRepository(prepared.db, () => clock);
    jest.mocked(initializeDatabase).mockResolvedValue({ db: prepared.db, repository: timed });
    timed.reviews.save({ id: oneLineId, bookId: id, oneLine: '예전 한줄평', body: null, visibility: 'PRIVATE', publishedAt: null });
    clock += 1000;
    timed.reviews.save({ id: reportId, bookId: id, oneLine: '최근 한줄평', body: null, visibility: 'PRIVATE', publishedAt: null });
    clock += 1000;
    const alert = jest.spyOn(Alert, 'alert');
    await renderRouter(routes, { initialUrl: `/book/${id}` });
    expect(await screen.findByText('최근 한줄평')).toBeOnTheScreen();

    await fireEvent(visibilitySwitch(), 'valueChange', true);
    await act(async () => alertButton(alert, '공개')?.onPress?.());
    expect(timed.reviews.list({ bookId: id }).every(row => row.visibility === 'PUBLIC' && row.syncPending)).toBe(true);
    expect(screen.getByText('최근 한줄평')).toBeOnTheScreen();
    expect(screen.queryByText('예전 한줄평')).toBeNull();
});
