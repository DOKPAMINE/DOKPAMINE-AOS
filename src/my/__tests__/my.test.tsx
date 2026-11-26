import { preloadReactNative } from '../../__tests__/preloadReactNative';

import { router, Slot } from 'expo-router';
import { act, fireEvent, renderRouter, screen, within } from 'expo-router/testing-library';
import { Alert, AppState, Linking, StyleSheet, Text, type AppStateStatus } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import Storage from 'expo-sqlite/kv-store';
import { Camera } from 'expo-camera';
import * as Notifications from 'expo-notifications';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import RootLayout from '../../../app/_layout';
import My from '../../../app/(tabs)/my';
import Settings from '../../../app/settings';
import SettingsLayout from '../../../app/settings/_layout';
import OneLineWrite from '../../../app/book/[id]/review/one-line';
import ReportWrite from '../../../app/book/[id]/review/report';
import Consent from '../../../app/ranking/consent';
import Withdraw from '../../../app/ranking/withdraw';
import { me, patchMe } from '../../api/endpoints';
import { queryClient } from '../../api/queryClient';
import { initializeDatabase, prepareRecordDatabase } from '../../db/client';
import { createRecordRepository, type RecordRepository } from '../../db/repository';
import { memorySQLite } from '../../db/__tests__/sqliteAdapter';
import { subscribeSyncState } from '../../sync';
import type { BookRecord } from '../../db/schema';
import { reviewPreferences } from '../preferences';

// 첫 render가 react-native 컴포넌트 로딩을 떠안아 시간 제한을 넘지 않도록 파일 로딩 단계에서 불러온다(#103).
preloadReactNative();

