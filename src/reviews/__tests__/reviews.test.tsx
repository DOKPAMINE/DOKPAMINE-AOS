import { Alert, Text } from 'react-native';
import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import ReviewList from '../../../app/book/[id]/review';
import QuoteWrite from '../../../app/book/[id]/review/quote';
import OneLineWrite from '../../../app/book/[id]/review/one-line';
import ReportWrite from '../../../app/book/[id]/review/report';
import { initializeDatabase, prepareRecordDatabase } from '../../db/client';
import { createRecordRepository, type RecordRepository } from '../../db/repository';
import { memorySQLite } from '../../db/__tests__/sqliteAdapter';
import { tokenStorage } from '../../api/tokenStorage';
import { bookVisibilityPreferences, reviewPreferences } from '../../my/preferences';
import { sizes } from '../../theme';
import { KST_OFFSET_MS } from '../../domain/kstDate';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));
jest.mock('expo-sqlite/kv-store', () => {
    const store = new Map<string, string>();
    return { __esModule: true, default: { store,
        getItemSync: jest.fn((key: string) => store.get(key) ?? null), setItemSync: jest.fn((key: string, value: string) => { store.set(key, value); }) } };
});
jest.mock('../../api/tokenStorage', () => ({ tokenStorage: { getSession: jest.fn() } }));
jest.mock('../../db/client', () => ({ ...jest.requireActual('../../db/client'), initializeDatabase: jest.fn() }));
const bookId = '00000000-0000-4000-8000-000000000001';
const base = `/book/${bookId}/review`;
const routes = {
    'book/[id]/index': () => <Text>책 상세</Text>,
    'book/[id]/review/index': ReviewList,
    'book/[id]/review/quote': QuoteWrite,
    'book/[id]/review/one-line': OneLineWrite,
    'book/[id]/review/report': ReportWrite,
};
let memory: ReturnType<typeof memorySQLite>;
let repository: RecordRepository;
beforeEach(async () => {
    memory = memorySQLite();
    const { db } = await prepareRecordDatabase(memory.sqlite);
    repository = createRecordRepository(db, () => 100000);
    repository.books.save({ id: bookId, title: '데미안', author: '헤르만 헤세', isbn: null, publisher: null,
        totalPages: 240, currentPage: 84, genre: '소설/시', status: 'READING', coverUrl: null, sideCoverUrl: null, yes24ProductUrl: null, catalogPending: false, completedCount: 0, completedAt: null });
    jest.mocked(initializeDatabase).mockResolvedValue({ db, repository });
    jest.mocked(tokenStorage.getSession).mockResolvedValue(null);
});
afterEach(() => { memory.connection.close(); jest.restoreAllMocks(); });

test('#75 FR-07 S-50 빈 목록에서 한줄평·독후감·문장 작성으로 각각 진입할 수 있어요', async () => {
    await renderRouter(routes, { initialUrl: base });
    expect(await screen.findByText('아직 한줄평이 없어요. 이 책을 한마디로 남겨 주세요.')).toBeOnTheScreen();
    expect(screen.getByText('아직 독후감이 없어요. 책을 읽고 느낀 점을 남겨 주세요.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '문장 추가' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '한줄평 수정' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: '한줄평 쓰기' }));
    expect(await screen.findByText('이 한줄평은 비공개로 저장돼요. 공개 범위는 책 상세에서 바꿀 수 있어요.')).toBeOnTheScreen();
    await act(async () => router.back());
    await fireEvent.press(await screen.findByRole('button', { name: '독후감 쓰기' }));
    expect(await screen.findByLabelText('독후감')).toBeOnTheScreen();
});

test('#75 FR-07 NFR-04 S-50 한줄평을 저장하면 하나가 생기고 수정으로 열어 같은 한줄평을 고쳐요', async () => {
    await renderRouter(routes, { initialUrl: base });
    await fireEvent.press(await screen.findByRole('button', { name: '한줄평 쓰기' }));
    await fireEvent.changeText(await screen.findByLabelText('한줄평'), '처음 한줄평');
    await fireEvent.press(screen.getByRole('button', { name: '한줄평 저장' }));
    expect(await screen.findByText('처음 한줄평')).toBeOnTheScreen();
    expect(screen).toHavePathname(base);
    expect(screen.getByText('기기에 저장됨 · 동기화 대기')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '한줄평 쓰기' })).toBeNull();
    const [first] = repository.reviews.list({ bookId });

    await fireEvent.press(screen.getByRole('button', { name: '한줄평 수정' }));
    expect(await screen.findByLabelText('한줄평')).toHaveDisplayValue('처음 한줄평');
    await fireEvent.changeText(screen.getByLabelText('한줄평'), '고친 한줄평');
    await fireEvent.press(screen.getByRole('button', { name: '한줄평 저장' }));
    expect(await screen.findByText('고친 한줄평')).toBeOnTheScreen();
    expect(repository.reviews.list({ bookId })).toEqual([expect.objectContaining({ id: first.id, oneLine: '고친 한줄평', body: null, syncPending: true })]);
});

test.each([
    ['한줄평', '한줄평 쓰기', 100, '한줄평은 100자 이내로 입력해 주세요.'],
    ['독후감', '독후감 쓰기', 5000, '독후감은 5,000자 이내로 입력해 주세요.'],
] as const)('FR-07 S-51 S-53 %s 길이 오류는 저장을 막고 수정 후 저장할 수 있어요', async (label, button, limit, message) => {
    await renderRouter(routes, { initialUrl: base });
    await fireEvent.press(await screen.findByRole('button', { name: button }));
    await fireEvent.changeText(await screen.findByLabelText(label), '가'.repeat(limit + 1));
    await fireEvent.press(screen.getByRole('button', { name: `${label} 저장` }));
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(repository.reviews.list()).toHaveLength(0);
    await fireEvent.changeText(screen.getByLabelText(label), '가'.repeat(limit));
    await fireEvent.press(screen.getByRole('button', { name: `${label} 저장` }));
    expect(await screen.findByText('가'.repeat(limit))).toBeOnTheScreen();
});

