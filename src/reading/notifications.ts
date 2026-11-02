import Storage from 'expo-sqlite/kv-store';
import { AndroidImportance, getPermissionsAsync, requestPermissionsAsync, setNotificationChannelAsync } from 'expo-notifications';

const REQUESTED_KEY = 'reading-notification-requested';

/** NFR-08 / S-40: 최초 시작에만 요청한다. 거절·플랫폼 오류는 독서를 막지 않는다. */
export async function requestReadingPermission(): Promise<string | null> {
    try {
        if (Storage.getItemSync(REQUESTED_KEY) === 'true') return null;
        Storage.setItemSync(REQUESTED_KEY, 'true');
        await setNotificationChannelAsync('reading', {
            name: '독서 진행', importance: AndroidImportance.LOW,
        });
        const existing = await getPermissionsAsync();
        const permission = existing.granted || !existing.canAskAgain ? existing : await requestPermissionsAsync();
        return permission.granted ? null : '알림을 허용하지 않으셨어요. 독서 측정과 90분 확인은 앱 안에서 계속 이용할 수 있어요.';
    } catch {
        return '알림을 사용할 수 없어요. 독서 측정과 90분 확인은 앱 안에서 계속 이용할 수 있어요.';
    }
}