jest.mock('expo-font', () => ({ ...jest.requireActual('expo-font'), isLoaded: () => true, loadAsync: jest.fn(), useFonts: () => [true, null] }));
jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: jest.fn(), hideAsync: jest.fn() }));
jest.mock('expo-secure-store', () => ({ setItemAsync: jest.fn(), getItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));
jest.mock('expo-sqlite/kv-store', () => ({ __esModule: true, default: { getItemSync: jest.fn(), setItemSync: jest.fn() } }));
jest.mock('expo-camera', () => ({ Camera: { getCameraPermissionsAsync: jest.fn(), requestCameraPermissionsAsync: jest.fn() } }));
jest.mock('expo-notifications', () => ({ getPermissionsAsync: jest.fn(), requestPermissionsAsync: jest.fn() }));
jest.mock('@react-native-community/netinfo', () => ({ __esModule: true, default: { fetch: jest.fn(), addEventListener: jest.fn(() => jest.fn()) } }));
jest.mock('../../api/endpoints', () => ({ me: jest.fn(), patchMe: jest.fn() }));
jest.mock('../../db/client', () => ({ ...jest.requireActual('../../db/client'), initializeDatabase: jest.fn(), prepareRecordAccount: jest.fn(async () => {}) }));
jest.mock('../../sync', () => ({ syncAfterLogin: jest.fn(), stopRecordSync: jest.fn(), getSyncState: jest.fn(() => ({ status: 'idle', failedCount: 0 })), subscribeSyncState: jest.fn(() => jest.fn()) }));

const bookId = '00000000-0000-4000-8000-000000000001';
const sessionId = '00000000-0000-4000-8000-000000000002';
const quoteId = '00000000-0000-4000-8000-000000000003';
const reviewId = '00000000-0000-4000-8000-000000000004';
const essayId = '00000000-0000-4000-8000-000000000005';
const novelIds = ['00000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000007'];
const hidden = { includeHiddenElements: true };
let sessionCount = 0;
/** 테스트에서 추가한 n번째(1부터) 세션 ID */
const nthSessionId = (n: number) => `00000000-0000-4000-8001-${String(n).padStart(12, '0')}`;
const account = { id: 'reader', username: 'reader_01', nickname: '책산책', rankingOptIn: false };
const stored = new Map<string, string>();
const preferences = new Map<string, string>();
const offlineMessage = '인터넷에 연결되어 있지 않아요. 연결되면 다시 시도해 주세요.';
const routes = {
    _layout: RootLayout,
    '(auth)/_layout': Slot,
    '(auth)/index': () => <Text>로그인 화면</Text>,
    '(tabs)/_layout': Slot,
    '(tabs)/index': () => <Text>홈 화면</Text>,
    '(tabs)/my': My,
    'settings/_layout': SettingsLayout,
    'settings/index': Settings,
    'ranking/_layout': Slot,
    'ranking/index': () => <Text>독서왕 랭킹 화면</Text>,
    'ranking/consent': Consent,
    'ranking/withdraw': Withdraw,
    'book/_layout': Slot,
    'book/[id]/review/one-line': OneLineWrite,
    'book/[id]/review/report': ReportWrite,
    'book/[id]/review/index': () => <Text>감상 목록</Text>,
    'book/[id]/edit': () => <Text>책 정보 수정 화면</Text>,
    'book/[id]/records/[recordId]': () => <Text>기록 수정 화면</Text>,
    'book-add': () => <Text>책 등록</Text>,
    'reading-start': () => <Text>독서 시작</Text>,
    lounge: () => <Text>라운지</Text>,
};
let memory: ReturnType<typeof memorySQLite>;
let repository: RecordRepository;
let activeCallbacks: ((state: AppStateStatus) => void)[];

function addBook(id: string, title: string, genre: BookRecord['genre'], completedAt: number | null = null) {
    repository.books.save({ id, title, author: `${title} 작가`, isbn: null, publisher: null, totalPages: 240, currentPage: 0, genre,
        status: completedAt === null ? 'READING' : 'DONE', coverUrl: null, sideCoverUrl: null, yes24ProductUrl: null, catalogPending: false,
        completedCount: completedAt === null ? 0 : 1, completedAt });
}
function addSession(id: string, startedAt: number, seconds: number) {
    repository.sessions.save({ id: nthSessionId(++sessionCount), bookId: id, startedAt, endedAt: startedAt + seconds * 1000,
        activeSeconds: seconds, startPage: 0, endPage: 10, source: 'MANUAL' });
}

beforeEach(async () => {
    jest.clearAllMocks();
    sessionCount = 0;
    stored.clear(); preferences.clear(); queryClient.clear();
    account.rankingOptIn = false;
    stored.set('dokpamine.accessToken', 'test-token');
    stored.set('dokpamine.authSession', JSON.stringify({ accessToken: 'test-token', expiresAt: '2099-01-01T00:00:00Z', userId: account.id }));
    stored.set('dokpamine.onboardingSeen', 'true');
    jest.mocked(SecureStore.getItemAsync).mockImplementation(async key => stored.get(key) ?? null);
    jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async key => { stored.delete(key); });
    jest.mocked(Storage.getItemSync).mockImplementation(key => preferences.get(key) ?? null);
    jest.mocked(Storage.setItemSync).mockImplementation((key, value) => { preferences.set(key, typeof value === 'function' ? value(preferences.get(key) ?? null) : value); });
    jest.mocked(NetInfo.fetch).mockResolvedValue({ isConnected: true, isInternetReachable: true } as NetInfoState);
    jest.mocked(me).mockImplementation(async () => ({ ...account }));
    jest.mocked(patchMe).mockImplementation(async body => { Object.assign(account, body); return { ...account }; });
    jest.mocked(Camera.getCameraPermissionsAsync).mockResolvedValue({ status: 'denied' } as Awaited<ReturnType<typeof Camera.getCameraPermissionsAsync>>);
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: 'undetermined' } as Awaited<ReturnType<typeof Notifications.getPermissionsAsync>>);
    activeCallbacks = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
        activeCallbacks.push(listener);
        return { remove: () => { activeCallbacks = activeCallbacks.filter(callback => callback !== listener); } };
    });
    memory = memorySQLite();
    const { db } = await prepareRecordDatabase(memory.sqlite);
    repository = createRecordRepository(db);
    repository.books.save({ id: bookId, title: '데미안', author: '헤르만 헤세', isbn: null, publisher: null,
        totalPages: 240, currentPage: 240, genre: '소설/시', status: 'DONE', coverUrl: null, sideCoverUrl: null, yes24ProductUrl: null, catalogPending: false, completedCount: 1, completedAt: Date.now() });
    repository.sessions.save({ id: sessionId, bookId, startedAt: Date.now(), endedAt: Date.now() + 5400000,
        activeSeconds: 5400, startPage: 0, endPage: 240, source: 'MANUAL' });
    jest.mocked(initializeDatabase).mockResolvedValue({ db, repository });
});
afterEach(() => { memory.connection.close(); queryClient.clear(); jest.restoreAllMocks(); });