test('#69 FR-07 NFR-04 S-52 문장과 0쪽을 저장하면 메모 없이 목록에 나타나요', async () => {
    await renderRouter(routes, { initialUrl: base });
    await fireEvent.press(await screen.findByRole('button', { name: '문장 추가' }));
    await fireEvent.changeText(await screen.findByLabelText('좋아하는 문장'), '새는 알에서 나오려고 투쟁한다.');
    await fireEvent.changeText(screen.getByLabelText('쪽수 (선택)'), '0');
    expect(screen.queryByLabelText('메모 (선택)')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: '문장 저장' }));
    expect(await screen.findByText('새는 알에서 나오려고 투쟁한다.')).toBeOnTheScreen();
    expect(screen.getByText('0쪽')).toBeOnTheScreen();
    expect(repository.quotes.list()[0]).toMatchObject({ bookId, page: 0, memo: null, syncPending: true });
});

test('#69 FR-07 S-50 예전에 남긴 메모는 문장 목록에 보이지 않아요', async () => {
    repository.quotes.save({ id: '00000000-0000-4000-8000-000000000002', bookId, text: '예전 문장', page: 10, memo: '예전 메모' });
    await renderRouter(routes, { initialUrl: base });
    expect(await screen.findByText('예전 문장')).toBeOnTheScreen();
    expect(screen.queryByText('예전 메모')).toBeNull();
});

test.each([
    ['한줄평 쓰기', '한줄평'], ['독후감 쓰기', '독후감'], ['문장 추가', '좋아하는 문장'],
])('FR-07 D-03 S-51 S-52 S-53 %s 중 닫기를 취소하면 내용을 유지하고 확인하면 버려요', async (button, label) => {
    const alert = jest.spyOn(Alert, 'alert');
    await renderRouter(routes, { initialUrl: base });
    await fireEvent.press(await screen.findByRole('button', { name: button }));
    await fireEvent.changeText(await screen.findByLabelText(label), '작성 중인 내용');
    await fireEvent.press(screen.getByRole('button', { name: '닫기' }));
    expect(alert).toHaveBeenCalledWith('작성 중인 감상을 닫을까요?', expect.any(String), expect.any(Array));
    await act(async () => { alert.mock.calls[0][2]?.find(item => item.text === '계속 작성')?.onPress?.(); });
    expect(screen.getByLabelText(label)).toHaveDisplayValue('작성 중인 내용');
    await act(async () => { alert.mock.calls[0][2]?.find(item => item.text === '닫기')?.onPress?.(); });
    expect(screen).toHavePathname(base);
    expect(repository.reviews.list()).toHaveLength(0);
    expect(repository.quotes.list()).toHaveLength(0);
});

test('#75 D-03 S-51 한줄평 수정을 바꾸지 않고 닫으면 확인 없이 닫혀요', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    repository.reviews.save({ id: '00000000-0000-4000-8000-000000000009', bookId, oneLine: '기존 한줄평', body: null, visibility: 'PRIVATE', publishedAt: null });
    await renderRouter(routes, { initialUrl: base });
    await fireEvent.press(await screen.findByRole('button', { name: '한줄평 수정' }));
    await screen.findByLabelText('한줄평');
    await act(async () => router.back());
    expect(alert).not.toHaveBeenCalled();
    expect(screen).toHavePathname(base);
});

test('FR-07 D-03 S-53 Android 뒤로 이동도 작성 중 확인하고 빈 작성은 바로 닫혀요', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    await renderRouter(routes, { initialUrl: base });
    await fireEvent.press(await screen.findByRole('button', { name: '독후감 쓰기' }));
    await screen.findByLabelText('독후감');
    await act(async () => router.back());
    expect(alert).not.toHaveBeenCalled();
    await fireEvent.press(await screen.findByRole('button', { name: '독후감 쓰기' }));
    await fireEvent.changeText(await screen.findByLabelText('독후감'), '뒤로 가도 지켜 주세요.');
    await act(async () => router.back());
    expect(alert).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('독후감')).toHaveDisplayValue('뒤로 가도 지켜 주세요.');
});

test.each([['one-line', '한줄평'], ['report', '독후감']])('NFR-04 S-51 S-53 %s 저장 실패 시 내용을 보존하고 재시도해 한 번만 저장해요', async (route, label) => {
    await renderRouter(routes, { initialUrl: `${base}/${route}` });
    await fireEvent.changeText(await screen.findByLabelText(label), '보존할 감상');
    const save = jest.spyOn(repository.reviews, 'save').mockImplementationOnce(() => { throw new Error('SQLITE_FULL'); });
    await fireEvent.press(screen.getByRole('button', { name: `${label} 저장` }));
    expect(screen.getByRole('alert')).toHaveTextContent(/저장하지 못했어요\./);
    expect(screen.getByLabelText(label)).toHaveDisplayValue('보존할 감상');
    const firstId = save.mock.calls[0][0].id;
    await fireEvent.press(screen.getByRole('button', { name: `${label} 저장` }));
    expect(await screen.findByText('보존할 감상')).toBeOnTheScreen();
    expect(repository.reviews.list()).toHaveLength(1);
    expect(repository.reviews.list()[0].id).toBe(firstId);
});

