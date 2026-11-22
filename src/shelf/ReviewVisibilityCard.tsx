import { useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { Card } from '../components';
import { bookVisibility, needsPublishConfirm, type BookVisibility } from '../domain/reviewRules';
import type { RecordRepository } from '../db/repository';
import { useReviewVisibility, type ReviewVisibility } from '../my/preferences';
import { colors, sizes, spacing } from '../theme';
import { shelfStyles as styles } from './styles';

const stateLabels: Record<BookVisibility, string> = {
    PUBLIC: '공개 중이에요',
    PRIVATE: '나만 보고 있어요',
    MIXED: '일부 감상만 공개돼 있어요',
};
const stateHints: Record<BookVisibility, string> = {
    PUBLIC: '동기화되면 라운지에서 이 책의 한줄평과 독후감을 다른 독자도 볼 수 있어요. 새 감상도 공개로 저장돼요.',
    PRIVATE: '한줄평과 독후감은 나만 볼 수 있어요. 새 감상도 비공개로 저장돼요.',
    MIXED: '예전에 감상마다 따로 고른 공개 범위가 남아 있어요. 새 감상은 비공개로 저장돼요.',
};
const visibilityName = (visibility: ReviewVisibility) => visibility === 'PUBLIC' ? '공개' : '비공개';

/**
 * FR-08 / S-31: 감상 공개 범위는 책 단위로 정한다. 스위치를 바꾸면 이 책의 한줄평·독후감 전체를 같은 값으로
 * 기기에 먼저 저장하고 동기화를 예약한다. 비공개 → 공개만 확인을 거친다.
 */
export function ReviewVisibilityCard({ bookId, title, repository }: { bookId: string; title: string; repository: RecordRepository }) {
    const fallback = useReviewVisibility();
    const [result, setResult] = useState<{ kind: 'done' | 'error'; message: string } | null>(null);
    if (fallback === undefined) return null;
    const reviews = repository.reviews.list({ bookId }).filter(review => !review.conflict);
    const empty = reviews.length === 0;
    const current = bookVisibility(reviews, fallback);

    const apply = (next: ReviewVisibility) => {
        try {
            const count = repository.reviews.setBookVisibility(bookId, next);
            setResult(count > 0 ? { kind: 'done', message: `감상 ${count}개를 ${visibilityName(next)}로 바꿨어요 · 동기화 대기` } : null);
        } catch {
            setResult({ kind: 'error', message: '공개 범위를 바꾸지 못했어요. 기기 저장 공간을 확인하고 다시 시도해 주세요.' });
        }
    };
    const change = (on: boolean) => {
        if (current === 'MIXED') {
            Alert.alert('감상 공개 범위를 하나로 맞출까요?', `「${title}」의 한줄평과 독후감 전체에 같은 공개 범위를 적용해요. 공개하면 동기화 후 라운지에서 다른 독자가 볼 수 있어요.`, [
                { text: '취소', style: 'cancel' },
                { text: '모두 비공개', onPress: () => apply('PRIVATE') },
                { text: '모두 공개', onPress: () => apply('PUBLIC') },
            ]);
            return;
        }
        const next: ReviewVisibility = on ? 'PUBLIC' : 'PRIVATE';
        if (!needsPublishConfirm(current, next)) { apply(next); return; }
        Alert.alert('감상을 공개할까요?', `「${title}」의 한줄평과 독후감이 모두 공개돼요. 동기화되면 라운지에서 다른 독자가 볼 수 있어요.`, [
            { text: '취소', style: 'cancel' },
            { text: '공개', onPress: () => apply('PUBLIC') },
        ]);
    };

    return <Card>
        <View style={local.header}>
            <View style={local.text}>
                <Text accessibilityRole="header" style={styles.title}>감상 공개</Text>
                <Text style={styles.body}>{empty ? `기본 공개 범위 · ${visibilityName(fallback)}` : stateLabels[current]}</Text>
            </View>
            <Switch accessibilityRole="switch" accessibilityLabel="감상 공개" style={local.switch}
                accessibilityState={{ checked: current === 'PUBLIC', disabled: empty }} disabled={empty} value={current === 'PUBLIC'}
                trackColor={{ false: colors.brand.sand, true: colors.brand.espresso }} thumbColor={colors.surface.card}
                onValueChange={change} />
        </View>
        <Text style={styles.muted}>{empty
            ? '아직 남긴 감상이 없어서 설정의 기본 공개 범위를 따라요. 한줄평이나 독후감을 남기면 여기서 바꿀 수 있어요.'
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
