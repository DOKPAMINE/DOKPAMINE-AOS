import { Text } from 'react-native';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { BookDetailScreen } from '../BookDetailScreen';
import { BookEditScreen } from '../BookEditScreen';
import { initializeDatabase, prepareRecordDatabase } from '../../db/client';
import type { RecordRepository } from '../../db/repository';
import { memorySQLite } from '../../db/__tests__/sqliteAdapter';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));
jest.mock('../../db/client', () => ({ ...jest.requireActual('../../db/client'), initializeDatabase: jest.fn() }));
jest.mock('../../sync/runtime', () => ({ startRecordSync: jest.fn() }));
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
    repository.books.save({ id, title: '데미안', author: '헤세', isbn: null, publisher: null, coverUrl: null,
        genre: '소설', status: 'READING', totalPages: 240, currentPage: 84, completedCount: 0, completedAt: null });
});
afterEach(() => { memory.connection.close(); });

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