test('FR-07 S-50 삭제된 책은 감상 작성 진입을 제공하지 않아요', async () => {
    repository.books.softDelete(bookId);
    await renderRouter(routes, { initialUrl: base });
    expect(await screen.findByText('책을 찾을 수 없어요. 삭제된 책인지 확인해 주세요.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '한줄평 쓰기' })).toBeNull();
    expect(screen.queryByRole('button', { name: '독후감 쓰기' })).toBeNull();
});

test('NFR-04 S-50 저장소 오류에서 재시도할 수 있어요', async () => {
    jest.mocked(initializeDatabase).mockRejectedValueOnce(new Error('읽기 실패'));
    await renderRouter(routes, { initialUrl: base });
    expect(await screen.findByRole('alert')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '다시 시도해 주세요' }));
    expect(await screen.findByRole('button', { name: '한줄평 쓰기' })).toBeOnTheScreen();
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

test('#75 S-50 맨 위에 최신 한줄평 하나, 그 아래에 독후감을 최신 작성 순으로 보여 줘요', async () => {
    let time = 100000;
    const timed = createRecordRepository((await prepareRecordDatabase(memory.sqlite)).db, () => time);
    const save = (id: string, oneLine: string | null, body: string | null) =>
        timed.reviews.save({ id: `00000000-0000-4000-8000-00000000001${id}`, bookId, oneLine, body, visibility: 'PRIVATE', publishedAt: null });
    save('1', '예전 한줄평', null);
    time += 1; save('2', null, '첫 독후감');
    time += 1; save('3', '최신 한줄평', null);
    time += 1; save('4', null, '둘째 독후감');
    await renderRouter(routes, { initialUrl: base });
    expect(await screen.findByText('최신 한줄평')).toBeOnTheScreen();
    expect(screen.queryByText('예전 한줄평')).toBeNull();
    const order = ['한줄평', '최신 한줄평', '독후감', '둘째 독후감', '첫 독후감'];
    const texts = screen.getAllByText(new RegExp(`^(${order.join('|')})$`)).map(node => node.props.children);
    expect(texts).toEqual(order);
});

test('#75 #89 FR-08 S-51 한줄평 쓰기 화면은 한줄평 칸 하나만 두고 공개 범위 선택 없이 책의 공개 범위로 만들어요', async () => {
    repository.reviews.save({ id: '00000000-0000-4000-8000-000000000013', bookId, oneLine: null, body: '공개한 독후감', visibility: 'PUBLIC', publishedAt: null });
    await renderRouter(routes, { initialUrl: `${base}/one-line` });
    expect(await screen.findByText('한줄평 쓰기')).toBeOnTheScreen();
    expect(screen.queryByLabelText('독후감')).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.getByText('이 한줄평은 공개로 저장돼요. 동기화되면 다른 독자도 볼 수 있어요. 공개 범위는 책 상세에서 바꿀 수 있어요.')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('한줄평'), '처음 남기는 한줄평');
    await fireEvent.press(screen.getByRole('button', { name: '한줄평 저장' }));
    expect(await screen.findByText('처음 남기는 한줄평')).toBeOnTheScreen();
    expect(repository.reviews.list({ bookId }).find(review => review.oneLine))
        .toEqual(expect.objectContaining({ oneLine: '처음 남기는 한줄평', body: null, visibility: 'PUBLIC', syncPending: true }));
});

test('#75 S-51 한줄평 수정은 기존 한줄평을 채워 열고 같은 감상을 고쳐요', async () => {
    const id = '00000000-0000-4000-8000-000000000006';
    repository.reviews.save({ id, bookId, oneLine: '기존 한줄평', body: null, visibility: 'PUBLIC', publishedAt: null });
    await renderRouter(routes, { initialUrl: `${base}/one-line` });
    expect(await screen.findByText('한줄평 수정')).toBeOnTheScreen();
    expect(screen.getByLabelText('한줄평')).toHaveDisplayValue('기존 한줄평');
    expect(screen.getByText(/^이 한줄평은 공개로 저장돼요\./)).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('한줄평'), '고친 한줄평');
    await fireEvent.press(screen.getByRole('button', { name: '한줄평 저장' }));
    expect(await screen.findByText('고친 한줄평')).toBeOnTheScreen();
    expect(repository.reviews.list({ bookId })).toEqual([expect.objectContaining({ id, oneLine: '고친 한줄평', visibility: 'PUBLIC' })]);
});