test.each(['book', 'session'] as const)('NFR-04 S-80 거절된 %s의 안내와 저장된 입력의 수정 경로를 제공해요', async kind => {
    const row = kind === 'book' ? repository.books.get(bookId)! : repository.sessions.get(sessionId)!;
    repository.syncRejections.save({ key: `${kind}:${row.id}`, kind, recordId: row.id, bookId,
        localVersion: row.localVersion, message: '저장된 기록의 입력을 확인해 주세요.' });
    await renderRouter(routes, { initialUrl: '/my' });
    expect(await screen.findByText('저장된 기록의 입력을 확인해 주세요.')).toBeOnTheScreen();
    expect(screen.getByText('입력 내용을 보존했어요. 수정한 뒤 다시 동기화해요.')).toBeOnTheScreen();
    expect(within(screen.getByTestId('sync-issues')).getByRole('header', { name: '동기화를 확인해 주세요' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: `데미안 · ${kind === 'book' ? '책 정보 수정' : '기록 시간·쪽수 수정'}` }));
    expect(await screen.findByText(kind === 'book' ? '책 정보 수정 화면' : '기록 수정 화면')).toBeOnTheScreen();
    expect(screen).toHavePathname(kind === 'book' ? `/book/${bookId}/edit` : `/book/${bookId}/records/${sessionId}`);
});

test('FR-10 S-80 닉네임과 누적 기록(총 독서시간·읽은 책·완독)을 전체 기록과 맞게 보여 줘요', async () => {
    // 준비한 기록: 데미안(완독) 5400초에 더해, 작년에 읽은 미완독 책 600초와 삭제한 기록 900초를 둔다.
    addBook(essayId, '산책', '에세이');
    addSession(essayId, Date.parse('2025-03-01T12:00:00+09:00'), 600);
    addSession(essayId, Date.parse('2025-03-02T12:00:00+09:00'), 900);
    repository.sessions.softDelete(nthSessionId(2));
    await renderRouter(routes, { initialUrl: '/my' });
    expect(await screen.findByText('책산책님')).toBeOnTheScreen();
    expect(await screen.findByRole('header', { name: '지금까지' })).toBeOnTheScreen();
    expect(screen.getByLabelText('총 독서시간 1시간 40분')).toBeOnTheScreen();
    expect(screen.getByLabelText('읽은 책 2권')).toBeOnTheScreen();
    expect(screen.getByLabelText('완독 1권')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '설정' }));
    expect(await screen.findByRole('header', { name: '설정' })).toBeOnTheScreen();
});

