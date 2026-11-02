import { Alert, Text } from 'react-native';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { initializeDatabase, prepareRecordDatabase } from '../../db/client';
import type { RecordRepository } from '../../db/repository';
import { memorySQLite } from '../../db/__tests__/sqliteAdapter';
import RecordList from '../../../app/book/[id]/records';
import RecordNew from '../../../app/book/[id]/records/new';
import RecordEdit from '../../../app/book/[id]/records/[recordId]';

jest.mock('expo', () => ({ ...jest.requireActual('expo'), uuid: { v4: () => '00000000-0000-4000-8000-000000000009' } }));
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));
jest.mock('../../db/client', () => ({ ...jest.requireActual('../../db/client'), initializeDatabase: jest.fn() }));
jest.mock('../../sync/runtime', () => ({ startRecordSync: jest.fn() }));
jest.mock('expo-font', () => ({ ...jest.requireActual('expo-font'), isLoaded: () => true, loadAsync: jest.fn() }));

const bookId = '00000000-0000-4000-8000-000000000001';
const recordId = '00000000-0000-4000-8000-000000000002';
const newId = '00000000-0000-4000-8000-000000000009';
const routes = { 'book/[id]/records/index': RecordList, 'book/[id]/records/new': RecordNew,
    'book/[id]/records/[recordId]': RecordEdit, 'book/[id]/index': () => <Text>책 상세 연결</Text>, shelf: () => <Text>책장 연결</Text> };
let memory: ReturnType<typeof memorySQLite>;
let repository: RecordRepository;

beforeEach(async () => {
    memory = memorySQLite();
    const prepared = await prepareRecordDatabase(memory.sqlite);
    repository = prepared.repository;
    jest.mocked(initializeDatabase).mockResolvedValue(prepared);
    repository.books.save({ id: bookId, title: '데미안', author: '헤세', isbn: null, publisher: null, coverUrl: null,
        genre: '소설', status: 'READING', totalPages: 240, currentPage: 0, completedCount: 0, completedAt: null });
});
afterEach(() => { memory.connection.close(); jest.restoreAllMocks(); });

function seed(id = recordId, startedAt = Date.parse('2026-10-01T01:00:00Z'), endPage: number | null = 84) {
    return repository.sessions.save({ id, bookId, startedAt, endedAt: startedAt + 1200000,
        activeSeconds: 1200, startPage: 0, endPage, source: 'TIMER' });
}
async function open(suffix = '') { await renderRouter(routes, { initialUrl: `/book/${bookId}/records${suffix}` }); }
async function fill(minutes = '20', end = '84') {
    await fireEvent.changeText(await screen.findByLabelText('독서 날짜 (YYYY-MM-DD)'), '2026-10-01');
    await fireEvent.changeText(screen.getByLabelText('시작 시각 (HH:mm)'), '10:00');
    await fireEvent.changeText(screen.getByLabelText('독서 시간 (분)'), minutes);
    await fireEvent.changeText(screen.getByLabelText('시작 쪽'), '0');
    await fireEvent.changeText(screen.getByLabelText('종료 쪽 (선택)'), end);
}
function deleteAction() {
    const call = jest.mocked(Alert.alert).mock.calls.at(-1);
    expect(call?.[0]).toBe('독서 기록을 삭제할까요?');
    return call?.[2]?.find(button => button.text === '삭제')?.onPress;
}

