import NetInfo from '@react-native-community/netinfo';
import { AppState, type AppStateStatus } from 'react-native';
import * as endpoints from '../../api/endpoints';
import type { RecordRepository } from '../../db/repository';
import { createSyncEngine } from '../engine';
import { startRecordSync, stopRecordSync, syncAfterLogin } from '../runtime';

jest.mock('@react-native-community/netinfo', () => ({ __esModule: true, default: { addEventListener: jest.fn() } }));
jest.mock('../engine', () => ({ createSyncEngine: jest.fn() }));

const sync = jest.fn().mockResolvedValue(undefined);
const afterLogin = jest.fn().mockResolvedValue(undefined);
const stop = jest.fn();
const networkRemove = jest.fn();
const appRemove = jest.fn();
const recordRemove = jest.fn();
const subscribe = jest.fn((_listener: () => void) => recordRemove);
const records = { subscribe } as unknown as RecordRepository;
let networkChange: (state: { isConnected: boolean; isInternetReachable: boolean | null }) => void;
let appChange: (state: AppStateStatus) => void;
const tick = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(createSyncEngine).mockReturnValue({ sync, afterLogin, stop, getState: () => ({ status: 'idle', failedCount: 0 }), subscribe: () => jest.fn() });
    jest.mocked(NetInfo.addEventListener).mockImplementation(listener => { networkChange = listener as typeof networkChange; return networkRemove; });
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => { appChange = listener; return { remove: appRemove }; });
});
afterEach(() => { stopRecordSync(); jest.restoreAllMocks(); });

test('NFR-05·06 S-80 앱 활성화·연결 복구·개인 기록 저장 시 전송을 예약해요', async () => {
    startRecordSync(records, 'test-token');
    await tick();
    expect(afterLogin).toHaveBeenCalledTimes(1);
    networkChange({ isConnected: false, isInternetReachable: false });
    await tick();
    expect(sync).not.toHaveBeenCalled();
    networkChange({ isConnected: true, isInternetReachable: true });
    await tick();
    expect(sync).toHaveBeenCalledTimes(1);
    networkChange({ isConnected: true, isInternetReachable: true });
    appChange('background');
    await tick();
    expect(sync).toHaveBeenCalledTimes(1);
    appChange('active');
    await tick();
    expect(sync).toHaveBeenCalledTimes(2);
    subscribe.mock.calls[0][0]();
    await tick();
    expect(sync).toHaveBeenCalledTimes(3);
});

test('NFR-05 S-02 로그인 토큰 저장 후 복원을 요청하고 로그아웃에서 구독을 해제해요', async () => {
    startRecordSync(records, 'test-token');
    await tick();
    startRecordSync(records, 'test-token');
    expect(NetInfo.addEventListener).toHaveBeenCalledTimes(1);
    await syncAfterLogin(records, 'test-token');
    expect(afterLogin).toHaveBeenCalledTimes(1);
    stopRecordSync();
    expect(networkRemove).toHaveBeenCalledTimes(1);
    expect(appRemove).toHaveBeenCalledTimes(1);
    expect(recordRemove).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(1);
    // 같은 앱에서 재로그인하면 같은 저장소에 새 엔진과 이벤트 구독을 연결한다.
    await syncAfterLogin(records, 'new-token');
    expect(createSyncEngine).toHaveBeenCalledTimes(2);
    expect(afterLogin).toHaveBeenCalledTimes(2);
});

test('NFR-05 S-02 로그인 전에는 기기 대기 기록을 서버로 전송하지 않아요', async () => {
    expect(() => startRecordSync(records, '')).toThrow('로그인이 필요해요.');
    await tick();
    expect(sync).not.toHaveBeenCalled();
    expect(afterLogin).not.toHaveBeenCalled();
});

test('FR-10 NFR-05 S-02 계정 전환은 이전 토큰에 고정한 요청을 취소하고 새 엔진을 만들어요', async () => {
    startRecordSync(records, 'account-a-token');
    const transportA = jest.mocked(createSyncEngine).mock.calls[0][1];
    // 전송 함수가 API 경계에 넘기는 토큰과 취소 신호를 검사한다.
    const api = jest.spyOn(endpoints, 'syncSnapshot').mockResolvedValue({ books: [], sessions: [], reviews: [], quotes: [] });
    await transportA.snapshot();
    const options = api.mock.calls[0][0] as { accessToken: string; signal: AbortSignal };
    expect(options.accessToken).toBe('account-a-token');
    startRecordSync(records, 'account-b-token');
    expect(options.signal.aborted).toBe(true);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(afterLogin).toHaveBeenCalledTimes(2);
});
