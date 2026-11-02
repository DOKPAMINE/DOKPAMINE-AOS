import { useRef, useState } from 'react';
import { router } from 'expo-router';
import { Alert, Linking, Pressable, Switch, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { isOnline } from '../api/connectivity';
import { Card, Screen, SecondaryButton, StateView } from '../components';
import { colors } from '../theme';
import { reviewPreferences, type ReviewVisibility } from './preferences';
import { useMyProfile } from './useMyProfile';
import { permissionLabels, usePermissions } from './usePermissions';
import { styles } from './styles';

export function SettingsScreen() {
    const { signOut } = useAuth();
    const { state: account, retry } = useMyProfile();
    const permissions = usePermissions();
    const [offline, setOffline] = useState(false);
    const [error, setError] = useState<string>();
    const [checking, setChecking] = useState(false);
    const checkingRef = useRef(false);
    const [leaving, setLeaving] = useState(false);
    const leavingRef = useRef(false);
    const changeParticipation = async (optIn: boolean) => {
        if (checkingRef.current) return;
        checkingRef.current = true;
        setChecking(true);
        try {
            if (!await isOnline()) { setOffline(true); return; }
            setOffline(false);
            router.push(optIn ? '/ranking/consent' : '/ranking/withdraw');
        } finally { checkingRef.current = false; setChecking(false); }
    };
    const confirmSignOut = () => {
        if (leavingRef.current) return;
        Alert.alert('로그아웃할까요?', '이 기기의 개인 독서 기록은 보존돼요. 전송 대기 기록은 다시 로그인하면 동기화돼요.', [
            { text: '취소', style: 'cancel' },
            { text: '로그아웃', onPress: () => {
                if (leavingRef.current) return;
                leavingRef.current = true;
                setLeaving(true);
                // AuthProvider의 상태 변경으로 Protected 설정 화면이 닫히고 인증 화면이 열린다.
                void signOut().catch(() => { setError('로그아웃하지 못했어요. 다시 시도해 주세요.'); })
                    .finally(() => { leavingRef.current = false; setLeaving(false); });
            } },
        ]);
    };
    return <Screen title="설정">
        {account.kind !== 'ready' ? <StateView kind={account.kind} onRetry={account.kind === 'error' ? retry : undefined} /> : <>
            <VisibilitySetting key={account.userId} userId={account.userId} />
            <Card>
                <Text accessibilityRole="header" style={styles.heading}>랭킹 참여</Text>
                <View style={styles.row}>
                    <Text style={styles.body}>{account.profile ? account.profile.rankingOptIn ? '참여 중이에요' : '참여하지 않고 있어요' : '참여 상태를 확인해 주세요'}</Text>
                    <Switch accessibilityRole="switch" accessibilityLabel="랭킹 참여" style={styles.switch}
                        accessibilityState={{ checked: account.profile?.rankingOptIn ?? false, disabled: !account.profile || checking }}
                        disabled={!account.profile || checking} value={account.profile?.rankingOptIn ?? false}
                        trackColor={{ false: colors.brand.sand, true: colors.brand.espresso }} thumbColor={colors.surface.card}
                        onValueChange={value => { void changeParticipation(value); }} />
                </View>
                <Text style={styles.meta}>참여 동의 또는 중단 확인 화면에서 결정할 수 있어요.</Text>
                {(account.offline || offline) && <StateView kind="offline" />}
                {account.failed && <StateView kind="error" message="랭킹 참여 상태를 새로 확인하지 못했어요." onRetry={retry} />}
                {!account.profile && account.offline && <SecondaryButton label="연결 후 참여 상태 확인" onPress={retry} />}
            </Card>
        </>}
        <Card>
            <Text accessibilityRole="header" style={styles.heading}>권한 안내</Text>
            <Text style={styles.body}>카메라 · {permissionLabels[permissions.camera]}</Text>
            <Text style={styles.meta}>바코드 스캔에 사용해요. 허용하지 않아도 직접 입력할 수 있어요.</Text>
            <Text style={styles.body}>알림 · {permissionLabels[permissions.notifications]}</Text>
            <Text style={styles.meta}>타이머 진행 알림에 사용해요. 허용하지 않아도 앱 안 안내를 볼 수 있어요.</Text>
            <SecondaryButton label="시스템 설정 열기" onPress={() => { void Linking.openSettings().catch(() => setError('시스템 설정을 열지 못했어요. 기기 설정에서 독파민을 찾아 주세요.')); }} />
        </Card>
        {error && <StateView kind="error" message={error} />}
        <SecondaryButton label={leaving ? '로그아웃 중이에요' : '로그아웃'} disabled={leaving} onPress={confirmSignOut} />
        <SecondaryButton label="마이로 돌아가기" onPress={() => router.dismissTo('/my')} />
    </Screen>;
}

function VisibilitySetting({ userId }: { userId: string }) {
    const [visibility, setVisibility] = useState<ReviewVisibility | null>(() => {
        try { return reviewPreferences.load(userId); } catch { return null; }
    });
    const [message, setMessage] = useState<string>();
    const [error, setError] = useState<string>();
    const save = (value: ReviewVisibility) => {
        try {
            reviewPreferences.save(userId, value);
            setVisibility(value);
            setError(undefined);
            setMessage('기본 공개 범위를 저장했어요.');
        } catch { setError('기본 공개 범위를 저장하지 못했어요. 다시 선택해 주세요.'); setMessage(undefined); }
    };
    return <Card>
        <Text accessibilityRole="header" style={styles.heading}>새 감상의 기본 공개 범위</Text>
        <Text style={styles.meta}>새로 쓰는 감상에 적용돼요. 기존 감상의 공개 범위는 유지돼요.</Text>
        <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="새 감상의 기본 공개 범위">
            {(['PRIVATE', 'PUBLIC'] as const).map(value => {
                const selected = value === visibility;
                const label = value === 'PRIVATE' ? '기본 비공개 · 나만 보기' : '기본 공개';
                return <Pressable key={value} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: selected }}
                    onPress={() => save(value)} style={[styles.choice, selected && styles.selected]}>
                    <Text style={styles.body}>{label}{selected ? ' (선택됨)' : ''}</Text>
                </Pressable>;
            })}
        </View>
        {visibility === null && <StateView kind="error" message="저장된 기본 공개 범위를 확인하지 못했어요. 적용할 범위를 선택해 주세요." />}
        {message && <Text accessibilityLiveRegion="polite" style={styles.meta}>{message}</Text>}
        {error && <StateView kind="error" message={error} />}
    </Card>;
}