test('FR-10 S-80 설정은 제목 오른쪽 아이콘 버튼(44dp 이상, 역할·라벨 "설정")으로 열고 글자 버튼은 없어요', async () => {
    await renderRouter(routes, { initialUrl: '/my' });
    await screen.findByRole('header', { name: '지금까지' });
    const settings = screen.getByRole('button', { name: '설정' });
    expect(settings).toBe(screen.getByTestId('my-settings'));
    expect(screen.queryByText('설정')).toBeNull();
    const style = StyleSheet.flatten(typeof settings.props.style === 'function' ? settings.props.style({ pressed: false }) : settings.props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
    expect(style.minWidth).toBeGreaterThanOrEqual(44);
    await fireEvent.press(settings);
    expect(await screen.findByRole('header', { name: '설정' })).toBeOnTheScreen();
    expect(screen).toHavePathname('/settings');
});

test('FR-10 S-80 닉네임과 연속 독서일은 한 카드에 있고 연속일은 한 요소로 읽으며 불꽃 아이콘은 숨겨요', async () => {
    await renderRouter(routes, { initialUrl: '/my' });
    // 닉네임 글자의 부모가 닉네임 카드다.
    const card = (await screen.findByText('책산책님')).parent!;
    const streak = within(card).getByTestId('streak');
    // 기본 기록: 오늘 5400초를 읽었다.
    expect(streak).toHaveProp('accessibilityLabel', '1일 연속 독서 중, 최고 기록 1일');
    expect(within(streak).getByText('1일 연속 독서 중')).toBeOnTheScreen();
    expect(within(streak).getByText('최고 기록 1일')).toBeOnTheScreen();
    const icon = screen.getByTestId('streak-icon', hidden);
    expect(icon).toHaveProp('accessibilityElementsHidden', true);
    expect(icon).toHaveProp('importantForAccessibility', 'no-hide-descendants');
});

test('FR-10 S-80 누적 숫자 3개는 각각 한 요소로 읽고 칸 사이에 구분선 2개가 있어요', async () => {
    await renderRouter(routes, { initialUrl: '/my' });
    await screen.findByRole('header', { name: '지금까지' });
    const card = screen.getByTestId('my-section-totals');
    expect(['총 독서시간 1시간 30분', '읽은 책 1권', '완독 1권'].map(label => within(card).getByLabelText(label))).toHaveLength(3);
    expect(within(card).getAllByTestId('summary-divider', hidden)).toHaveLength(2);
});

test('FR-10 S-80 "나의 독서" 카드 제목과 안쪽 칸 제목은 header 역할이고 지금까지 칸이 카드 안에 있어요', async () => {
    await renderRouter(routes, { initialUrl: '/my' });
    const reading = await screen.findByTestId('my-reading');
    expect(within(reading).getByRole('header', { name: '나의 독서' })).toBeOnTheScreen();
    expect(within(reading).getByRole('header', { name: '지금까지' })).toBeOnTheScreen();
    expect(within(reading).getByRole('header', { name: '장르별' })).toBeOnTheScreen();
    expect(within(within(reading).getByTestId('my-section-totals')).getByLabelText('총 독서시간 1시간 30분')).toBeOnTheScreen();
    expect(within(within(reading).getByTestId('my-section-genres')).getByLabelText('소설/시, 1권')).toBeOnTheScreen();
});

test('FR-10 S-80 "이번 달 독서" 카드와 "전송 대기"·"동기화 상태"는 보이지 않고 동기화 문제가 없으면 경고 카드도 없어요', async () => {
    // 삭제 전송 대기를 포함해 대기 기록(책·세션·문장 tombstone)이 있어도 대기 건수는 표시하지 않는다.
    repository.quotes.save({ id: quoteId, bookId, text: '문장', page: null, memo: null });
    repository.quotes.softDelete(quoteId);
    await renderRouter(routes, { initialUrl: '/my' });
    await screen.findByRole('header', { name: '지금까지' });
    expect(screen.queryByText('이번 달 독서')).toBeNull();
    expect(screen.queryByText(/전송 대기/)).toBeNull();
    expect(screen.queryByText('동기화 상태')).toBeNull();
    expect(screen.queryByTestId('sync-issues')).toBeNull();
    expect(screen.queryByText('240쪽')).toBeNull();
});

test('FR-10 NFR-04 S-80 감상 충돌이 있으면 경고 카드와 충돌 확인 버튼을 보여 주고 감상 목록을 열어요', async () => {
    repository.reviews.save({ id: reviewId, bookId, oneLine: null, body: '충돌한 독후감', visibility: 'PRIVATE', publishedAt: null });
    repository.reviews.markConflict(reviewId);
    await renderRouter(routes, { initialUrl: '/my' });
    const card = await screen.findByTestId('sync-issues');
    expect(within(card).getByRole('header', { name: '동기화를 확인해 주세요' })).toBeOnTheScreen();
    await fireEvent.press(within(card).getByRole('button', { name: '데미안 · 감상 충돌 확인' }));
    expect(await screen.findByText('감상 목록')).toBeOnTheScreen();
    expect(screen).toHavePathname(`/book/${bookId}/review`);
});

test('NFR-04 S-80 전송 상태 알림으로 다시 읽어 거절이 해결되면 경고 카드를 숨기고 새 기록도 반영해요', async () => {
    const row = repository.books.get(bookId)!;
    repository.syncRejections.save({ key: `book:${bookId}`, kind: 'book', recordId: bookId, bookId,
        localVersion: row.localVersion, message: '저장된 기록의 입력을 확인해 주세요.' });
    await renderRouter(routes, { initialUrl: '/my' });
    expect(await screen.findByTestId('sync-issues')).toBeOnTheScreen();
    await act(async () => {
        repository.syncRejections.clear(`book:${bookId}`);
        jest.mocked(subscribeSyncState).mock.calls.forEach(([listener]) => listener());
    });
    expect(screen.queryByTestId('sync-issues')).toBeNull();
    await act(async () => { addBook(essayId, '산책', '에세이'); addSession(essayId, Date.now() - 3600000, 600); });
    expect(screen.getByLabelText('읽은 책 2권')).toBeOnTheScreen();
    expect(screen.getByLabelText('총 독서시간 1시간 40분')).toBeOnTheScreen();
});

describe('FR-10 S-80 연속 독서일과 장르별 막대', () => {
    const today = Date.parse('2026-11-26T12:00:00+09:00');
    const day = (date: string) => Date.parse(`${date}T12:00:00+09:00`);
    beforeEach(() => {
        // 기본 기록(현재 시각의 세션)을 지우고 정해 둔 날짜의 기록만 남긴다. 오늘은 2026-11-26(KST)이다.
        repository.sessions.softDelete(sessionId);
        jest.spyOn(Date, 'now').mockReturnValue(today);
    });

    test('FR-10 S-80 11월 24·25일에 기록이 있고 오늘(26일) 기록이 없으면 "2일 연속"으로 표시돼요', async () => {
        addSession(bookId, day('2026-11-24'), 600);
        addSession(bookId, day('2026-11-25'), 600);
        await renderRouter(routes, { initialUrl: '/my' });
        expect(await screen.findByText('2일 연속 독서 중')).toBeOnTheScreen();
        expect(screen.getByTestId('streak')).toHaveProp('accessibilityLabel', '2일 연속 독서 중, 최고 기록 2일');
        expect(screen.queryByText('오늘 읽으면 1일째예요.')).toBeNull();
    });

    test('FR-10 S-80 11월 24일에만 기록이 있으면 연속 0일과 "오늘 읽으면 1일째예요"를 보여 줘요', async () => {
        addSession(bookId, day('2026-11-24'), 600);
        await renderRouter(routes, { initialUrl: '/my' });
        expect(await screen.findByText('연속 독서 0일')).toBeOnTheScreen();
        expect(screen.getByText('오늘 읽으면 1일째예요.')).toBeOnTheScreen();
        expect(screen.getByTestId('streak')).toHaveProp('accessibilityLabel', '연속 독서 0일, 최고 기록 1일, 오늘 읽으면 1일째예요.');
    });

    test('FR-10 S-80 최고 연속 기록은 전체 기간 중 가장 긴 연속 일수예요', async () => {
        ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-25', '2026-11-26']
            .forEach(date => addSession(bookId, day(date), 600));
        await renderRouter(routes, { initialUrl: '/my' });
        expect(await screen.findByText('2일 연속 독서 중')).toBeOnTheScreen();
        expect(screen.getByText('최고 기록 5일')).toBeOnTheScreen();
        expect(screen.getByTestId('streak')).toHaveProp('accessibilityLabel', '2일 연속 독서 중, 최고 기록 5일');
    });

    test('FR-10 S-80 소설 3권, 에세이 1권이면 소설 막대가 3배 길이로 먼저 보이고 막대는 보조 기술에서 숨겨요', async () => {
        // 데미안(소설/시)과 소설 2권, 에세이 1권. 같은 책을 두 번 읽어도 1권으로 센다.
        addBook(novelIds[0], '소설 둘', '소설/시');
        addBook(novelIds[1], '소설 셋', '소설/시');
        addBook(essayId, '산책', '에세이');
        [bookId, bookId, novelIds[0], novelIds[1], essayId].forEach((id, index) => addSession(id, day(`2026-11-1${index}`), 600));
        await renderRouter(routes, { initialUrl: '/my' });
        const rows = await screen.findAllByTestId('my-genre-row');
        expect(rows.map(row => row.props.accessibilityLabel)).toEqual(['소설/시, 3권', '에세이, 1권']);
        // "지금까지"와 "장르별"은 같은 "나의 독서" 카드 안의 서로 다른 칸이다.
        const reading = screen.getByTestId('my-reading');
        const totals = within(reading).getByTestId('my-section-totals');
        const genres = within(reading).getByTestId('my-section-genres');
        expect(totals).not.toBe(genres);
        expect(within(totals).getByRole('header', { name: '지금까지' })).toBeOnTheScreen();
        expect(within(totals).queryByTestId('my-genre-row')).toBeNull();
        expect(within(genres).getByRole('header', { name: '장르별' })).toBeOnTheScreen();
        expect(within(genres).getAllByTestId('my-genre-row')).toHaveLength(2);
        expect(within(rows[0]).getByText('3권')).toBeOnTheScreen();
        expect(within(rows[1]).getByText('1권')).toBeOnTheScreen();
        const widths = screen.getAllByTestId('my-genre-bar-fill', hidden)
            .map(fill => parseFloat(String(StyleSheet.flatten(fill.props.style).width)));
        expect(widths[0]).toBe(100);
        expect(widths[0] / widths[1]).toBeCloseTo(3);
        screen.getAllByTestId('my-genre-bar-track', hidden).forEach(track => {
            expect(track).toHaveProp('accessibilityElementsHidden', true);
            expect(track).toHaveProp('importantForAccessibility', 'no-hide-descendants');
        });
        expect(screen.queryAllByTestId('my-genre-bar-track')).toHaveLength(0);
    });

    test('FR-10 S-80 기록이 하나도 없으면 숫자 0과 "아직 독서 기록이 없어요." 안내를 보여 주고 막대가 없어요', async () => {
        repository.books.softDelete(bookId);
        await renderRouter(routes, { initialUrl: '/my' });
        expect(await screen.findByText('아직 독서 기록이 없어요.')).toBeOnTheScreen();
        expect(screen.getByLabelText('총 독서시간 0분')).toBeOnTheScreen();
        expect(screen.getByLabelText('읽은 책 0권')).toBeOnTheScreen();
        expect(screen.getByLabelText('완독 0권')).toBeOnTheScreen();
        expect(screen.queryAllByTestId('my-genre-row', hidden)).toHaveLength(0);
        expect(screen.queryByRole('header', { name: '장르별' })).toBeNull();
        // 빈 상태에서도 "나의 독서" 카드 안에 "지금까지" 칸과 안내가 있고 장르별 칸은 없다.
        const reading = screen.getByTestId('my-reading');
        expect(within(reading).getByTestId('my-section-totals')).toBeOnTheScreen();
        expect(within(reading).getByText('아직 독서 기록이 없어요.')).toBeOnTheScreen();
        expect(screen.queryByTestId('my-section-genres')).toBeNull();
        expect(screen.getByTestId('streak')).toHaveProp('accessibilityLabel', '연속 독서 0일, 최고 기록 0일, 오늘 읽으면 1일째예요.');
    });
});

test('FR-08 S-81 S-51 S-53 기본 공개 범위가 재진입 후 유지되고 감상이 없는 책의 새 감상에 적용돼요', async () => {
    const first = await renderRouter(routes, { initialUrl: '/settings' });
    expect(await screen.findByRole('radio', { name: '기본 비공개 · 나만 보기' })).toBeChecked();
    await fireEvent.press(screen.getByRole('radio', { name: '기본 공개' }));
    expect(reviewPreferences.load('reader')).toBe('PUBLIC');
    expect(reviewPreferences.load('other-reader')).toBe('PRIVATE');
    await first.unmount();
    await renderRouter(routes, { initialUrl: '/settings' });
    expect(await screen.findByRole('radio', { name: '기본 공개' })).toBeChecked();
    for (const [route, label] of [['one-line', '한줄평'], ['report', '독후감']] as const) {
        await act(async () => router.push(`/book/${bookId}/review/${route}`));
        expect(await screen.findByText(new RegExp(`^이 ${label}은 공개로 저장돼요\\.`))).toBeOnTheScreen();
        await fireEvent.changeText(screen.getByLabelText(label), '설정한 공개 범위로 저장해요.');
        await fireEvent.press(screen.getByRole('button', { name: `${label} 저장` }));
        await screen.findByText('감상 목록');
    }
    expect(repository.reviews.list()).toEqual([
        expect.objectContaining({ visibility: 'PUBLIC', syncPending: true }), expect.objectContaining({ visibility: 'PUBLIC', syncPending: true })]);
});

test('FR-08 S-81 공개 범위 저장 실패는 기존 선택과 기존 감상을 유지해요', async () => {
    await renderRouter(routes, { initialUrl: '/settings' });
    await screen.findByRole('radio', { name: '기본 비공개 · 나만 보기' });
    jest.mocked(Storage.setItemSync).mockImplementationOnce(() => { throw new Error('disk full'); });
    await fireEvent.press(screen.getByRole('radio', { name: '기본 공개' }));
    expect(screen.getByRole('radio', { name: '기본 비공개 · 나만 보기' })).toBeChecked();
    expect(screen.getByRole('alert')).toHaveTextContent(/기본 공개 범위를 저장하지 못했어요\./);
    expect(reviewPreferences.load('reader')).toBe('PRIVATE');
});

test.each([false, true])('FR-15 S-81 참여 상태=%s 스위치는 확인 화면을 열고 확인 후에만 변경해요', async participating => {
    account.rankingOptIn = participating;
    await renderRouter(routes, { initialUrl: '/settings' });
    await screen.findByText(participating ? '참여 중이에요' : '참여하지 않고 있어요');
    expect(screen.getByRole('switch', { name: '랭킹 참여' }).props.accessibilityState.checked).toBe(participating);
    await fireEvent(screen.getByRole('switch', { name: '랭킹 참여' }), 'valueChange', !participating);
    const confirm = participating ? '참여 중단하기' : '동의하고 참여하기';
    await screen.findByRole('button', { name: confirm });
    expect(patchMe).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: confirm }));
    // AOS#126: 확인 후에는 랭킹이 아니라 설정으로 돌아와 바뀐 참여 상태를 보여 준다.
    expect(await screen.findByText(participating ? '참여하지 않고 있어요' : '참여 중이에요')).toBeOnTheScreen();
    expect(screen).toHavePathname('/settings');
    expect(patchMe).toHaveBeenCalledWith({ rankingOptIn: !participating });
});

