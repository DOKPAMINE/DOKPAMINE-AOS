import { Alert, Text } from 'react-native';
import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import ReviewList from '../../../app/book/[id]/review';
import QuoteWrite from '../../../app/book/[id]/review/quote';
import OneLineWrite from '../../../app/book/[id]/review/one-line';
import ReportWrite from '../../../app/book/[id]/review/report';
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
        totalPages: 240, currentPage: 84, genre: '소설/시', status: 'READING', coverUrl: null, sideCoverUrl: null, yes24ProductUrl: null, completedCount: 0, completedAt: null });
    jest.mocked(initializeDatabase).mockResolvedValue({ db, repository });
});
afterEach(() => { memory.connection.close(); jest.restoreAllMocks(); });

test('#75 FR-07 S-50 빈 목록에서 한줄평·독후감·문장 작성으로 각각 진입할 수 있어요', async () => {
    await renderRouter(routes, { initialUrl: base });
    expect(await screen.findByText('아직 한줄평이 없어요. 이 책을 한마디로 남겨 주세요.')).toBeOnTheScreen();
    expect(screen.getByText('아직 독후감이 없어요. 책을 읽고 느낀 점을 남겨 주세요.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '문장 추가' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '한줄평 수정' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: '한줄평 쓰기' }));
    expect(await screen.findByRole('radio', { name: '비공개 · 나만 보기' })).toBeChecked();
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
] as const)('FR-07 S-51 %s 길이 오류는 저장을 막고 수정 후 저장할 수 있어요', async (label, button, limit, message) => {
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
])('FR-07 D-03 S-51 S-52 %s 중 닫기를 취소하면 내용을 유지하고 확인하면 버려요', async (button, label) => {
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

test('FR-07 D-03 S-51 Android 뒤로 이동도 작성 중 확인하고 빈 작성은 바로 닫혀요', async () => {
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

test.each([['one-line', '한줄평'], ['report', '독후감']])('NFR-04 S-51 %s 저장 실패 시 내용을 보존하고 재시도해 한 번만 저장해요', async (route, label) => {
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

test('#75 FR-08 S-51 한줄평 쓰기 화면은 한줄평 칸 하나만 두고 고른 공개 범위로 한줄평 하나를 만들어요', async () => {
    await renderRouter(routes, { initialUrl: `${base}/one-line` });
    expect(await screen.findByText('한줄평 쓰기')).toBeOnTheScreen();
    expect(screen.queryByLabelText('독후감')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('한줄평'), '처음 남기는 한줄평');
    await fireEvent.press(screen.getByRole('radio', { name: '공개' }));
    await fireEvent.press(screen.getByRole('button', { name: '한줄평 저장' }));
    expect(await screen.findByText('처음 남기는 한줄평')).toBeOnTheScreen();
    expect(repository.reviews.list({ bookId })).toEqual([
        expect.objectContaining({ oneLine: '처음 남기는 한줄평', body: null, visibility: 'PUBLIC', syncPending: true })]);
});

test('#75 S-51 한줄평 수정은 기존 한줄평을 채워 열고 같은 감상을 고쳐요', async () => {
    const id = '00000000-0000-4000-8000-000000000006';
    repository.reviews.save({ id, bookId, oneLine: '기존 한줄평', body: null, visibility: 'PUBLIC', publishedAt: null });
    await renderRouter(routes, { initialUrl: `${base}/one-line` });
    expect(await screen.findByText('한줄평 수정')).toBeOnTheScreen();
    expect(screen.getByLabelText('한줄평')).toHaveDisplayValue('기존 한줄평');
    expect(screen.getByRole('radio', { name: '공개' })).toBeChecked();
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

test.each([
    ['', '한줄평은 비울 수 없어요. 남길 한줄평을 입력해 주세요.'],
    ['기존 한줄평', '바뀐 내용이 없어요. 한줄평이나 공개 범위를 고친 뒤 저장해 주세요.'],
])('#75 S-51 한줄평을 "%s"로 저장하면 막고 안내해요', async (text, message) => {
    const id = '00000000-0000-4000-8000-000000000007';
    const before = repository.reviews.save({ id, bookId, oneLine: '기존 한줄평', body: null, visibility: 'PRIVATE', publishedAt: null });
    await renderRouter(routes, { initialUrl: `${base}/one-line` });
    await fireEvent.changeText(await screen.findByLabelText('한줄평'), text);
    await fireEvent.press(screen.getByRole('button', { name: '한줄평 저장' }));
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(repository.reviews.get(id)).toEqual(before);
});

test('#75 FR-08 S-51 독후감 쓰기 화면은 독후감 칸 하나만 두고 저장할 때마다 한줄평을 건드리지 않고 새로 쌓아요', async () => {
    const oneLineId = '00000000-0000-4000-8000-000000000008';
    const oneLine = repository.reviews.save({ id: oneLineId, bookId, oneLine: '기존 한줄평', body: null, visibility: 'PRIVATE', publishedAt: null });
    await renderRouter(routes, { initialUrl: `${base}/report` });
    for (const [body, visibility] of [['첫 독후감', 'PRIVATE'], ['둘째 독후감', 'PUBLIC']] as const) {
        if (body !== '첫 독후감') await act(async () => router.push(`${base}/report`));
        await fireEvent.changeText(await screen.findByLabelText('독후감'), body);
        expect(screen.queryByLabelText('한줄평')).toBeNull();
        if (visibility === 'PUBLIC') await fireEvent.press(screen.getByRole('radio', { name: '공개' }));
        await fireEvent.press(screen.getByRole('button', { name: '독후감 저장' }));
        expect(await screen.findByText(body)).toBeOnTheScreen();
    }
    expect(repository.reviews.get(oneLineId)).toEqual(oneLine);
    const reports = repository.reviews.list({ bookId }).filter(review => review.body);
    expect(reports.map(({ oneLine: line, body, visibility }) => ({ line, body, visibility })).sort((a, b) => a.body!.localeCompare(b.body!)))
        .toEqual([{ line: null, body: '둘째 독후감', visibility: 'PUBLIC' }, { line: null, body: '첫 독후감', visibility: 'PRIVATE' }]);
});
