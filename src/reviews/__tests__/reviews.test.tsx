import { Alert, Text } from 'react-native';
import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import ReviewList from '../../../app/book/[id]/review';
import ReviewWrite from '../../../app/book/[id]/review/write';
import QuoteWrite from '../../../app/book/[id]/review/quote';
import { initializeDatabase, prepareRecordDatabase } from '../../db/client';
import { createRecordRepository, type RecordRepository } from '../../db/repository';
import { memorySQLite } from '../../db/__tests__/sqliteAdapter';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));
jest.mock('../../db/client', () => ({ ...jest.requireActual('../../db/client'), initializeDatabase: jest.fn() }));
const bookId = '00000000-0000-4000-8000-000000000001';
const base = `/book/${bookId}/review`;
const routes = {
    'book/[id]/index': () => <Text>책 상세</Text>,
    'book/[id]/review/index': ReviewList,
    'book/[id]/review/write': ReviewWrite,
    'book/[id]/review/quote': QuoteWrite,
};
let memory: ReturnType<typeof memorySQLite>;
let repository: RecordRepository;
beforeEach(async () => {
    memory = memorySQLite();
    const { db } = await prepareRecordDatabase(memory.sqlite);
    repository = createRecordRepository(db, () => 100000);
    repository.books.save({ id: bookId, title: '데미안', author: '헤르만 헤세', isbn: null, publisher: null,
        totalPages: 240, currentPage: 84, genre: '소설', status: 'READING', coverUrl: null, completedCount: 0, completedAt: null });
    jest.mocked(initializeDatabase).mockResolvedValue({ db, repository });
});
afterEach(() => { memory.connection.close(); jest.restoreAllMocks(); });

test('FR-07 S-50 빈 감상과 문장 목록에서 각각 작성으로 진입할 수 있어요', async () => {
    await renderRouter(routes, { initialUrl: base });
    expect(await screen.findByText('아직 감상이 없어요. 책을 읽고 느낀 점을 남겨 주세요.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '문장 추가' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '감상 쓰기' }));
    expect(await screen.findByRole('radio', { name: '비공개 · 나만 보기' })).toBeChecked();
});

test.each(['PRIVATE', 'PUBLIC'])('FR-07 FR-08 NFR-04 S-51 %s 감상은 같은 책에 로컬 저장하고 목록에 반영돼요', async visibility => {
    await renderRouter(routes, { initialUrl: base });
    await fireEvent.press(await screen.findByRole('button', { name: '감상 쓰기' }));
    await fireEvent.changeText(await screen.findByLabelText('한줄평'), '내 안의 세계를 돌아봤어요.');
    await fireEvent.changeText(screen.getByLabelText('독후감'), '나의 길을 찾는 이야기가 오래 남았어요.');
    if (visibility === 'PUBLIC') await fireEvent.press(screen.getByRole('radio', { name: '공개' }));
    await fireEvent.press(screen.getByRole('button', { name: '감상 저장' }));
    expect(await screen.findByText('내 안의 세계를 돌아봤어요.')).toBeOnTheScreen();
    expect(screen).toHavePathname(base);
    expect(repository.reviews.list({ bookId })).toHaveLength(1);
    expect(repository.reviews.list({ bookId })[0]).toMatchObject({ bookId, visibility, syncPending: true, deleted: false });
    expect(screen.getByText('기기에 저장됨 · 동기화 대기')).toBeOnTheScreen();
});

test('FR-07 S-51 길이 오류는 저장을 막고 수정 후 저장할 수 있어요', async () => {
    await renderRouter(routes, { initialUrl: `${base}/write` });
    await fireEvent.changeText(await screen.findByLabelText('한줄평'), '가'.repeat(101));
    await fireEvent.press(screen.getByRole('button', { name: '감상 저장' }));
    expect(screen.getByRole('alert')).toHaveTextContent('한줄평은 100자 이내로 입력해 주세요.');
    expect(repository.reviews.list()).toHaveLength(0);
    await fireEvent.changeText(screen.getByLabelText('한줄평'), '가'.repeat(100));
    await fireEvent.press(screen.getByRole('button', { name: '감상 저장' }));
    expect(await screen.findByText('가'.repeat(100))).toBeOnTheScreen();
});

test('FR-07 NFR-04 S-52 문장과 0쪽·메모를 저장하면 목록에 나타나요', async () => {
    await renderRouter(routes, { initialUrl: base });
    await fireEvent.press(await screen.findByRole('button', { name: '문장 추가' }));
    await fireEvent.changeText(await screen.findByLabelText('좋아하는 문장'), '새는 알에서 나오려고 투쟁한다.');
    await fireEvent.changeText(screen.getByLabelText('쪽수 (선택)'), '0');
    await fireEvent.changeText(screen.getByLabelText('메모 (선택)'), '다시 읽고 싶은 구절');
    await fireEvent.press(screen.getByRole('button', { name: '문장 저장' }));
    expect(await screen.findByText('새는 알에서 나오려고 투쟁한다.')).toBeOnTheScreen();
    expect(screen.getByText('0쪽')).toBeOnTheScreen();
    expect(screen.getByText('다시 읽고 싶은 구절')).toBeOnTheScreen();
    expect(repository.quotes.list()[0]).toMatchObject({ bookId, page: 0, memo: '다시 읽고 싶은 구절', syncPending: true });
});

test.each(['write', 'quote'])('FR-07 D-03 S-51 S-52 %s 작성 중 닫기를 취소하면 내용을 유지하고 확인하면 버려요', async route => {
    const alert = jest.spyOn(Alert, 'alert');
    await renderRouter(routes, { initialUrl: base });
    await fireEvent.press(await screen.findByRole('button', { name: route === 'write' ? '감상 쓰기' : '문장 추가' }));
    const label = route === 'write' ? '한줄평' : '좋아하는 문장';
    await fireEvent.changeText(await screen.findByLabelText(label), '작성 중인 내용');
    await fireEvent.press(screen.getByRole('button', { name: '닫기' }));
    expect(alert).toHaveBeenCalledWith('작성 중인 감상을 닫을까요?', expect.any(String), expect.any(Array));
    await act(async () => { alert.mock.calls[0][2]?.find(button => button.text === '계속 작성')?.onPress?.(); });
    expect(screen.getByLabelText(label)).toHaveDisplayValue('작성 중인 내용');
    await act(async () => { alert.mock.calls[0][2]?.find(button => button.text === '닫기')?.onPress?.(); });
    expect(screen).toHavePathname(base);
    expect(repository.reviews.list()).toHaveLength(0);
    expect(repository.quotes.list()).toHaveLength(0);
});

test('FR-07 D-03 S-51 Android 뒤로 이동도 작성 중 확인하고 빈 작성은 바로 닫혀요', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    await renderRouter(routes, { initialUrl: base });
    await fireEvent.press(await screen.findByRole('button', { name: '감상 쓰기' }));
    await screen.findByLabelText('한줄평');
    await act(async () => router.back());
    expect(alert).not.toHaveBeenCalled();
    await fireEvent.press(await screen.findByRole('button', { name: '감상 쓰기' }));
    await fireEvent.changeText(await screen.findByLabelText('독후감'), '뒤로 가도 지켜 주세요.');
    await act(async () => router.back());
    expect(alert).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('독후감')).toHaveDisplayValue('뒤로 가도 지켜 주세요.');
});