test.each(['consent', 'withdraw'])('FR-15 S-74 S-75 AOS#126 %s에서 설정으로 돌아가면 참여를 변경하지 않아요', async route => {
    await renderRouter(routes, { initialUrl: '/settings' });
    await screen.findByText('참여하지 않고 있어요');
    await act(async () => router.push(`/ranking/${route}`));
    await fireEvent.press(await screen.findByRole('button', { name: '설정으로 돌아가기' }));
    expect(await screen.findByText('참여하지 않고 있어요')).toBeOnTheScreen();
    expect(screen).toHavePathname('/settings');
    expect(patchMe).not.toHaveBeenCalled();
});

test('NFR-06 S-81 오프라인 스위치는 1초 안에 안내하고 참여 요청과 화면 이동을 막아요', async () => {
    await renderRouter(routes, { initialUrl: '/settings' });
    await screen.findByText('참여하지 않고 있어요');
    jest.mocked(NetInfo.fetch).mockImplementation(() => new Promise(() => {}));
    await fireEvent(screen.getByRole('switch', { name: '랭킹 참여' }), 'valueChange', true);
    expect(await screen.findByText(offlineMessage, {}, { timeout: 900 })).toBeOnTheScreen();
    expect(screen).toHavePathname('/settings');
    expect(patchMe).not.toHaveBeenCalled();
});

