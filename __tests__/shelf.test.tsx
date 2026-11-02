import { Alert, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { act } from '@testing-library/react-native';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import ShelfScreen from '../app/(tabs)/shelf';
import BookDetailScreen from '../app/book/[id]/index';
import BookEditScreen from '../app/book/[id]/edit';
import BookLayout from '../app/book/_layout';
import RootLayout from '../app/_layout';
import AuthLayout from '../app/(auth)/_layout';
import TabLayout from '../app/(tabs)/_layout';
import { useAuth } from '../src/auth/AuthProvider';
import { queryClient } from '../src/api/queryClient';
import { initializeDatabase, prepareRecordDatabase } from '../src/db/client';
import { createRecordRepository, type RecordRepository, type SaveInput } from '../src/db/repository';
import type { BookRecord } from '../src/db/schema';
import { memorySQLite } from '../src/db/__tests__/sqliteAdapter';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));
jest.mock('../src/db/client', () => ({ ...jest.requireActual('../src/db/client'), initializeDatabase: jest.fn() }));
jest.mock('../src/sync/runtime', () => ({ startRecordSync: jest.fn() }));
jest.mock('../src/sync', () => ({ syncAfterLogin: jest.fn(), stopRecordSync: jest.fn() }));
jest.mock('../src/auth/AuthProvider', () => ({ AuthProvider: ({ children }: PropsWithChildren) => children, useAuth: jest.fn() }));
jest.mock('@react-native-community/netinfo', () => ({ __esModule: true, default: { addEventListener: jest.fn(() => jest.fn()) } }));
jest.mock('expo-font', () => ({ ...jest.requireActual('expo-font'), isLoaded: () => true, loadAsync: jest.fn(), useFonts: () => [true, null] }));
jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: jest.fn(), hideAsync: jest.fn() }));

const id = '00000000-0000-4000-8000-000000000001';
const sessionId = '00000000-0000-4000-8000-000000000002';
const reviewId = '00000000-0000-4000-8000-000000000003';
const book: SaveInput<BookRecord> = { id, title: '데미안', author: '헤르만 헤세', isbn: null, publisher: null, totalPages: 240, currentPage: 84, genre: '소설', status: 'READING', coverUrl: null, completedCount: 0, completedAt: null };
function ReadingStartTarget() {
    const { bookId } = useLocalSearchParams<{ bookId: string }>();
    return <Text>독서 시작 연결: {bookId}</Text>;
}
const routes = { shelf: ShelfScreen, 'book/_layout': BookLayout, 'book/[id]/index': BookDetailScreen, 'book/[id]/edit': BookEditScreen, 'reading-start': ReadingStartTarget };
// 인증 상태만 대체하고 루트의 실제 Protected 등록과 book 중첩 스택을 함께 검증한다.
function protectedRoutes() {
    return { _layout: RootLayout,
        '(auth)/_layout': AuthLayout, '(auth)/index': () => <Text>로그인이 필요해요.</Text>,
        '(auth)/login': () => <Text>로그인</Text>, '(auth)/signup': () => <Text>회원가입</Text>, '(auth)/onboarding': () => <Text>사용법 안내</Text>,
        '(tabs)/_layout': TabLayout, '(tabs)/index': () => <Text>인증된 홈</Text>, '(tabs)/shelf': ShelfScreen,
        '(tabs)/calendar': () => <Text>캘린더</Text>, '(tabs)/lounge': () => <Text>라운지</Text>, '(tabs)/my': () => <Text>마이</Text>,
        'book-add/index': () => <Text>책 등록</Text>,
        'book/_layout': BookLayout, 'book/[id]/index': BookDetailScreen, 'book/[id]/edit': BookEditScreen };
}
let memory: ReturnType<typeof memorySQLite>;
let repository: RecordRepository;

beforeEach(async () => {
    memory = memorySQLite();
    const { db } = await prepareRecordDatabase(memory.sqlite);
    repository = createRecordRepository(db, () => 100000);
    jest.mocked(initializeDatabase).mockResolvedValue({ db, repository });
    jest.mocked(useAuth).mockReturnValue({ status: 'signedOut', retry: jest.fn(), recoverSession: jest.fn(), completeOnboarding: jest.fn(), signIn: jest.fn(), signOut: jest.fn() });
});
afterEach(() => { memory.connection.close(); queryClient.clear(); jest.restoreAllMocks(); });

test.each(['', '/edit'])('FR-10 S-31 S-34 로그아웃 상태의 책 딥링크 %s는 Protected 가드가 차단해요', async suffix => {
    repository.books.save(book);
    const get = jest.spyOn(repository.books, 'get');
    await renderRouter(protectedRoutes(), { initialUrl: `/book/${id}${suffix}` });
    expect(await screen.findByText('로그인이 필요해요.')).toBeOnTheScreen();
    expect(screen).toHaveSegments(['(auth)']);
    expect(screen.queryByRole('button', { name: '정보 편집' })).toBeNull();
    expect(screen.queryByRole('button', { name: '저장' })).toBeNull();
    expect(get).not.toHaveBeenCalled();
});

