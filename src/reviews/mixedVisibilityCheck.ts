const listeners = new Set<() => void>();

/** FR-08 / S-50: 충돌 해결로 감상의 공개 범위가 다시 섞였을 수 있으니 앱 전체 알림에 다시 확인을 요청한다. */
export function requestMixedVisibilityCheck() {
    listeners.forEach(listener => listener());
}

export function subscribeMixedVisibilityCheck(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}
