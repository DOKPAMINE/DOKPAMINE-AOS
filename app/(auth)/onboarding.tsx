import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { useAuth } from '../../src/auth/AuthProvider';
import { Card, PrimaryButton, Screen, SecondaryButton, StateView } from '../../src/components';
import { colors, spacing, typography } from '../../src/theme';

const pages = [
    { title: '읽고 싶은 책부터 담아 보세요', body: '책의 바코드를 스캔하거나 제목과 저자를 직접 입력해 나만의 책장을 만들어 보세요.' },
    { title: '책을 펼치면 독서를 시작해 보세요', body: '읽은 시간과 쪽수를 기록하고, 달력에서 차곡차곡 쌓인 독서 습관을 확인해 보세요.' },
    { title: '마음에 남은 문장을 간직해 보세요', body: '문장과 감상을 남겨 보세요. 감상은 기본으로 비공개이며, 원할 때 공개할 수 있어요.' },
];

// S-01 · FR-18 첫 실행에만 제공하는 3장 안내와 건너뛰기
export default function OnboardingScreen() {
    const { completeOnboarding } = useAuth();
    const [page, setPage] = useState(0);
    const [saving, setSaving] = useState(false);
    const [failed, setFailed] = useState(false);
    const finish = async () => {
        if (saving) return;
        setSaving(true);
        setFailed(false);
        try { await completeOnboarding(); }
        catch { setFailed(true); setSaving(false); }
    };
    return (
        <Screen title="독파민 사용법 안내">
            <Text accessibilityLiveRegion="polite" style={styles.step}>{pages.length}장 중 {page + 1}번째 안내</Text>
            <Card>
                <Text accessibilityRole="header" style={styles.title}>{pages[page].title}</Text>
                <Text style={styles.body}>{pages[page].body}</Text>
            </Card>
            {failed && <StateView kind="error" message="안내 완료 상태를 저장하지 못했어요. 다시 시도해 주세요." />}
            {saving && <Text accessibilityLiveRegion="polite" style={styles.body}>시작할 준비를 하고 있어요.</Text>}
            <PrimaryButton label={page === pages.length - 1 ? '독파민 시작하기' : '다음 안내'} disabled={saving} onPress={() => { if (page < pages.length - 1) setPage(value => value + 1); else void finish(); }} />
            {page > 0 && <SecondaryButton label="이전 안내" disabled={saving} onPress={() => setPage(value => value - 1)} />}
            <SecondaryButton label="건너뛰기" disabled={saving} onPress={() => { void finish(); }} />
        </Screen>
    );
}

const styles = StyleSheet.create({
    step: { ...typography.label, color: colors.text.muted },
    title: { ...typography.title, color: colors.brand.espresso, marginBottom: spacing.lg },
    body: { ...typography.body, color: colors.text.muted },
});
