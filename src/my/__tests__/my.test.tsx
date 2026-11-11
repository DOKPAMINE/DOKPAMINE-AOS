import { router, Slot } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { Alert, AppState, Linking, Text, type AppStateStatus } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import Storage from 'expo-sqlite/kv-store';
import { Camera } from 'expo-camera';
import * as Notifications from 'expo-notifications';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import RootLayout from '../../../app/_layout';
import My from '../../../app/(tabs)/my';
import Settings from '../../../app/settings';
import SettingsLayout from '../../../app/settings/_layout';
import ReviewWrite from '../../../app/book/[id]/review/write';
import Consent from '../../../app/ranking/consent';
import Withdraw from '../../../app/ranking/withdraw';
import { me, patchMe } from '../../api/endpoints';
import { queryClient } from '../../api/queryClient';
import { initializeDatabase, prepareRecordDatabase } from '../../db/client';
import { createRecordRepository, type RecordRepository } from '../../db/repository';
import { memorySQLite } from '../../db/__tests__/sqliteAdapter';
import { monthlyStats, calendarDuration } from '../../domain/calendarRules';
import { kstDate } from '../../domain/kstDate';
import { subscribeSyncState } from '../../sync';
import { reviewPreferences } from '../preferences';

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
jest.mock('../../sync', () => ({ syncAfterLogin: jest.fn(), stopRecordSync: jest.fn(), subscribeSyncState: jest.fn(() => jest.fn()) }));

const bookId = '00000000-0000-4000-8000-000000000001';
const sessionId = '00000000-0000-4000-8000-000000000002';
const quoteId = '00000000-0000-4000-8000-000000000003';
const account = { id: 'reader', email: 'reader@example.test', nickname: '책산책', rankingOptIn: false };
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
    'book/[id]/review/write': ReviewWrite,
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

beforeEach(async () => {
    jest.clearAllMocks();
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
        totalPages: 240, currentPage: 240, genre: '소설', status: 'DONE', coverUrl: null, completedCount: 1, completedAt: Date.now() });
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
    await fireEvent.press(screen.getByRole('button', { name: `데미안 · ${kind === 'book' ? '책 정보 수정' : '기록 시간·쪽수 수정'}` }));
    expect(await screen.findByText(kind === 'book' ? '책 정보 수정 화면' : '기록 수정 화면')).toBeOnTheScreen();
    expect(screen).toHavePathname(kind === 'book' ? `/book/${bookId}/edit` : `/book/${bookId}/records/${sessionId}`);
});

test('FR-10 S-80 닉네임과 monthlyStats 요약이 일치하고 삭제 전송 대기도 세어요', async () => {
    repository.quotes.save({ id: quoteId, bookId, text: '문장', page: null, memo: null });
    repository.quotes.softDelete(quoteId);
    const stats = monthlyStats(repository.sessions.list(), repository.books.list(), kstDate(Date.now()).slice(0, 7));
    await renderRouter(routes, { initialUrl: '/my' });
    expect(await screen.findByText('책산책님')).toBeOnTheScreen();
    expect(await screen.findByText(calendarDuration(stats.totalSeconds))).toBeOnTheScreen();
    expect(screen.getByText(`${stats.totalPages}쪽`)).toBeOnTheScreen();
    expect(screen.getByText(`${stats.completedBooks}권`)).toBeOnTheScreen();
    expect(screen.getByText('전송 대기 3건')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '설정' }));
    expect(await screen.findByRole('header', { name: '설정' })).toBeOnTheScreen();
});

test('NFR-04 S-80 전송 완료 알림으로 대기 건수를 다시 읽고 새 기록도 반영해요', async () => {
    await renderRouter(routes, { initialUrl: '/my' });
    expect(await screen.findByText('전송 대기 2건')).toBeOnTheScreen();
    await act(async () => {
        for (const entity of [repository.books, repository.sessions]) for (const row of entity.list()) entity.markSynced(row.id, row.localVersion);
        jest.mocked(subscribeSyncState).mock.calls.at(-1)?.[0]();
    });
    expect(screen.getByText('전송 대기 0건')).toBeOnTheScreen();
    await act(async () => { repository.quotes.save({ id: quoteId, bookId, text: '추가 문장', page: null, memo: null }); });
    expect(screen.getByText('전송 대기 1건')).toBeOnTheScreen();
});

test('FR-08 S-81 S-51 기본 공개 범위가 재진입 후 유지되고 새 감상에 적용돼요', async () => {
    const first = await renderRouter(routes, { initialUrl: '/settings' });
    expect(await screen.findByRole('radio', { name: '기본 비공개 · 나만 보기' })).toBeChecked();
    await fireEvent.press(screen.getByRole('radio', { name: '기본 공개' }));
    expect(reviewPreferences.load('reader')).toBe('PUBLIC');
    expect(reviewPreferences.load('other-reader')).toBe('PRIVATE');
    await first.unmount();
    await renderRouter(routes, { initialUrl: '/settings' });
    expect(await screen.findByRole('radio', { name: '기본 공개' })).toBeChecked();
    await act(async () => router.push(`/book/${bookId}/review/write`));
    expect(await screen.findByRole('radio', { name: '공개' })).toBeChecked();
    await fireEvent.changeText(screen.getByLabelText('한줄평'), '설정한 공개 범위로 저장해요.');
    await fireEvent.press(screen.getByRole('button', { name: '감상 저장' }));
    await screen.findByText('감상 목록');
    expect(repository.reviews.list()[0]).toMatchObject({ visibility: 'PUBLIC', syncPending: true });
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
    expect(await screen.findByText('독서왕 랭킹 화면')).toBeOnTheScreen();
    expect(patchMe).toHaveBeenCalledWith({ rankingOptIn: !participating });
    await act(async () => router.dismissTo('/settings'));
    expect(await screen.findByText(participating ? '참여하지 않고 있어요' : '참여 중이에요')).toBeOnTheScreen();
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
    expect(screen.getByText('240쪽')).toBeOnTheScreen();
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
    expect(await screen.findByText('240쪽')).toBeOnTheScreen();
});
