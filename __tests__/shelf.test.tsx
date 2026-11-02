import { Alert, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { act } from '@testing-library/react-native';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import ShelfScreen from '../app/(tabs)/shelf';
import BookDetailScreen from '../app/book/[id]/index';
import BookEditScreen from '../app/book/[id]/edit';
import { initializeDatabase, prepareRecordDatabase } from '../src/db/client';
import { createRecordRepository, type RecordRepository, type SaveInput } from '../src/db/repository';
import type { BookRecord } from '../src/db/schema';
import { memorySQLite } from '../src/db/__tests__/sqliteAdapter';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));
jest.mock('../src/db/client', () => ({ ...jest.requireActual('../src/db/client'), initializeDatabase: jest.fn() }));
jest.mock('../src/sync/runtime', () => ({ startRecordSync: jest.fn() }));
jest.mock('expo-font', () => ({ ...jest.requireActual('expo-font'), isLoaded: () => true, loadAsync: jest.fn() }));

const id = '00000000-0000-4000-8000-000000000001';
const sessionId = '00000000-0000-4000-8000-000000000002';
const reviewId = '00000000-0000-4000-8000-000000000003';
const book: SaveInput<BookRecord> = { id, title: '데미안', author: '헤르만 헤세', isbn: null, publisher: null, totalPages: 240, currentPage: 84, genre: '소설', status: 'READING', coverUrl: null, completedCount: 0, completedAt: null };
function ReadingStartTarget() {
    const { bookId } = useLocalSearchParams<{ bookId: string }>();
    return <Text>독서 시작 연결: {bookId}</Text>;
}
const routes = { shelf: ShelfScreen, 'book/[id]/index': BookDetailScreen, 'book/[id]/edit': BookEditScreen, 'reading-start': ReadingStartTarget };
let memory: ReturnType<typeof memorySQLite>;
let repository: RecordRepository;

beforeEach(async () => {
    memory = memorySQLite();
    const { db } = await prepareRecordDatabase(memory.sqlite);
    repository = createRecordRepository(db, () => 100000);
    jest.mocked(initializeDatabase).mockResolvedValue({ db, repository });
});
afterEach(() => { memory.connection.close(); jest.restoreAllMocks(); });

test('FR-04 S-30 빈 책장은 홈 등록 안내를 보여 줘요', async () => {
    await renderRouter(routes, { initialUrl: '/shelf' });
    expect(await screen.findByText('아직 책장에 책이 없어요. 홈에서 읽는 책이나 읽고 싶은 책을 등록해 주세요.')).toBeOnTheScreen();
});

test('FR-04 S-30 장르별 책등에서 상세로 이동하고 쪽수·누적 시간·한줄평을 보여 줘요', async () => {
    repository.books.save(book);
    repository.sessions.save({ id: sessionId, bookId: id, startedAt: 0, endedAt: 61000, activeSeconds: 61, startPage: 0, endPage: 84, source: 'TIMER' });
    repository.reviews.save({ id: reviewId, bookId: id, oneLine: '나를 돌아봤어요.', body: null, visibility: 'PRIVATE', publishedAt: null });
    await renderRouter(routes, { initialUrl: '/shelf' });
    expect(await screen.findByRole('header', { name: '소설 · 1권' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '데미안, 헤르만 헤세, 읽는 중, 책 상세 보기' }));
    expect(await screen.findByRole('progressbar', { name: '독서 진행' })).toHaveAccessibilityValue({ text: '84 / 240쪽' });
    expect(screen.getByText('누적 독서 시간 · 0시간 1분 1초')).toBeOnTheScreen();
    expect(screen.getByText('나를 돌아봤어요.')).toBeOnTheScreen();
});

test.each(['WANT', 'DONE'] as const)('FR-17 S-32 S-33 %s 책을 읽기 시작하면 로컬 상태와 동기화 대기를 저장해요', async status => {
    const first = repository.books.save({ ...book, status, completedCount: 1, completedAt: 100 });
    await renderRouter(routes, { initialUrl: `/book/${id}` });
    await fireEvent.press(await screen.findByRole('button', { name: status === 'WANT' ? '읽기 시작' : '다시 읽기' }));
    await waitFor(() => expect(repository.books.get(id)).toMatchObject({ status: 'READING', currentPage: 84, completedCount: 1, completedAt: null, syncPending: true, localVersion: first.localVersion + 1 }));
    expect(await screen.findByText(`독서 시작 연결: ${id}`)).toBeOnTheScreen();
    expect(screen.queryByText(/회차/)).toBeNull();
});

test('FR-04 S-31 이어서 읽기는 같은 책 ID로 독서 시작에 연결해요', async () => {
    repository.books.save(book);
    await renderRouter(routes, { initialUrl: `/book/${id}` });
    await fireEvent.press(await screen.findByRole('button', { name: '이어서 읽기' }));
    expect(await screen.findByText(`독서 시작 연결: ${id}`)).toBeOnTheScreen();
});

test('FR-04 S-31 완독 표시 후 S-33에서 회차 없이 다시 읽기를 제공해요', async () => {
    repository.books.save(book);
    await renderRouter(routes, { initialUrl: `/book/${id}` });
    await fireEvent.press(await screen.findByRole('button', { name: '완독 표시' }));
    expect(repository.books.get(id)).toMatchObject({ status: 'DONE', currentPage: 240, completedCount: 1, syncPending: true });
    expect(await screen.findByRole('button', { name: '다시 읽기' })).toBeOnTheScreen();
    expect(screen.queryByText(/회차/)).toBeNull();
});

