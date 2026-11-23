import { Alert } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { initializeDatabase, prepareRecordDatabase } from '../../db/client';
import { createRecordRepository, type RecordRepository, type SaveInput } from '../../db/repository';
import type { BookRecord } from '../../db/schema';
import { memorySQLite } from '../../db/__tests__/sqliteAdapter';
import { getSyncState, subscribeSyncState } from '../../sync';
import { MixedVisibilityPrompt } from '../MixedVisibilityPrompt';
import { requestMixedVisibilityCheck } from '../mixedVisibilityCheck';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));
jest.mock('../../db/client', () => ({ ...jest.requireActual('../../db/client'), initializeDatabase: jest.fn() }));
jest.mock('../../sync', () => ({ getSyncState: jest.fn(), subscribeSyncState: jest.fn() }));

const uuid = (last: number) => `00000000-0000-4000-8000-${String(last).padStart(12, '0')}`;
const book = (id: string, title: string): SaveInput<BookRecord> => ({ id, title, author: '지은이', isbn: null, publisher: null, totalPages: 200, currentPage: 0,
    genre: '소설/시', status: 'READING', coverUrl: null, sideCoverUrl: null, yes24ProductUrl: null, catalogPending: false, completedCount: 0, completedAt: null });
const message = (title: string) => `『${title}』의 감상 중 일부만 공개돼 있어요. 이 책의 감상을 어떻게 할까요?`;
let memory: ReturnType<typeof memorySQLite>;
let repository: RecordRepository;
let syncStatus: 'idle' | 'syncing';
let syncListener: (() => void) | undefined;

const saveReview = (id: number, bookId: string, visibility: 'PRIVATE' | 'PUBLIC') =>
    repository.reviews.save({ id: uuid(id), bookId, oneLine: `감상 ${id}`, body: null, visibility, publishedAt: null });
const markAllSynced = () => { for (const row of repository.reviews.list()) repository.reviews.markSynced(row.id, row.localVersion); };
const renderPrompt = async (paused = false) => {
    const view = await render(<MixedVisibilityPrompt paused={paused} />);
    await act(async () => { await Promise.resolve(); });
    return view;
};

beforeEach(async () => {
    memory = memorySQLite();
    const { db } = await prepareRecordDatabase(memory.sqlite);
    repository = createRecordRepository(db, () => 100000);
    jest.mocked(initializeDatabase).mockResolvedValue({ db, repository });
    syncStatus = 'idle';
    jest.mocked(getSyncState).mockImplementation(() => ({ status: syncStatus, failedCount: 0 }));
    jest.mocked(subscribeSyncState).mockImplementation(listener => { syncListener = listener; return () => { syncListener = undefined; }; });
    repository.books.save(book(uuid(1), '하얀 책'));
    repository.books.save(book(uuid(2), '데미안'));
    repository.books.save(book(uuid(3), '모두 공개한 책'));
});
afterEach(() => { memory.connection.close(); jest.restoreAllMocks(); });

test('#89 FR-08 S-31 앱 시작 시 섞인 책을 제목 순으로 한 권씩 묻고 고른 값으로 바뀐 감상만 동기화 대기로 해요', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    saveReview(11, uuid(1), 'PUBLIC'); saveReview(12, uuid(1), 'PRIVATE');
    saveReview(21, uuid(2), 'PRIVATE'); saveReview(22, uuid(2), 'PUBLIC'); saveReview(23, uuid(2), 'PUBLIC');
    saveReview(31, uuid(3), 'PUBLIC'); saveReview(32, uuid(3), 'PUBLIC');
    markAllSynced();
    await renderPrompt();

    expect(screen.getByText(message('데미안'))).toBeOnTheScreen();
    expect(screen.queryByText(message('하얀 책'))).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: '모두 공개' }));
    expect(alert).not.toHaveBeenCalled();
    expect(repository.reviews.list({ bookId: uuid(2) }).map(row => [row.visibility, row.syncPending]).sort())
        .toEqual([['PUBLIC', false], ['PUBLIC', false], ['PUBLIC', true]]);

    expect(screen.getByText(message('하얀 책'))).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '모두 비공개' }));
    expect(repository.reviews.get(uuid(11))).toMatchObject({ visibility: 'PRIVATE', syncPending: true });
    expect(repository.reviews.get(uuid(12))).toMatchObject({ visibility: 'PRIVATE', syncPending: false });
    expect(repository.reviews.list({ bookId: uuid(3), syncPending: true })).toEqual([]);
    expect(screen.queryByText(/일부만 공개돼 있어요/)).toBeNull();
});

