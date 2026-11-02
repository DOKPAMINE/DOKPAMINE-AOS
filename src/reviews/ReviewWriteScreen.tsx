import { uuid } from 'expo';
import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { KeyboardAvoidingView, Pressable, Text, View } from 'react-native';
import { PrimaryButton, Screen, SecondaryButton, StateView } from '../components';
import { emptyReviewFields, reviewSchema, type ReviewFields } from '../domain/reviewRules';
import type { RecordRepository } from '../db/repository';
import { useReviewRecords } from './useReviewRecords';
import { EditorField, useEditorExit } from './Editor';
import { reviewStyles as styles } from './styles';

export function ReviewWriteScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { records, retry } = useReviewRecords(id);
    if (records.kind !== 'ready') return <Screen title="감상 쓰기"><StateView kind={records.kind} onRetry={records.kind === 'error' ? retry : undefined} /></Screen>;
    if (!records.book) return <Screen title="감상 쓰기"><StateView kind="empty" message="책을 찾을 수 없어요. 삭제된 책에는 감상을 남길 수 없어요." /></Screen>;
    return <ReviewForm key={id} bookId={id} title={records.book.title} repository={records.repository} />;
}

function ReviewForm({ bookId, title, repository }: { bookId: string; title: string; repository: RecordRepository }) {
    const [fields, setFields] = useState<ReviewFields>(emptyReviewFields);
    const [id] = useState(() => uuid.v4());
    const [error, setError] = useState<string>();
    const [saved, setSaved] = useState(false);
    const close = useEditorExit(bookId, Boolean(fields.oneLine || fields.body || fields.visibility !== 'PRIVATE'), saved);
    const save = () => {
        const result = reviewSchema.safeParse(fields);
        if (!result.success) { setError(result.error.issues[0].message); return; }
        try {
            repository.reviews.save({ id, bookId, oneLine: result.data.oneLine || null, body: result.data.body || null,
                visibility: result.data.visibility, publishedAt: null });
            setSaved(true);
        } catch { setError('저장하지 못했어요. 기기 저장 공간과 책 상태를 확인하고 다시 시도해 주세요.'); }
    };
    return <KeyboardAvoidingView behavior="height" style={styles.container}><Screen title="감상 쓰기">
        <Text style={styles.heading}>{title}</Text>
        <Text style={styles.meta}>한줄평이나 독후감 중 하나만 남겨도 좋아요.</Text>
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
        {fields.visibility === 'PUBLIC' && <Text style={styles.meta}>연결 후 동기화되면 다른 독자도 이 감상을 볼 수 있어요.</Text>}
        {error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
        <PrimaryButton label="감상 저장" onPress={save} disabled={saved} />
        <SecondaryButton label="닫기" onPress={close} />
    </Screen></KeyboardAvoidingView>;
}