test('FR-01 S-34 편집 검증 오류 후 제목·전체 쪽수·선택 장르를 같은 UUID로 저장해요', async () => {
    repository.books.save(book);
    await renderRouter(routes, { initialUrl: `/book/${id}` });
    await fireEvent.press(await screen.findByRole('button', { name: '정보 편집' }));
    await fireEvent.changeText(screen.getByLabelText('전체 쪽수'), '83');
    await fireEvent.press(screen.getByRole('button', { name: '저장' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/84쪽 이상/);
    expect(repository.books.get(id)?.totalPages).toBe(240);
    await fireEvent.changeText(screen.getByLabelText('전체 쪽수'), '300');
    await fireEvent.changeText(screen.getByLabelText('제목'), '새 제목');
    await fireEvent.press(screen.getByRole('radio', { name: '인문' }));
    expect(screen.getByRole('radio', { name: '인문' })).toBeChecked();
    await fireEvent.press(screen.getByRole('button', { name: '저장' }));
    expect(repository.books.get(id)).toMatchObject({ id, title: '새 제목', totalPages: 300, genre: '인문', currentPage: 84, syncPending: true });
    expect(await screen.findByRole('header', { name: '새 제목' })).toBeOnTheScreen();
});

test('FR-04 D-01 S-30 삭제 취소는 유지하고 확인하면 책장에서 사라져도 tombstone은 남아요', async () => {
    const original = repository.books.save(book);
    repository.sessions.save({ id: sessionId, bookId: id, startedAt: 0, endedAt: 61000, activeSeconds: 61, startPage: 0, endPage: 84, source: 'TIMER' });
    const alert = jest.spyOn(Alert, 'alert');
    await renderRouter(routes, { initialUrl: `/book/${id}` });
    await fireEvent.press(await screen.findByRole('button', { name: '데미안 책 삭제' }));
    expect(alert).toHaveBeenCalledWith('책을 삭제할까요?', expect.stringContaining('데미안'), expect.any(Array));
    expect(repository.books.get(id)).not.toBeNull();
    const actions = alert.mock.calls[0][2]!;
    await act(async () => { actions.find(action => action.text === '삭제')?.onPress?.(); });
    expect(await screen.findByText('아직 책장에 책이 없어요. 홈에서 읽는 책이나 읽고 싶은 책을 등록해 주세요.')).toBeOnTheScreen();
    expect(repository.books.get(id)).toBeNull();
    expect(repository.books.get(id, true)).toMatchObject({ deleted: true, syncPending: true, localVersion: original.localVersion + 1 });
    expect(repository.sessions.get(sessionId, true)).toMatchObject({ deleted: true, syncPending: true });
});

test('FR-04 S-31 삭제된 책의 직접 경로는 빈 상태로 안내해요', async () => {
    repository.books.save(book);
    repository.books.softDelete(id);
    await renderRouter(routes, { initialUrl: `/book/${id}` });
    expect(await screen.findByText('책을 찾을 수 없어요. 삭제된 책인지 확인해 주세요.')).toBeOnTheScreen();
});

test('NFR-04 S-30 저장소 초기화에 실패해도 재시도할 수 있어요', async () => {
    jest.mocked(initializeDatabase).mockRejectedValueOnce(new Error('저장소 오류'));
    await renderRouter(routes, { initialUrl: '/shelf' });
    expect(await screen.findByRole('alert')).toHaveTextContent('책장을 불러오지 못했어요.');
    await fireEvent.press(screen.getByRole('button', { name: '다시 시도해 주세요' }));
    expect(await screen.findByText('아직 책장에 책이 없어요. 홈에서 읽는 책이나 읽고 싶은 책을 등록해 주세요.')).toBeOnTheScreen();
});

test('FR-01 S-34 편집 중 기록이 바뀌면 최신 현재 쪽으로 검증하고 취소는 저장하지 않아요', async () => {
    repository.books.save(book);
    await renderRouter(routes, { initialUrl: `/book/${id}/edit` });
    await fireEvent.changeText(await screen.findByLabelText('전체 쪽수'), '100');
    await act(async () => { repository.books.save({ ...book, currentPage: 120 }); });
    await fireEvent.press(screen.getByRole('button', { name: '저장' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/120쪽 이상/);
    await fireEvent.changeText(screen.getByLabelText('제목'), '취소할 제목');
    await fireEvent.press(screen.getByRole('button', { name: '취소' }));
    expect(await screen.findByRole('header', { name: '데미안' })).toBeOnTheScreen();
    expect(repository.books.get(id)).toMatchObject({ title: '데미안', currentPage: 120, totalPages: 240 });
});

test('NFR-04 S-34 기기 쓰기가 실패하면 입력을 보존해 다시 저장할 수 있어요', async () => {
    repository.books.save(book);
    await renderRouter(routes, { initialUrl: `/book/${id}/edit` });
    await fireEvent.changeText(await screen.findByLabelText('제목'), '바꾼 제목');
    const save = jest.spyOn(repository.books, 'save').mockImplementationOnce(() => { throw new Error('SQLITE_FULL'); });
    await fireEvent.press(screen.getByRole('button', { name: '저장' }));
    expect(screen.getByRole('alert')).toHaveTextContent('저장하지 못했어요. 기기 저장 공간을 확인하고 다시 시도해 주세요.');
    expect(screen.getByLabelText('제목')).toHaveDisplayValue('바꾼 제목');
    expect(repository.books.get(id)?.title).toBe('데미안');
    save.mockRestore();
    await fireEvent.press(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByRole('header', { name: '바꾼 제목' })).toBeOnTheScreen();
});
