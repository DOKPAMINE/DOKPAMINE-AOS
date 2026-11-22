import { Alert, Text } from 'react-native';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { BookDetailScreen } from '../BookDetailScreen';
import { BookEditScreen } from '../BookEditScreen';
import { initializeDatabase, prepareRecordDatabase } from '../../db/client';
import type { RecordRepository } from '../../db/repository';
import { memorySQLite } from '../../db/__tests__/sqliteAdapter';
import { useReviewVisibility } from '../../my/preferences';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));
jest.mock('../../db/client', () => ({ ...jest.requireActual('../../db/client'), initializeDatabase: jest.fn() }));
jest.mock('../../sync/runtime', () => ({ startRecordSync: jest.fn() }));
jest.mock('../../my/preferences', () => ({ useReviewVisibility: jest.fn() }));
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
    jest.mocked(useReviewVisibility).mockReturnValue('PRIVATE');
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

test.each([['PRIVATE', '비공개'], ['PUBLIC', '공개']] as const)('#89 FR-08 S-31 S-81 감상이 없는 책은 기본 공개 범위 %s를 보여 주고 스위치를 잠가요', async (fallback, label) => {
    jest.mocked(useReviewVisibility).mockReturnValue(fallback);
    await renderRouter(routes, { initialUrl: `/book/${id}` });
    expect(await screen.findByText(`기본 공개 범위 · ${label}`)).toBeOnTheScreen();
    expect(visibilitySwitch().props.accessibilityState).toEqual({ checked: fallback === 'PUBLIC', disabled: true });
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

test('#89 FR-08 S-31 공개 범위가 섞인 책은 스위치를 누르면 하나로 맞출 값을 물어봐요', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    saveReviews('PUBLIC', 'PRIVATE');
    await renderRouter(routes, { initialUrl: `/book/${id}` });
    expect(await screen.findByText('일부 감상만 공개돼 있어요')).toBeOnTheScreen();
    expect(visibilitySwitch().props.accessibilityState.checked).toBe(false);
    await fireEvent(visibilitySwitch(), 'valueChange', true);
    expect(alert.mock.calls[0][2]?.map(item => item.text)).toEqual(['취소', '모두 비공개', '모두 공개']);
    await act(async () => alertButton(alert, '모두 비공개')?.onPress?.());
    expect(repository.reviews.get(oneLineId)).toMatchObject({ visibility: 'PRIVATE', syncPending: true });
    expect(repository.reviews.get(reportId)).toMatchObject({ visibility: 'PRIVATE', syncPending: false });
    expect(screen.getByText('감상 1개를 비공개로 바꿨어요 · 동기화 대기')).toBeOnTheScreen();
});