test('#75 NFR-05 S-51 고치던 한줄평이 편집 중 충돌하면 다른 감상을 고치거나 새로 만들지 않아요', async () => {
    const older = '00000000-0000-4000-8000-000000000010';
    const id = '00000000-0000-4000-8000-000000000011';
    let time = 100000;
    const timed = createRecordRepository((await prepareRecordDatabase(memory.sqlite)).db, () => time);
    timed.reviews.save({ id: older, bookId, oneLine: '예전 한줄평', body: null, visibility: 'PRIVATE', publishedAt: null });
    time += 1;
    timed.reviews.save({ id, bookId, oneLine: '기존 한줄평', body: '함께 쓴 독후감', visibility: 'PRIVATE', publishedAt: null });
    const olderBefore = repository.reviews.get(older);
    await renderRouter(routes, { initialUrl: `${base}/one-line` });
    expect(await screen.findByLabelText('한줄평')).toHaveDisplayValue('기존 한줄평');
    await act(async () => repository.reviews.markConflict(id));
    await fireEvent.changeText(screen.getByLabelText('한줄평'), '고친 한줄평');
    await fireEvent.press(screen.getByRole('button', { name: '한줄평 저장' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/고치던 한줄평이 서버 기록과 달라졌거나 삭제됐어요\./);
    expect(repository.reviews.list({ bookId })).toHaveLength(2);
    expect(repository.reviews.get(older)).toEqual(olderBefore);
    expect(repository.reviews.get(id)).toMatchObject({ oneLine: '기존 한줄평', body: '함께 쓴 독후감' });
});

test('#75 S-51 독후감과 함께 쓴 예전 감상의 한줄평을 고쳐도 독후감은 그대로예요', async () => {
    const id = '00000000-0000-4000-8000-000000000012';
    repository.reviews.save({ id, bookId, oneLine: '기존 한줄평', body: '함께 쓴 독후감', visibility: 'PRIVATE', publishedAt: null });
    await renderRouter(routes, { initialUrl: `${base}/one-line` });
    await fireEvent.changeText(await screen.findByLabelText('한줄평'), '고친 한줄평');
    await fireEvent.press(screen.getByRole('button', { name: '한줄평 저장' }));
    expect(await screen.findByText('고친 한줄평')).toBeOnTheScreen();
    expect(repository.reviews.list({ bookId })).toEqual([expect.objectContaining({ id, oneLine: '고친 한줄평', body: '함께 쓴 독후감' })]);
});

test('#75 S-51 한줄평을 비워 저장하면 막고 안내해요', async () => {
    const id = '00000000-0000-4000-8000-000000000007';
    const before = repository.reviews.save({ id, bookId, oneLine: '기존 한줄평', body: null, visibility: 'PRIVATE', publishedAt: null });
    await renderRouter(routes, { initialUrl: `${base}/one-line` });
    await fireEvent.changeText(await screen.findByLabelText('한줄평'), '');
    await fireEvent.press(screen.getByRole('button', { name: '한줄평 저장' }));
    expect(screen.getByRole('alert')).toHaveTextContent('한줄평은 비울 수 없어요. 남길 한줄평을 입력해 주세요.');
    expect(repository.reviews.get(id)).toEqual(before);
});

test('#75 FR-08 S-53 독후감 쓰기 화면은 독후감 칸 하나만 두고 저장할 때마다 한줄평을 건드리지 않고 새로 쌓아요', async () => {
    const oneLineId = '00000000-0000-4000-8000-000000000008';
    const oneLine = repository.reviews.save({ id: oneLineId, bookId, oneLine: '기존 한줄평', body: null, visibility: 'PRIVATE', publishedAt: null });
    await renderRouter(routes, { initialUrl: `${base}/report` });
    for (const body of ['첫 독후감', '둘째 독후감']) {
        if (body !== '첫 독후감') await act(async () => router.push(`${base}/report`));
        await fireEvent.changeText(await screen.findByLabelText('독후감'), body);
        expect(screen.queryByLabelText('한줄평')).toBeNull();
        expect(screen.queryByRole('radio')).toBeNull();
        await fireEvent.press(screen.getByRole('button', { name: '독후감 저장' }));
        expect(await screen.findByText(body)).toBeOnTheScreen();
    }
    expect(repository.reviews.get(oneLineId)).toEqual(oneLine);
    const reports = repository.reviews.list({ bookId }).filter(review => review.body);
    expect(reports.map(({ oneLine: line, body, visibility }) => ({ line, body, visibility })).sort((a, b) => a.body!.localeCompare(b.body!)))
        .toEqual([{ line: null, body: '둘째 독후감', visibility: 'PRIVATE' }, { line: null, body: '첫 독후감', visibility: 'PRIVATE' }]);
});

test.each([
    ['PUBLIC', ['PUBLIC'], 'PUBLIC'],
    ['PRIVATE', ['PRIVATE'], 'PRIVATE'],
] as const)('#89 FR-08 S-53 %s 책에 새로 쓴 독후감은 책의 공개 범위를 따라 저장해요', async (_name, existing, expected) => {
    existing.forEach((visibility, index) => repository.reviews.save({ id: `00000000-0000-4000-8000-00000000002${index}`, bookId,
        oneLine: index === 0 ? '기존 한줄평' : null, body: index === 0 ? null : '기존 독후감', visibility, publishedAt: null }));
    await renderRouter(routes, { initialUrl: `${base}/report` });
    expect(await screen.findByText(expected === 'PUBLIC' ? /^이 독후감은 공개로 저장돼요\./ : /^이 독후감은 비공개로 저장돼요\./)).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('독후감'), '새 독후감');
    await fireEvent.press(screen.getByRole('button', { name: '독후감 저장' }));
    expect(await screen.findByText('새 독후감')).toBeOnTheScreen();
    expect(repository.reviews.list({ bookId }).find(review => review.body === '새 독후감')).toMatchObject({ visibility: expected, syncPending: true });
});

test('#89 FR-08 S-51 S-53 감상이 없는 책의 첫 감상은 기기에 저장한 책별 값을 따르고 다음부터는 감상들의 공개 범위를 따라요', async () => {
    jest.mocked(tokenStorage.getSession).mockResolvedValue({ accessToken: 'token', expiresAt: '2099-01-01T00:00:00Z', userId: 'reader' });
    reviewPreferences.save('reader', 'PRIVATE');
    bookVisibilityPreferences.save('reader', bookId, 'PUBLIC');
    await renderRouter(routes, { initialUrl: `${base}/report` });
    expect(await screen.findByText(/^이 독후감은 공개로 저장돼요\./)).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('독후감'), '첫 독후감');
    await fireEvent.press(screen.getByRole('button', { name: '독후감 저장' }));
    expect(await screen.findByText('첫 독후감')).toBeOnTheScreen();
    expect(repository.reviews.list({ bookId })).toEqual([expect.objectContaining({ body: '첫 독후감', visibility: 'PUBLIC' })]);

    // 감상이 생긴 뒤에는 책별 저장값이 아니라 감상들의 공개 범위로 판단한다.
    repository.reviews.setBookVisibility(bookId, 'PRIVATE');
    await act(async () => router.push(`${base}/one-line`));
    expect(await screen.findByText(/^이 한줄평은 비공개로 저장돼요\./)).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('한줄평'), '첫 한줄평');
    await fireEvent.press(screen.getByRole('button', { name: '한줄평 저장' }));
    expect(await screen.findByText('첫 한줄평')).toBeOnTheScreen();
    expect(repository.reviews.list({ bookId }).find(review => review.oneLine)).toMatchObject({ visibility: 'PRIVATE', syncPending: true });
});

