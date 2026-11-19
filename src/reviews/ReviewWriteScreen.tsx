import { uuid } from 'expo';
import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { KeyboardAvoidingView, Pressable, Text, View } from 'react-native';
import { PrimaryButton, Screen, SecondaryButton, StateView } from '../components';
import { bookOneLine, emptyReviewFields, planReviewSave, type ReviewFields } from '../domain/reviewRules';
import type { RecordRepository } from '../db/repository';
import type { ReviewRecord } from '../db/schema';
import { useReviewRecords } from './useReviewRecords';
import { EditorField, useEditorExit } from './Editor';
import { reviewStyles as styles } from './styles';
import { useReviewVisibility, type ReviewVisibility } from '../my/preferences';

export function ReviewWriteScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { records, retry } = useReviewRecords(id);
    const defaultVisibility = useReviewVisibility();
    if (defaultVisibility === undefined) return <Screen title="감상 쓰기"><StateView kind="loading" /></Screen>;
    if (records.kind !== 'ready') return <Screen title="감상 쓰기"><StateView kind={records.kind} onRetry={records.kind === 'error' ? retry : undefined} /></Screen>;
    if (!records.book) return <Screen title="감상 쓰기"><StateView kind="empty" message="책을 찾을 수 없어요. 삭제된 책에는 감상을 남길 수 없어요." /></Screen>;
    const current = bookOneLine(records.reviews.filter(review => !review.conflict));
    return <ReviewForm key={id} bookId={id} title={records.book.title} repository={records.repository} current={current} defaultVisibility={defaultVisibility} />;
}

function ReviewForm({ bookId, title, repository, current, defaultVisibility }: {
    bookId: string; title: string; repository: RecordRepository; current: ReviewRecord | undefined; defaultVisibility: ReviewVisibility;
}) {
    // S-51: 한줄평 칸은 책의 한줄평으로 미리 채우고, 독후감 칸은 늘 새로 쓴다.
    const [initialOneLine] = useState(() => current?.oneLine ?? '');
    const [fields, setFields] = useState<ReviewFields>(() => ({ ...emptyReviewFields, oneLine: initialOneLine, visibility: defaultVisibility }));
    const [oneLineId] = useState(() => uuid.v4());
    const [bodyId] = useState(() => uuid.v4());
    const [error, setError] = useState<string>();
    const [saved, setSaved] = useState(false);
    const close = useEditorExit(bookId, Boolean(fields.oneLine !== initialOneLine || fields.body || fields.visibility !== defaultVisibility), saved);
    const save = () => {
        const plan = planReviewSave(fields, current?.oneLine);
        if (plan.kind === 'invalid') { setError(plan.message); return; }
        try {
            // 저장 재시도에도 같은 ID를 써서 한줄평·독후감이 중복으로 생기지 않게 한다.
            if (plan.oneLine !== null) {
                repository.reviews.save(current
                    ? { id: current.id, bookId, oneLine: plan.oneLine, body: current.body, visibility: plan.visibility, publishedAt: current.publishedAt }
                    : { id: oneLineId, bookId, oneLine: plan.oneLine, body: null, visibility: plan.visibility, publishedAt: null });
            }
            if (plan.body !== null) {
                repository.reviews.save({ id: bodyId, bookId, oneLine: null, body: plan.body, visibility: plan.visibility, publishedAt: null });
            }
            setSaved(true);
        } catch { setError('저장하지 못했어요. 기기 저장 공간과 책 상태를 확인하고 다시 시도해 주세요.'); }
    };
    return <KeyboardAvoidingView behavior="height" style={styles.container}><Screen title="감상 쓰기">
        <Text style={styles.heading}>{title}</Text>
        <Text style={styles.meta}>한줄평은 책마다 하나라 고치면 바뀌고, 독후감은 쓸 때마다 새로 쌓여요.</Text>
        <EditorField label="한줄평" value={fields.oneLine} limit={100} onChangeText={oneLine => setFields(current => ({ ...current, oneLine }))} />
        <EditorField label="독후감" value={fields.body} limit={5000} onChangeText={body => setFields(current => ({ ...current, body }))} />
        <Text style={styles.label}>공개 범위</Text>
        <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="감상 공개 범위">
            {(['PRIVATE', 'PUBLIC'] as const).map(visibility => {
                const selected = fields.visibility === visibility;
                const label = visibility === 'PRIVATE' ? '비공개 · 나만 보기' : '공개';
                return <Pressable key={visibility} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: selected }}
                    onPress={() => setFields(current => ({ ...current, visibility }))}
                    style={({ pressed }) => [styles.choice, selected && styles.selected, pressed && styles.pressed]}>
                    <Text style={styles.label}>{label}{selected ? ' (선택됨)' : ''}</Text>
                </Pressable>;
            })}
        </View>
        <Text style={styles.meta}>공개 범위는 이번에 저장하는 한줄평과 독후감에 적용돼요.</Text>
        {fields.visibility === 'PUBLIC' && <Text style={styles.meta}>연결 후 동기화되면 다른 독자도 이 감상을 볼 수 있어요.</Text>}
        {error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
        <PrimaryButton label="감상 저장" onPress={save} disabled={saved} />
        <SecondaryButton label="닫기" onPress={close} />
    </Screen></KeyboardAvoidingView>;
}
