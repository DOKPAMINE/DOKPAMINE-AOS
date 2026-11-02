import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState } from 'react-native';
import { Camera } from 'expo-camera';
import { getPermissionsAsync } from 'expo-notifications';

type PermissionStatus = 'loading' | 'granted' | 'denied' | 'undetermined' | 'error';
export const permissionLabels: Record<PermissionStatus, string> = {
    loading: '확인 중', granted: '허용됨', denied: '거절됨', undetermined: '아직 요청하지 않음', error: '확인하지 못함',
};

/** S-81 / NFR-07~08: 여기서는 조회만 하며 시스템 설정에서 돌아오면 다시 확인한다. */
export function usePermissions() {
    const [permissions, setPermissions] = useState<{ camera: PermissionStatus; notifications: PermissionStatus }>({ camera: 'loading', notifications: 'loading' });
    useFocusEffect(useCallback(() => {
        let active = true;
        let generation = 0;
        const refresh = async () => {
            const started = ++generation;
            const [camera, notifications] = await Promise.allSettled([
                Camera.getCameraPermissionsAsync(), getPermissionsAsync(),
            ]);
            if (!active || started !== generation) return;
            setPermissions({ camera: camera.status === 'fulfilled' ? camera.value.status : 'error',
                notifications: notifications.status === 'fulfilled' ? notifications.value.status : 'error' });
        };
        void refresh();
        const subscription = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
        return () => { active = false; subscription.remove(); };
    }, []));
    return permissions;
}