describe('#91 감상·문장 수정과 삭제', () => {
    const reportId = '00000000-0000-4000-8000-000000000031';
    const quoteId = '00000000-0000-4000-8000-000000000032';
    const oneLineId = '00000000-0000-4000-8000-000000000033';
    const pressAlert = async (alert: jest.SpyInstance, text: string) => {
        const buttons = alert.mock.calls.at(-1)?.[2] as { text: string; onPress?: () => void }[];
        await act(async () => { buttons.find(item => item.text === text)?.onPress?.(); });
    };

    test('S-50 S-53 독후감 카드의 수정은 기존 본문을 채워 열고 저장하면 같은 독후감이 바뀌어 새로 생기지 않아요', async () => {
        repository.reviews.save({ id: reportId, bookId, oneLine: null, body: '처음 독후감', visibility: 'PUBLIC', publishedAt: null });
        await renderRouter(routes, { initialUrl: base });
        await fireEvent.press(await screen.findByRole('button', { name: '독후감 처음 독후감 수정' }));
        expect(await screen.findByText('독후감 수정')).toBeOnTheScreen();
        expect(screen.getByLabelText('독후감')).toHaveDisplayValue('처음 독후감');
        expect(screen.queryByRole('radio')).toBeNull();
        expect(screen.getByText(/^이 독후감은 공개로 저장돼요\./)).toBeOnTheScreen();
        await fireEvent.changeText(screen.getByLabelText('독후감'), '고친 독후감');
        await fireEvent.press(screen.getByRole('button', { name: '독후감 저장' }));
        expect(await screen.findByText('고친 독후감')).toBeOnTheScreen();
        expect(screen).toHavePathname(base);
        expect(repository.reviews.list({ bookId })).toEqual([expect.objectContaining({ id: reportId, body: '고친 독후감', visibility: 'PUBLIC', syncPending: true })]);
    });

    test.each([
        ['한줄평', 'one-line', '한줄평', ' 기존 한줄평 '],
        ['독후감', `report?reviewId=${reportId}`, '독후감', ' 처음 독후감 '],
        ['문장', `quote?quoteId=${quoteId}`, '좋아하는 문장', ' 예전 문장 '],
    ])('NFR-05 S-51 S-52 S-53 %s 수정을 바꾸지 않고 저장하면 DB에 다시 쓰지 않고 감상과 문장으로 돌아가요', async (kind, route, label, retyped) => {
        const review = kind === '한줄평'
            ? repository.reviews.save({ id: oneLineId, bookId, oneLine: '기존 한줄평', body: null, visibility: 'PUBLIC', publishedAt: null })
            : repository.reviews.save({ id: reportId, bookId, oneLine: null, body: '처음 독후감', visibility: 'PUBLIC', publishedAt: null });
        const quote = repository.quotes.save({ id: quoteId, bookId, text: '예전 문장', page: 10, memo: null });
        // 동기화가 끝난 기록이라야 syncPending이 다시 켜지지 않는지 확인할 수 있다.
        repository.reviews.markSynced(review.id, review.localVersion);
        repository.quotes.markSynced(quote.id, quote.localVersion);
        const before = { review: repository.reviews.get(review.id), quote: repository.quotes.get(quote.id) };
        const alert = jest.spyOn(Alert, 'alert');
        const notify = jest.fn();
        repository.subscribe(notify);
        await renderRouter(routes, { initialUrl: `${base}/${route}` });
        // 앞뒤 공백만 다르게 다시 입력해도 바뀐 것이 없다.
        await fireEvent.changeText(await screen.findByLabelText(label), retyped);
        await fireEvent.press(screen.getByRole('button', { name: `${kind === '문장' ? '문장' : label} 저장` }));
        expect(await screen.findByText('감상과 문장')).toBeOnTheScreen();
        expect(screen).toHavePathname(base);
        expect(screen.queryByRole('alert')).toBeNull();
        expect(alert).not.toHaveBeenCalled();
        expect(notify).not.toHaveBeenCalled();
        expect({ review: repository.reviews.get(review.id), quote: repository.quotes.get(quote.id) }).toEqual(before);
        expect(before.review).toMatchObject({ syncPending: false });
        expect(before.quote).toMatchObject({ syncPending: false });
    });

    test('S-50 S-52 문장 카드의 수정은 문장·쪽수를 채워 열고 같은 문장을 고치며 예전 메모는 지우지 않아요', async () => {
        repository.quotes.save({ id: quoteId, bookId, text: '예전 문장', page: 10, memo: '예전 메모' });
        await renderRouter(routes, { initialUrl: base });
        await fireEvent.press(await screen.findByRole('button', { name: '문장 예전 문장 수정' }));
        expect(await screen.findByText('문장 수정')).toBeOnTheScreen();
        expect(screen.getByLabelText('좋아하는 문장')).toHaveDisplayValue('예전 문장');
        expect(screen.getByLabelText('쪽수 (선택)')).toHaveDisplayValue('10');
        await fireEvent.changeText(screen.getByLabelText('좋아하는 문장'), '고친 문장');
        await fireEvent.changeText(screen.getByLabelText('쪽수 (선택)'), '');
        await fireEvent.press(screen.getByRole('button', { name: '문장 저장' }));
        expect(await screen.findByText('고친 문장')).toBeOnTheScreen();
        expect(repository.quotes.list({ bookId })).toEqual([expect.objectContaining({ id: quoteId, text: '고친 문장', page: null, memo: '예전 메모', syncPending: true })]);
    });

    test.each([
        ['한줄평 삭제', '지울 한줄평', () => repository.reviews.get(oneLineId, true)],
        ['독후감 지울 독후감 삭제', '지울 독후감', () => repository.reviews.get(reportId, true)],
        ['문장 지울 문장 삭제', '지울 문장', () => repository.quotes.get(quoteId, true)],
    ] as const)('NFR-04 S-50 %s은 확인창에서 취소하면 그대로이고 삭제하면 목록에서 사라져 동기화 대기 tombstone이 돼요', async (button, text, row) => {
        repository.reviews.save({ id: oneLineId, bookId, oneLine: '지울 한줄평', body: null, visibility: 'PRIVATE', publishedAt: null });
        repository.reviews.save({ id: reportId, bookId, oneLine: null, body: '지울 독후감', visibility: 'PRIVATE', publishedAt: null });
        repository.quotes.save({ id: quoteId, bookId, text: '지울 문장', page: null, memo: null });
        const alert = jest.spyOn(Alert, 'alert');
        await renderRouter(routes, { initialUrl: base });
        await fireEvent.press(await screen.findByRole('button', { name: button }));
        expect(alert).toHaveBeenLastCalledWith('삭제할까요?', '되돌릴 수 없어요.', expect.any(Array));
        await pressAlert(alert, '취소');
        expect(screen.getByText(text)).toBeOnTheScreen();
        expect(row()).toMatchObject({ deleted: false });

        await fireEvent.press(screen.getByRole('button', { name: button }));
        await pressAlert(alert, '삭제');
        expect(screen.queryByText(text)).toBeNull();
        expect(row()).toMatchObject({ deleted: true, syncPending: true });
    });

    test('S-50 한줄평과 독후감이 함께 든 예전 감상에서 한줄평만 지우면 독후감은 남아요', async () => {
        repository.reviews.save({ id: oneLineId, bookId, oneLine: '함께 쓴 한줄평', body: '함께 쓴 독후감', visibility: 'PRIVATE', publishedAt: null });
        const alert = jest.spyOn(Alert, 'alert');
        await renderRouter(routes, { initialUrl: base });
        await fireEvent.press(await screen.findByRole('button', { name: '한줄평 삭제' }));
        await pressAlert(alert, '삭제');
        expect(screen.queryByText('함께 쓴 한줄평')).toBeNull();
        expect(screen.getByText('함께 쓴 독후감')).toBeOnTheScreen();
        expect(screen.getByRole('button', { name: '한줄평 쓰기' })).toBeOnTheScreen();
        expect(repository.reviews.get(oneLineId)).toMatchObject({ oneLine: null, body: '함께 쓴 독후감', syncPending: true });
    });

    test('NFR-05 S-50 한줄평이 든 충돌 감상이 있으면 한줄평 수정·삭제를 막고 이유를 보여 줘요', async () => {
        const conflictId = '00000000-0000-4000-8000-000000000034';
        repository.reviews.save({ id: oneLineId, bookId, oneLine: '보이는 한줄평', body: null, visibility: 'PRIVATE', publishedAt: null });
        repository.reviews.save({ id: conflictId, bookId, oneLine: '충돌한 한줄평', body: null, visibility: 'PRIVATE', publishedAt: null });
        repository.reviews.markConflict(conflictId);
        const alert = jest.spyOn(Alert, 'alert');
        await renderRouter(routes, { initialUrl: base });
        for (const name of ['한줄평 수정', '한줄평 삭제']) {
            const button = await screen.findByRole('button', { name });
            expect(button).toBeDisabled();
            await fireEvent.press(button);
        }
        expect(alert).not.toHaveBeenCalled();
        expect(screen).toHavePathname(base);
        expect(screen.getByText('동기화 충돌을 먼저 해결하면 수정·삭제할 수 있어요.')).toBeOnTheScreen();
        expect(screen.getByText('충돌을 해결하면 이 감상을 수정·삭제할 수 있어요.')).toBeOnTheScreen();
    });

    test('NFR-05 S-50 한줄평 충돌만 남은 책은 새 한줄평 쓰기도 막아 한줄평이 둘이 되지 않게 해요', async () => {
        repository.reviews.save({ id: oneLineId, bookId, oneLine: '충돌한 한줄평', body: null, visibility: 'PRIVATE', publishedAt: null });
        repository.reviews.markConflict(oneLineId);
        await renderRouter(routes, { initialUrl: base });
        expect(await screen.findByRole('button', { name: '한줄평 쓰기' })).toBeDisabled();
        expect(screen.getByText('동기화 충돌을 먼저 해결하면 한줄평을 쓸 수 있어요.')).toBeOnTheScreen();
    });

    test('NFR-05 S-53 고치던 독후감이 편집 중 충돌하면 저장하지 않고 안내해요', async () => {
        repository.reviews.save({ id: reportId, bookId, oneLine: null, body: '처음 독후감', visibility: 'PRIVATE', publishedAt: null });
        await renderRouter(routes, { initialUrl: `${base}/report?reviewId=${reportId}` });
        await fireEvent.changeText(await screen.findByLabelText('독후감'), '고친 독후감');
        await act(async () => repository.reviews.markConflict(reportId));
        await fireEvent.press(screen.getByRole('button', { name: '독후감 저장' }));
        expect(screen.getByRole('alert')).toHaveTextContent(/고치던 독후감이 서버 기록과 달라졌거나 삭제됐어요\./);
        expect(repository.reviews.get(reportId)).toMatchObject({ body: '처음 독후감' });
        expect(repository.reviews.list({ bookId })).toHaveLength(1);
    });

    test.each([
        ['한줄평', 'one-line', '한줄평 저장', /고치던 한줄평이 서버 기록과 달라졌거나 삭제됐어요\./],
        ['독후감', `report?reviewId=${reportId}`, '독후감 저장', /고치던 독후감이 서버 기록과 달라졌거나 삭제됐어요\./],
    ])('NFR-05 S-51 S-53 %s을 바꾸지 않았어도 편집 중 충돌했으면 닫지 않고 충돌을 안내해요', async (kind, route, button, message) => {
        const id = kind === '한줄평' ? oneLineId : reportId;
        repository.reviews.save({ id, bookId, oneLine: kind === '한줄평' ? '기존 한줄평' : null, body: kind === '한줄평' ? null : '처음 독후감',
            visibility: 'PRIVATE', publishedAt: null });
        await renderRouter(routes, { initialUrl: `${base}/${route}` });
        await screen.findByRole('button', { name: button });
        await act(async () => repository.reviews.markConflict(id));
        await fireEvent.press(screen.getByRole('button', { name: button }));
        expect(screen.getByRole('alert')).toHaveTextContent(message);
        expect(screen).toHavePathname(`${base}/${route.split('?')[0]}`);
    });

    test('S-52 바꾸지 않은 문장 수정도 편집 중 삭제됐으면 닫지 않고 안내해요', async () => {
        repository.quotes.save({ id: quoteId, bookId, text: '예전 문장', page: null, memo: null });
        await renderRouter(routes, { initialUrl: `${base}/quote?quoteId=${quoteId}` });
        await screen.findByLabelText('좋아하는 문장');
        await act(async () => { repository.quotes.softDelete(quoteId); });
        await fireEvent.press(screen.getByRole('button', { name: '문장 저장' }));
        expect(screen.getByRole('alert')).toHaveTextContent('고치던 문장이 삭제됐어요. 닫고 감상 목록에서 확인해 주세요.');
        expect(screen).toHavePathname(`${base}/quote`);
    });

    test('S-53 S-52 없는 독후감·문장을 고치려 하면 쓰기 화면 대신 안내해요', async () => {
        await renderRouter(routes, { initialUrl: `${base}/report?reviewId=${reportId}` });
        expect(await screen.findByText('고칠 독후감을 찾을 수 없어요. 삭제됐거나 동기화 충돌 중인지 감상 목록에서 확인해 주세요.')).toBeOnTheScreen();
        await act(async () => router.push(`${base}/quote?quoteId=${quoteId}`));
        expect(await screen.findByText('고칠 문장을 찾을 수 없어요. 삭제됐는지 감상 목록에서 확인해 주세요.')).toBeOnTheScreen();
        expect(screen.queryByLabelText('좋아하는 문장')).toBeNull();
    });
});

