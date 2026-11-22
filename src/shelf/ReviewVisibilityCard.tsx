import { useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { Card } from '../components';
import { bookVisibility, needsPublishConfirm } from '../domain/reviewRules';
import type { RecordRepository } from '../db/repository';
import { useBookReviewVisibility, type ReviewVisibility } from '../my/preferences';
import { colors, sizes, spacing } from '../theme';
import { shelfStyles as styles } from './styles';

const stateLabels: Record<ReviewVisibility, string> = {
    PUBLIC: '공개 중이에요',
    PRIVATE: '나만 보고 있어요',
};
const stateHints: Record<ReviewVisibility, string> = {
    PUBLIC: '동기화되면 라운지에서 이 책의 한줄평과 독후감을 다른 독자도 볼 수 있어요. 새 감상도 공개로 저장돼요.',
    PRIVATE: '한줄평과 독후감은 나만 볼 수 있어요. 새 감상도 비공개로 저장돼요.',
};
const visibilityName = (visibility: ReviewVisibility) => visibility === 'PUBLIC' ? '공개' : '비공개';

/**
 * FR-08 / S-31: 감상 공개 범위는 책 단위로 정한다. 스위치를 바꾸면 이 책의 한줄평·독후감 전체를 같은 값으로
 * 기기에 먼저 저장하고 동기화를 예약한다. 비공개 → 공개만 확인을 거친다.
 * 감상이 없는 책은 고른 값을 기기에만 저장해 첫 감상에 적용한다(서버 동기화 없음, 재설치하면 S-81 기본값).
 * 공개 범위가 섞인 책은 이 화면이 아니라 앱 전체 알림(MixedVisibilityPrompt)에서 하나로 맞춘다.
 */
export function ReviewVisibilityCard({ bookId, title, repository }: { bookId: string; title: string; repository: RecordRepository }) {
    const stored = useBookReviewVisibility(bookId);
    const [result, setResult] = useState<{ kind: 'done' | 'error'; message: string } | null>(null);
    if (stored === undefined) return null;
    const reviews = repository.reviews.list({ bookId }).filter(review => !review.conflict);
    const empty = reviews.length === 0;
    const current = bookVisibility(reviews, stored.visibility);

    const apply = (next: ReviewVisibility) => {
        const failed = () => setResult({ kind: 'error', message: '공개 범위를 바꾸지 못했어요. 기기 저장 공간을 확인하고 다시 시도해 주세요.' });
        if (empty) {
            try { stored.save(next); setResult(null); } catch { failed(); }
            return;
        }
        let count: number;
        try { count = repository.reviews.setBookVisibility(bookId, next); } catch { failed(); return; }
        // 감상을 모두 지운 뒤에도 마지막으로 고른 값을 따르도록 책별 저장값도 맞춘다. 감상이 기준이라 실패해도 무시한다.
        try { stored.save(next); } catch { /* 감상 변경은 이미 저장됐다. */ }
        setResult(count > 0 ? { kind: 'done', message: `감상 ${count}개를 ${visibilityName(next)}로 바꿨어요 · 동기화 대기` } : null);
    };
    const change = (on: boolean) => {
        const next: ReviewVisibility = on ? 'PUBLIC' : 'PRIVATE';
        if (!needsPublishConfirm(current, next, reviews.length)) { apply(next); return; }
        Alert.alert('감상을 공개할까요?', `「${title}」의 한줄평과 독후감이 모두 공개돼요. 동기화되면 라운지에서 다른 독자가 볼 수 있어요.`, [
            { text: '취소', style: 'cancel' },
            { text: '공개', onPress: () => apply('PUBLIC') },
        ]);
    };

    return <Card>
        <View style={local.header}>
            <View style={local.text}>
                <Text accessibilityRole="header" style={styles.title}>감상 공개</Text>
                <Text style={styles.body}>{empty ? `첫 감상은 ${visibilityName(current)}로 저장돼요` : stateLabels[current]}</Text>
            </View>
            <Switch accessibilityRole="switch" accessibilityLabel="감상 공개" style={local.switch}
                accessibilityState={{ checked: current === 'PUBLIC' }} value={current === 'PUBLIC'}
                trackColor={{ false: colors.brand.sand, true: colors.brand.espresso }} thumbColor={colors.surface.card}
                onValueChange={change} />
        </View>
        <Text style={styles.muted}>{empty
            ? '아직 남긴 감상이 없어요. 여기서 고른 공개 범위는 이 기기에만 저장되고 첫 한줄평·독후감에 적용돼요.'
            : stateHints[current]}</Text>
        {result && <Text accessibilityRole={result.kind === 'error' ? 'alert' : 'text'} accessibilityLiveRegion="polite"
            style={result.kind === 'error' ? styles.error : styles.muted}>{result.message}</Text>}
    </Card>;
}

const local = StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    text: { flex: 1, gap: spacing.xs },
    switch: { minHeight: sizes.minTouch, minWidth: sizes.minTouch },
});