test('FR-04 S-35 빈 목록에서 직접 추가 화면으로 이동해요', async () => {
    await open();
    expect(await screen.findByText('아직 독서 기록이 없어요. 읽은 시간을 직접 남겨 보세요.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '기록 직접 추가' }));
    expect(await screen.findByRole('header', { name: '기록 직접 추가' })).toBeOnTheScreen();
    expect(screen).toHavePathname(`/book/${bookId}/records/new`);
});

test('FR-04 S-35 최신순 목록은 시간만 기록과 전송 대기를 구분하고 삭제 기록은 숨겨요', async () => {
    seed();
    seed('00000000-0000-4000-8000-000000000003', Date.parse('2026-10-02T01:00:00Z'), null);
    const deleted = seed('00000000-0000-4000-8000-000000000004');
    repository.sessions.softDelete(deleted.id);
    await open();
    await screen.findByText('최신순 · 2건 · 0시간 40분 0초');
    expect(screen.getAllByRole('header').map(header => header.props.children)).toEqual(['독서 기록', '2026-10-02 10:00', '2026-10-01 10:00']);
    expect(screen.getByText('0쪽 시작 · 시간만 기록')).toBeOnTheScreen();
    expect(screen.getAllByText('타이머 기록 · 전송 대기')).toHaveLength(2);
});

test('FR-02 S-36 직접 추가는 실제 저장소에 MANUAL과 동기화 대기로 저장하고 진행 쪽을 갱신해요', async () => {
    await open('/new'); await fill();
    expect(screen.getByText('직접 추가하거나 수정한 기록은 랭킹에서 제외됩니다.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '저장' }));
    await screen.findByRole('header', { name: '독서 기록' });
    expect(repository.sessions.get(newId)).toMatchObject({ id: newId, bookId, source: 'MANUAL', activeSeconds: 1200,
        startPage: 0, endPage: 84, startedAt: Date.parse('2026-10-01T01:00:00Z'), syncPending: true, deleted: false });
    expect(repository.books.get(bookId)?.currentPage).toBe(84);
    expect(repository.sessions.list()).toHaveLength(1);
});

test('FR-02 S-36 타이머 기록 수정은 ID와 생성 시각을 유지하고 MANUAL로 바꿔요', async () => {
    const original = seed();
    await open(`/${recordId}`); await fill('30', '120');
    await fireEvent.press(screen.getByRole('button', { name: '저장' }));
    await screen.findByRole('header', { name: '독서 기록' });
    expect(repository.sessions.list()).toHaveLength(1);
    expect(repository.sessions.get(recordId)).toMatchObject({ id: recordId, createdAt: original.createdAt, source: 'MANUAL', activeSeconds: 1800, endPage: 120 });
    expect(repository.books.get(bookId)?.currentPage).toBe(120);
});

test('FR-02 S-36 종료 쪽을 비워 시간만 저장해도 기존 진행 쪽은 유지해요', async () => {
    repository.books.save({ ...repository.books.get(bookId)!, currentPage: 60 });
    await open('/new'); await fill('20', '');
    await fireEvent.press(screen.getByRole('button', { name: '저장' }));
    await screen.findByRole('header', { name: '독서 기록' });
    expect(repository.sessions.get(newId)?.endPage).toBeNull();
    expect(repository.books.get(bookId)?.currentPage).toBe(60);
});

test.each([['0', '84', '독서 시간은 1분 이상의 정수로 입력해 주세요.'], ['20', '241', '전체 쪽수(240쪽)보다 클 수 없어요.'], ['20', '-1', '0 이상의 정수로 입력해 주세요.']])(
    'FR-02 S-36 잘못된 시간 %s 또는 종료 쪽 %s은 오류를 표시하고 저장하지 않아요', async (minutes, end, message) => {
        await open('/new'); await fill(minutes, end);
        await fireEvent.press(screen.getByRole('button', { name: '저장' }));
        expect(screen.getByRole('alert')).toHaveTextContent(message);
        expect(repository.sessions.list()).toHaveLength(0);
    });

test('FR-02 S-36 잘못된 날짜와 미래 종료를 차단해요', async () => {
    await open('/new'); await fill();
    await fireEvent.changeText(screen.getByLabelText('독서 날짜 (YYYY-MM-DD)'), '2026-02-30');
    await fireEvent.press(screen.getByRole('button', { name: '저장' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/날짜는 1900년 이후/);
    await fireEvent.changeText(screen.getByLabelText('독서 날짜 (YYYY-MM-DD)'), '2099-01-01');
    await fireEvent.press(screen.getByRole('button', { name: '저장' }));
    expect(screen.getByRole('alert')).toHaveTextContent('독서 종료 시각은 현재 시각을 넘을 수 없어요.');
    expect(repository.sessions.list()).toHaveLength(0);
});

test('FR-04 D-02 삭제 취소는 보존하고 확인은 tombstone과 진행 쪽을 반영해요', async () => {
    seed();
    repository.books.save({ ...repository.books.get(bookId)!, currentPage: 84 });
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await open();
    await fireEvent.press(await screen.findByRole('button', { name: '2026-10-01 10:00 기록 삭제' }));
    expect(repository.sessions.get(recordId)).not.toBeNull();
    const cancel = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2]?.find(button => button.text === '취소');
    expect(cancel?.style).toBe('cancel');
    await act(() => deleteAction()?.());
    expect(repository.sessions.get(recordId)).toBeNull();
    expect(repository.sessions.get(recordId, true)).toMatchObject({ deleted: true, syncPending: true });
    expect(repository.books.get(bookId)?.currentPage).toBe(0);
    expect(screen.getByText('최신순 · 0건 · 0시간 0분 0초')).toBeOnTheScreen();
});

test('NFR-04 S-36 기기 저장 실패 뒤 같은 ID로 재시도하고 입력을 유지해요', async () => {
    await open('/new'); await fill();
    jest.spyOn(repository.sessions, 'save').mockImplementationOnce(() => { throw new Error('SQLITE_FULL'); });
    await fireEvent.press(screen.getByRole('button', { name: '저장' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/저장을 마무리하지 못했어요/);
    expect(screen.getByLabelText('종료 쪽 (선택)')).toHaveDisplayValue('84');
    await fireEvent.press(screen.getByRole('button', { name: '저장' }));
    await screen.findByRole('header', { name: '독서 기록' });
    expect(repository.sessions.list()).toHaveLength(1);
    expect(repository.sessions.get(newId)?.syncPending).toBe(true);
});

test('NFR-04 S-36 진행 쪽 저장 실패도 같은 작업으로 재시도해 복구해요', async () => {
    await open('/new'); await fill();
    jest.spyOn(repository.books, 'save').mockImplementationOnce(() => { throw new Error('SQLITE_FULL'); });
    await fireEvent.press(screen.getByRole('button', { name: '저장' }));
    expect(repository.sessions.get(newId)?.endPage).toBe(84);
    expect(repository.books.get(bookId)?.currentPage).toBe(0);
    await fireEvent.press(screen.getByRole('button', { name: '저장' }));
    await screen.findByRole('header', { name: '독서 기록' });
    expect(repository.books.get(bookId)?.currentPage).toBe(84);
    expect(repository.sessions.list()).toHaveLength(1);
});

test('NFR-04 D-02 삭제 저장 실패는 재시도할 수 있어요', async () => {
    seed(); jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.spyOn(repository.sessions, 'softDelete').mockImplementationOnce(() => { throw new Error('SQLITE_FULL'); });
    await open();
    await fireEvent.press(await screen.findByRole('button', { name: '2026-10-01 10:00 기록 삭제' }));
    await act(() => deleteAction()?.());
    expect(screen.getByRole('alert')).toHaveTextContent(/삭제를 마무리하지 못했어요/);
    expect(repository.sessions.get(recordId)).not.toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: '삭제 다시 시도' }));
    expect(repository.sessions.get(recordId, true)?.deleted).toBe(true);
});

test('FR-04 S-36 다른 책 기록의 직접 경로는 편집하지 못해요', async () => {
    const other = '00000000-0000-4000-8000-000000000003';
    repository.books.save({ ...repository.books.get(bookId)!, id: other });
    repository.sessions.save({ ...seed(), bookId: other, id: newId });
    await open(`/${newId}`);
    expect(await screen.findByText('책이나 독서 기록을 찾을 수 없어요.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '저장' })).toBeNull();
});

test('FR-02 S-36 취소하면 기록을 저장하지 않고 목록으로 돌아가요', async () => {
    await open('/new'); await fill();
    await fireEvent.press(screen.getByRole('button', { name: '취소' }));
    await screen.findByRole('header', { name: '독서 기록' });
    expect(repository.sessions.list()).toHaveLength(0);
});