describe('#91 FR-08 마지막 감상을 지울 때 책 공개 범위 보존', () => {
    const signIn = (userId: string) => jest.mocked(tokenStorage.getSession)
        .mockResolvedValue({ accessToken: 'token', expiresAt: '2099-01-01T00:00:00Z', userId });
    const save = (id: string, oneLine: string | null, body: string | null, visibility: 'PRIVATE' | 'PUBLIC') =>
        repository.reviews.save({ id, bookId, oneLine, body, visibility, publishedAt: null });
    const deleteBy = async (button: string) => {
        const alert = jest.spyOn(Alert, 'alert');
        await fireEvent.press(await screen.findByRole('button', { name: button }));
        const buttons = alert.mock.calls.at(-1)?.[2] as { text: string; onPress?: () => void }[];
        await act(async () => { buttons.find(item => item.text === '삭제')?.onPress?.(); });
    };

    test.each([
        ['한줄평 삭제', '00000000-0000-4000-8000-000000000041', '공개 한줄평', null],
        ['독후감 공개 독후감 삭제', '00000000-0000-4000-8000-000000000042', null, '공개 독후감'],
    ] as const)('S-50 S-81 %s으로 감상이 0개가 되면 공개였던 책은 S-81 기본값을 바꿔도 다음 감상이 공개예요', async (button, id, oneLine, body) => {
        signIn('keeper');
        reviewPreferences.save('keeper', 'PRIVATE');
        save(id, oneLine, body, 'PUBLIC');
        await renderRouter(routes, { initialUrl: base });
        await deleteBy(button);
        await waitFor(() => expect(bookVisibilityPreferences.load('keeper', bookId)).toBe('PUBLIC'));
        expect(repository.reviews.list({ bookId })).toEqual([]);

        // 기본값을 다시 바꿔도 이 책은 지우기 직전의 공개 범위를 따른다.
        reviewPreferences.save('keeper', 'PRIVATE');
        await act(async () => router.push(`${base}/report`));
        expect(await screen.findByText(/^이 독후감은 공개로 저장돼요\./)).toBeOnTheScreen();
    });

    test('S-50 감상이 남아 있으면 책별 값을 남기지 않고, 문장을 지워도 남기지 않아요', async () => {
        signIn('remaining');
        save('00000000-0000-4000-8000-000000000043', '남는 한줄평', null, 'PUBLIC');
        save('00000000-0000-4000-8000-000000000044', null, '지울 독후감', 'PUBLIC');
        repository.quotes.save({ id: '00000000-0000-4000-8000-000000000045', bookId, text: '지울 문장', page: null, memo: null });
        await renderRouter(routes, { initialUrl: base });
        await deleteBy('독후감 지울 독후감 삭제');
        await deleteBy('문장 지울 문장 삭제');
        expect(screen.queryByText('지울 문장')).toBeNull();
        await act(async () => { await Promise.resolve(); });
        expect(bookVisibilityPreferences.load('remaining', bookId)).toBeNull();
    });

    test('S-50 공개 범위가 섞인 책에서 마지막 감상들을 지우면 공개되지 않은 감상이 있던 사실대로 비공개를 남겨요', async () => {
        signIn('mixed');
        reviewPreferences.save('mixed', 'PUBLIC');
        save('00000000-0000-4000-8000-000000000046', '공개 한줄평', null, 'PUBLIC');
        save('00000000-0000-4000-8000-000000000047', '비공개 한줄평', null, 'PRIVATE');
        await renderRouter(routes, { initialUrl: base });
        await deleteBy('한줄평 삭제');
        await waitFor(() => expect(bookVisibilityPreferences.load('mixed', bookId)).toBe('PRIVATE'));
    });
});