test('NFR-04 NFR-06 S-80 오프라인 재진입도 저장한 닉네임과 로컬 통계를 보여 줘요', async () => {
    const first = await renderRouter(routes, { initialUrl: '/my' });
    await screen.findByText('책산책님');
    await first.unmount();
    jest.mocked(me).mockClear();
    jest.mocked(NetInfo.fetch).mockResolvedValue({ isConnected: false } as NetInfoState);
    await renderRouter(routes, { initialUrl: '/my' });
    expect(await screen.findByText(offlineMessage)).toBeOnTheScreen();
    expect(screen.getByText('책산책님')).toBeOnTheScreen();
    expect(screen.getByLabelText('총 독서시간 1시간 30분')).toBeOnTheScreen();
    expect(me).not.toHaveBeenCalled();
});

test('NFR-07 NFR-08 S-81 권한 조회만 하고 시스템 설정에서 돌아오면 상태를 갱신해요', async () => {
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    await renderRouter(routes, { initialUrl: '/settings' });
    expect(await screen.findByText('카메라 · 거절됨')).toBeOnTheScreen();
    expect(screen.getByText('알림 · 아직 요청하지 않음')).toBeOnTheScreen();
    expect(Camera.requestCameraPermissionsAsync).not.toHaveBeenCalled();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: '시스템 설정 열기' }));
    expect(openSettings).toHaveBeenCalledTimes(1);
    jest.mocked(Camera.getCameraPermissionsAsync).mockResolvedValue({ status: 'granted' } as Awaited<ReturnType<typeof Camera.getCameraPermissionsAsync>>);
    await act(async () => { activeCallbacks.forEach(callback => callback('active')); });
    expect(await screen.findByText('카메라 · 허용됨')).toBeOnTheScreen();
});

