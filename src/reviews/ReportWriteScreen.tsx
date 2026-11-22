import { uuid } from 'expo';
import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { KeyboardAvoidingView, Text } from 'react-native';
import { PrimaryButton, Screen, SecondaryButton, StateView } from '../components';
import { bookVisibility, reportSchema } from '../domain/reviewRules';
import type { RecordRepository } from '../db/repository';
import { useBookReviewVisibility, type ReviewVisibility } from '../my/preferences';
import { useReviewRecords } from './useReviewRecords';
import { EditorField, useEditorExit, VisibilityNotice } from './Editor';
import { reviewStyles as styles } from './styles';

export function ReportWriteScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { records, retry } = useReviewRecords(id);
    // 감상이 없는 책은 책 상세에서 기기에 저장한 값(없으면 S-81 기본값)을 따른다.
    const defaultVisibility = useBookReviewVisibility(id)?.visibility;
    if (defaultVisibility === undefined) return <Screen title="독후감 쓰기"><StateView kind="loading" /></Screen>;
    if (records.kind !== 'ready') return <Screen title="독후감 쓰기"><StateView kind={records.kind} onRetry={records.kind === 'error' ? retry : undefined} /></Screen>;
    if (!records.book) return <Screen title="독후감 쓰기"><StateView kind="empty" message="책을 찾을 수 없어요. 삭제된 책에는 독후감을 남길 수 없어요." /></Screen>;
    // FR-08 / S-53: 새 독후감은 책의 공개 범위(감상이 없으면 책별 저장값, 없으면 S-81 기본값)를 따른다.
    const visibility = bookVisibility(records.reviews.filter(review => !review.conflict), defaultVisibility);
    return <ReportForm key={id} bookId={id} title={records.book.title} repository={records.repository} visibility={visibility} />;
}

function ReportForm({ bookId, title, repository, visibility }: { bookId: string; title: string; repository: RecordRepository; visibility: ReviewVisibility }) {
    const [text, setText] = useState('');
    // S-53: 독후감은 독서마다 쌓이므로 늘 새 ID로 추가하고, 저장 재시도에는 같은 ID를 쓴다.
    const [id] = useState(() => uuid.v4());
    const [error, setError] = useState<string>();
    const [saved, setSaved] = useState(false);
    const close = useEditorExit(bookId, Boolean(text), saved);
    const save = () => {
        const result = reportSchema.safeParse({ text, visibility });
        if (!result.success) { setError(result.error.issues[0].message); return; }
        try {
            repository.reviews.save({ id, bookId, oneLine: null, body: result.data.text, visibility: result.data.visibility, publishedAt: null });
            setSaved(true);
        } catch { setError('저장하지 못했어요. 기기 저장 공간과 책 상태를 확인하고 다시 시도해 주세요.'); }
    };
    return <KeyboardAvoidingView behavior="height" style={styles.container}><Screen title="독후감 쓰기">
        <Text style={styles.heading}>{title}</Text>
        <Text style={styles.meta}>독후감은 쓸 때마다 새로 쌓여요.</Text>
        <EditorField label="독후감" value={text} limit={5000} onChangeText={setText} />
        <VisibilityNotice subject="독후감" visibility={visibility} />
        {error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
        <PrimaryButton label="독후감 저장" onPress={save} disabled={saved} />
        <SecondaryButton label="닫기" onPress={close} />
    </Screen></KeyboardAvoidingView>;
}