test('#89 FR-08 S-31 섞인 책 알림은 뒤로 가기로 닫히지 않고 바깥을 누를 곳 없이 두 버튼만 있어요', async () => {
    saveReview(11, uuid(1), 'PUBLIC'); saveReview(12, uuid(1), 'PRIVATE');
    await renderPrompt();
    await act(async () => screen.getByTestId('mixed-visibility-prompt').props.onRequestClose());
    expect(screen.getByText(message('하얀 책'))).toBeOnTheScreen();
    expect(screen.getAllByRole('button').map(button => button.props.accessibilityLabel)).toEqual(['모두 비공개', '모두 공개']);
});

test('#89 FR-08 S-31 충돌·삭제한 감상은 섞인 것으로 보지 않아요', async () => {
    saveReview(11, uuid(1), 'PUBLIC'); saveReview(12, uuid(1), 'PRIVATE'); saveReview(13, uuid(1), 'PUBLIC');
    repository.reviews.markConflict(uuid(12));
    saveReview(21, uuid(2), 'PRIVATE'); saveReview(22, uuid(2), 'PUBLIC');
    repository.reviews.softDelete(uuid(22));
    await renderPrompt();
    expect(screen.queryByText(/일부만 공개돼 있어요/)).toBeNull();
});

test('#89 FR-08 NFR-05 S-31 동기화가 끝나면 다시 확인하고 동기화 중에는 묻지 않아요', async () => {
    await renderPrompt();
    expect(screen.queryByText(/일부만 공개돼 있어요/)).toBeNull();
    await act(async () => { syncStatus = 'syncing'; syncListener?.(); });
    // snapshot 복원으로 섞인 상태가 들어와도 동기화가 끝날 때까지 기다린다.
    await act(async () => { saveReview(11, uuid(1), 'PUBLIC'); saveReview(12, uuid(1), 'PRIVATE'); syncListener?.(); });
    expect(screen.queryByText(message('하얀 책'))).toBeNull();
    await act(async () => { syncStatus = 'idle'; syncListener?.(); });
    expect(screen.getByText(message('하얀 책'))).toBeOnTheScreen();
});

test('#89 FR-08 S-50 충돌을 해결하면 다시 확인해 다시 섞인 책도 같은 알림으로 물어요', async () => {
    await renderPrompt();
    await act(async () => { saveReview(21, uuid(2), 'PUBLIC'); saveReview(22, uuid(2), 'PRIVATE'); });
    expect(screen.queryByText(message('데미안'))).toBeNull();
    await act(async () => requestMixedVisibilityCheck());
    expect(screen.getByText(message('데미안'))).toBeOnTheScreen();
});

test('#89 FR-08 S-46 멈춘 동안(독서 타이머 화면)에는 띄우지 않고 풀리면 보여 줘요', async () => {
    saveReview(11, uuid(1), 'PUBLIC'); saveReview(12, uuid(1), 'PRIVATE');
    const view = await renderPrompt(true);
    expect(screen.queryByText(message('하얀 책'))).toBeNull();
    await view.rerender(<MixedVisibilityPrompt paused={false} />);
    expect(screen.getByText(message('하얀 책'))).toBeOnTheScreen();
});

test('#89 FR-08 S-31 저장에 실패하면 알림을 유지하고 다시 고를 수 있어요', async () => {
    saveReview(11, uuid(1), 'PUBLIC'); saveReview(12, uuid(1), 'PRIVATE');
    await renderPrompt();
    jest.spyOn(repository.reviews, 'setBookVisibility').mockImplementationOnce(() => { throw new Error('SQLITE_FULL'); });
    await fireEvent.press(screen.getByRole('button', { name: '모두 공개' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/바꾸지 못했어요\./);
    expect(screen.getByText(message('하얀 책'))).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '모두 공개' }));
    expect(screen.queryByText(message('하얀 책'))).toBeNull();
});