test('FR-10 S-31 로그인 상태는 같은 Protected 가드 안에서 책 상세를 열 수 있어요', async () => {
    repository.books.save(book);
    jest.mocked(useAuth).mockReturnValue({ ...useAuth(), status: 'signedIn' });
    await renderRouter(protectedRoutes(), { initialUrl: `/book/${id}` });
    expect(await screen.findByRole('header', { name: '데미안' })).toBeOnTheScreen();
    expect(screen).toHavePathname(`/book/${id}`);
});

test('FR-04 S-30 빈 책장은 홈 등록 안내를 보여 줘요', async () => {
    await renderRouter(routes, { initialUrl: '/shelf' });
    expect(await screen.findByText('아직 책장에 책이 없어요. 홈에서 읽는 책이나 읽고 싶은 책을 등록해 주세요.')).toBeOnTheScreen();
});

test('FR-04 S-30 여러 장르의 책등은 고정 장르 순서와 세 종류 상태 라벨을 보여 줘요', async () => {
    repository.books.save({ ...book, genre: '과학', status: 'DONE' });
    repository.books.save({ ...book, id: sessionId, title: '읽고 싶은 소설', status: 'WANT' });
    repository.books.save({ ...book, id: reviewId, title: '읽는 소설' });
    await renderRouter(routes, { initialUrl: '/shelf' });
    await screen.findByRole('header', { name: '소설 · 2권' });
    const headings = screen.getAllByRole('header');
    expect(headings).toHaveLength(3);
    expect(headings[1]).toHaveTextContent('소설 · 2권');
    expect(headings[2]).toHaveTextContent('과학 · 1권');
    expect(screen.getByText('읽고 싶은 책')).toBeOnTheScreen();
    expect(screen.getByText('읽는 중')).toBeOnTheScreen();
    expect(screen.getByText('완독')).toBeOnTheScreen();
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
    await waitFor(() => expect(repository.books.get(id)).toMatchObject({ status: 'READING', currentPage: 84, completedCount: 1, completedAt: 100, syncPending: true, localVersion: first.localVersion + 1 }));
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

test.each(['저장', '취소'])('FR-04 S-34 편집 %s 뒤 Android 뒤로 이동은 중복 상세 없이 책장으로 돌아가요', async action => {
    repository.books.save(book);
    await renderRouter(routes, { initialUrl: '/shelf' });
    await fireEvent.press(await screen.findByRole('button', { name: '데미안, 헤르만 헤세, 읽는 중, 책 상세 보기' }));
    await fireEvent.press(await screen.findByRole('button', { name: '정보 편집' }));
    await fireEvent.press(await screen.findByRole('button', { name: action }));
    expect(await screen.findByRole('header', { name: '데미안' })).toBeOnTheScreen();
    await act(async () => router.back());
    expect(screen).toHavePathname('/shelf');
    expect(await screen.findByRole('header', { name: '책장' })).toBeOnTheScreen();
});

test.each(['책장으로', '삭제'])('FR-04 D-01 S-31 %s 이동은 기존 책장으로 돌아가고 중복 탭을 남기지 않아요', async action => {
    repository.books.save(book);
    const alert = jest.spyOn(Alert, 'alert');
    await renderRouter(routes, { initialUrl: '/shelf' });
    await fireEvent.press(await screen.findByRole('button', { name: '데미안, 헤르만 헤세, 읽는 중, 책 상세 보기' }));
    if (action === '삭제') {
        await fireEvent.press(await screen.findByRole('button', { name: '데미안 책 삭제' }));
        await act(async () => { alert.mock.calls[0][2]?.find(button => button.text === '삭제')?.onPress?.(); });
    } else {
        await fireEvent.press(await screen.findByRole('button', { name: '책장으로' }));
    }
    expect(screen).toHavePathname('/shelf');
    expect(await screen.findByRole('header', { name: '책장' })).toBeOnTheScreen();
    expect(router.canGoBack()).toBe(false);
});

test('FR-01 D7 S-34 완독 책 전체 쪽수 증가는 안내하고 지난 쪽과 완독 날짜를 보존해요', async () => {
    repository.books.save({ ...book, status: 'DONE', currentPage: 240, completedAt: 100, completedCount: 1 });
    await renderRouter(routes, { initialUrl: `/book/${id}/edit` });
    await fireEvent.changeText(await screen.findByLabelText('전체 쪽수'), '300');
    await fireEvent.press(screen.getByRole('button', { name: '저장' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/다시 읽기를 시작한 뒤 편집/);
    expect(repository.books.get(id)).toMatchObject({ totalPages: 240, currentPage: 240, status: 'DONE', completedAt: 100, completedCount: 1 });
});

test('FR-01 S-34 복원된 완독 책의 현재 쪽이 전체보다 작아도 제목 편집은 저장해요', async () => {
    repository.books.save({ ...book, status: 'DONE', completedAt: 100, completedCount: 1 });
    await renderRouter(routes, { initialUrl: `/book/${id}/edit` });
    await fireEvent.changeText(await screen.findByLabelText('제목'), '복원한 책 제목');
    await fireEvent.press(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByRole('header', { name: '복원한 책 제목' })).toBeOnTheScreen();
    expect(repository.books.get(id)).toMatchObject({ title: '복원한 책 제목', status: 'DONE', currentPage: 84, totalPages: 240, completedAt: 100, completedCount: 1 });
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