test('FR-10 S-81 로그아웃 취소는 설정을 유지하고 확인하면 기록을 보존하며 인증 화면을 열어요', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    await renderRouter(routes, { initialUrl: '/settings' });
    await screen.findByRole('radio', { name: '기본 비공개 · 나만 보기' });
    await fireEvent.press(screen.getByRole('button', { name: '로그아웃' }));
    expect(stored.has('dokpamine.accessToken')).toBe(true);
    await act(async () => { alert.mock.calls[0][2]?.find(button => button.text === '취소')?.onPress?.(); });
    expect(screen).toHavePathname('/settings');
    await fireEvent.press(screen.getByRole('button', { name: '로그아웃' }));
    await act(async () => { alert.mock.calls[1][2]?.find(button => button.text === '로그아웃')?.onPress?.(); });
    expect(await screen.findByText('로그인 화면')).toBeOnTheScreen();
    expect(stored.has('dokpamine.accessToken')).toBe(false);
    expect(stored.has('dokpamine.authSession')).toBe(false);
    expect(repository.sessions.list()).toHaveLength(1);
    expect(repository.sessions.list()[0].syncPending).toBe(true);
});

test('NFR-04 S-80 저장소 오류는 재시도 후 로컬 요약을 표시해요', async () => {
    jest.spyOn(repository.books, 'list').mockImplementationOnce(() => { throw new Error('read failed'); });
    await renderRouter(routes, { initialUrl: '/my' });
    await screen.findByRole('alert');
    await fireEvent.press(screen.getByRole('button', { name: '다시 시도해 주세요' }));
    expect(await screen.findByLabelText('총 독서시간 1시간 30분')).toBeOnTheScreen();
});