test('#91 S-50 카드의 수정·삭제 버튼은 가로·세로 모두 44dp 이상이고 버튼 역할과 이름이 있어요', async () => {
    repository.reviews.save({ id: '00000000-0000-4000-8000-000000000051', bookId, oneLine: '한줄평', body: null, visibility: 'PRIVATE', publishedAt: null });
    repository.reviews.save({ id: '00000000-0000-4000-8000-000000000052', bookId, oneLine: null, body: '독후감', visibility: 'PRIVATE', publishedAt: null });
    repository.quotes.save({ id: '00000000-0000-4000-8000-000000000053', bookId, text: '문장', page: null, memo: null });
    await renderRouter(routes, { initialUrl: base });
    const names = ['한줄평 수정', '한줄평 삭제', '독후감 독후감 수정', '독후감 독후감 삭제', '문장 문장 수정', '문장 문장 삭제'];
    expect(sizes.minTouch).toBeGreaterThanOrEqual(44);
    for (const name of names) {
        expect(await screen.findByRole('button', { name })).toHaveStyle({ minHeight: sizes.minTouch, minWidth: sizes.minTouch });
    }
});

describe('#95 S-50 독후감 카드의 번호와 날짜', () => {
    // KST 벽시계 시각을 타임스탬프로 바꾼다. 테스트를 돌리는 기기의 시간대와 무관하다.
    const kst = (year: number, month: number, day: number, hour = 0, minute = 0, second = 0, ms = 0) =>
        Date.UTC(year, month, day, hour, minute, second, ms) - KST_OFFSET_MS;
    const id = (n: number) => `00000000-0000-4000-8000-00000000005${n}`;
    let time: number;
    let timed: RecordRepository;
    beforeEach(async () => {
        time = kst(2026, 10, 1, 21, 0);
        timed = createRecordRepository((await prepareRecordDatabase(memory.sqlite)).db, () => time);
    });
    const save = (n: number, oneLine: string | null, body: string | null, at: number) => {
        time = at;
        timed.reviews.save({ id: id(n), bookId, oneLine, body, visibility: 'PRIVATE', publishedAt: null });
    };

    test('먼저 쓴 독후감이 1번이고 처음 쓴 날짜를 보여 주며 스크린리더는 날짜를 말로 읽어요', async () => {
        save(1, '예전 한줄평', '함께 쓴 독후감', kst(2026, 10, 1, 21, 0));
        save(2, null, '둘째 독후감', kst(2026, 10, 15, 8, 0));
        await renderRouter(routes, { initialUrl: base });
        const headings = await screen.findAllByText(/^독후감 \d+ · /);
        expect(headings.map(node => node.props.children)).toEqual(['독후감 2 · 2026. 11. 15.', '독후감 1 · 2026. 11. 1.']);
        expect(screen.getByLabelText('독후감 2, 2026년 11월 15일')).toBeOnTheScreen();
        expect(screen.getByLabelText('독후감 1, 2026년 11월 1일')).toBeOnTheScreen();
    });

    test('독후감을 고쳐도 번호와 날짜가 그대로이고, 지우면 남은 것끼리 다시 매겨요', async () => {
        save(1, null, '첫 독후감', kst(2026, 10, 1, 21, 0));
        save(2, null, '둘째 독후감', kst(2026, 10, 15, 8, 0));
        time = kst(2026, 10, 20, 9, 0);
        timed.reviews.updateReport(id(1), '고친 첫 독후감');
        const alert = jest.spyOn(Alert, 'alert');
        await renderRouter(routes, { initialUrl: base });
        expect(await screen.findByText('독후감 1 · 2026. 11. 1.')).toBeOnTheScreen();
        await fireEvent.press(screen.getByRole('button', { name: '독후감 고친 첫 독후감 삭제' }));
        const buttons = alert.mock.calls.at(-1)?.[2] as { text: string; onPress?: () => void }[];
        await act(async () => { buttons.find(item => item.text === '삭제')?.onPress?.(); });
        expect(screen.queryByText('고친 첫 독후감')).toBeNull();
        expect(screen.getAllByText(/^독후감 \d+ · /).map(node => node.props.children)).toEqual(['독후감 1 · 2026. 11. 15.']);
    });

    test('충돌한 독후감은 번호에서 빼요', async () => {
        save(1, null, '충돌한 독후감', kst(2026, 10, 1, 21, 0));
        save(2, null, '둘째 독후감', kst(2026, 10, 15, 8, 0));
        timed.reviews.markConflict(id(1));
        await renderRouter(routes, { initialUrl: base });
        expect(await screen.findByText('독후감 1 · 2026. 11. 15.')).toBeOnTheScreen();
        expect(screen.getAllByText(/^독후감 \d+ · /)).toHaveLength(1);
    });
});