test('NFR-04 S-51 저장 실패 시 내용을 보존하고 재시도해 한 번만 저장해요', async () => {
    await renderRouter(routes, { initialUrl: `${base}/write` });
    await fireEvent.changeText(await screen.findByLabelText('한줄평'), '보존할 감상');
    const save = jest.spyOn(repository.reviews, 'save').mockImplementationOnce(() => { throw new Error('SQLITE_FULL'); });
    await fireEvent.press(screen.getByRole('button', { name: '감상 저장' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/저장하지 못했어요\./);
    expect(screen.getByLabelText('한줄평')).toHaveDisplayValue('보존할 감상');
    const firstId = save.mock.calls[0][0].id;
    await fireEvent.press(screen.getByRole('button', { name: '감상 저장' }));
    expect(await screen.findByText('보존할 감상')).toBeOnTheScreen();
    expect(repository.reviews.list()).toHaveLength(1);
    expect(repository.reviews.list()[0].id).toBe(firstId);
});

test('FR-07 S-50 삭제된 책은 감상 작성 진입을 제공하지 않아요', async () => {
    repository.books.softDelete(bookId);
    await renderRouter(routes, { initialUrl: base });
    expect(await screen.findByText('책을 찾을 수 없어요. 삭제된 책인지 확인해 주세요.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '감상 쓰기' })).toBeNull();
});

test('NFR-04 S-50 저장소 오류에서 재시도할 수 있어요', async () => {
    jest.mocked(initializeDatabase).mockRejectedValueOnce(new Error('읽기 실패'));
    await renderRouter(routes, { initialUrl: base });
    expect(await screen.findByRole('alert')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '다시 시도해 주세요' }));
    expect(await screen.findByRole('button', { name: '감상 쓰기' })).toBeOnTheScreen();
});

test('NFR-05·09 S-50 서버 비공개 감상과 공개 초안을 보고 비공개로 다시 저장해요', async () => {
    const id = '00000000-0000-4000-8000-000000000003';
    repository.reviews.save({ id, bookId, oneLine: '기기 초안', body: null, visibility: 'PUBLIC', publishedAt: null });
    repository.reviews.markConflict(id);
    repository.reviews.setConflictLatest(id, { oneLine: '서버 최신 감상', body: null, visibility: 'PRIVATE', version: 3 });

    await renderRouter(routes, { initialUrl: base });
    expect(await screen.findByText('서버의 최신 감상 · 비공개')).toBeOnTheScreen();
    expect(screen.getByText('서버 최신 감상')).toBeOnTheScreen();
    expect(screen.getByText('기기 초안')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '초안을 비공개로 저장' }));
    expect(repository.reviews.get(id)).toMatchObject({ visibility: 'PRIVATE', serverVersion: 3, conflict: null, syncPending: true });
});
