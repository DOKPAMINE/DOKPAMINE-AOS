import NetInfo from '@react-native-community/netinfo';
import { AppState, type AppStateStatus } from 'react-native';
import { tokenStorage } from '../../api/tokenStorage';
import type { RecordRepository } from '../../db/repository';
import { createSyncEngine } from '../engine';
import { startRecordSync, stopRecordSync, syncAfterLogin } from '../runtime';

jest.mock('@react-native-community/netinfo', () => ({ __esModule: true, default: { addEventListener: jest.fn() } }));
jest.mock('../../api/tokenStorage', () => ({ tokenStorage: { get: jest.fn() } }));
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
    jest.mocked(tokenStorage.get).mockResolvedValue('test-token');
    jest.mocked(createSyncEngine).mockReturnValue({ sync, afterLogin, stop, getState: () => ({ status: 'idle', failedCount: 0 }), subscribe: () => jest.fn() });
    jest.mocked(NetInfo.addEventListener).mockImplementation(listener => { networkChange = listener as typeof networkChange; return networkRemove; });
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => { appChange = listener; return { remove: appRemove }; });
});
afterEach(() => { stopRecordSync(); jest.restoreAllMocks(); });

test('NFR-05·06 S-80 앱 활성화·연결 복구·개인 기록 저장 시 전송을 예약해요', async () => {
    startRecordSync(records);
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
    startRecordSync(records);
    await tick();
    startRecordSync(records);
    expect(NetInfo.addEventListener).toHaveBeenCalledTimes(1);
    await syncAfterLogin();
    expect(afterLogin).toHaveBeenCalledTimes(2);
    stopRecordSync();
    expect(networkRemove).toHaveBeenCalledTimes(1);
    expect(appRemove).toHaveBeenCalledTimes(1);
    expect(recordRemove).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(1);
    // 같은 앱에서 재로그인하면 같은 저장소에 새 엔진과 이벤트 구독을 연결한다.
    await syncAfterLogin();
    expect(createSyncEngine).toHaveBeenCalledTimes(2);
});

test('NFR-05 S-02 로그인 전에는 기기 대기 기록을 서버로 전송하지 않아요', async () => {
    jest.mocked(tokenStorage.get).mockResolvedValue(null);
    startRecordSync(records);
    networkChange({ isConnected: true, isInternetReachable: true });
    appChange('active');
    await tick();
    expect(sync).not.toHaveBeenCalled();
    expect(afterLogin).not.toHaveBeenCalled();
});
