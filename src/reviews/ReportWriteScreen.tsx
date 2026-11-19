import { uuid } from 'expo';
import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { KeyboardAvoidingView, Text } from 'react-native';
import { PrimaryButton, Screen, SecondaryButton, StateView } from '../components';
import { reportSchema, type ReportFields } from '../domain/reviewRules';
import type { RecordRepository } from '../db/repository';
import { useReviewVisibility, type ReviewVisibility } from '../my/preferences';
import { useReviewRecords } from './useReviewRecords';
import { EditorField, useEditorExit, VisibilityPicker } from './Editor';
import { reviewStyles as styles } from './styles';

export function ReportWriteScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { records, retry } = useReviewRecords(id);
    const defaultVisibility = useReviewVisibility();
    if (defaultVisibility === undefined) return <Screen title="독후감 쓰기"><StateView kind="loading" /></Screen>;
    if (records.kind !== 'ready') return <Screen title="독후감 쓰기"><StateView kind={records.kind} onRetry={records.kind === 'error' ? retry : undefined} /></Screen>;
    if (!records.book) return <Screen title="독후감 쓰기"><StateView kind="empty" message="책을 찾을 수 없어요. 삭제된 책에는 독후감을 남길 수 없어요." /></Screen>;
    return <ReportForm key={id} bookId={id} title={records.book.title} repository={records.repository} defaultVisibility={defaultVisibility} />;
}

function ReportForm({ bookId, title, repository, defaultVisibility }: { bookId: string; title: string; repository: RecordRepository; defaultVisibility: ReviewVisibility }) {
    const [fields, setFields] = useState<ReportFields>(() => ({ text: '', visibility: defaultVisibility }));
    // S-51: 독후감은 독서마다 쌓이므로 늘 새 ID로 추가하고, 저장 재시도에는 같은 ID를 쓴다.
    const [id] = useState(() => uuid.v4());
    const [error, setError] = useState<string>();
    const [saved, setSaved] = useState(false);
    const close = useEditorExit(bookId, Boolean(fields.text || fields.visibility !== defaultVisibility), saved);
    const save = () => {
        const result = reportSchema.safeParse(fields);
        if (!result.success) { setError(result.error.issues[0].message); return; }
        try {
            repository.reviews.save({ id, bookId, oneLine: null, body: result.data.text, visibility: result.data.visibility, publishedAt: null });
            setSaved(true);
        } catch { setError('저장하지 못했어요. 기기 저장 공간과 책 상태를 확인하고 다시 시도해 주세요.'); }
    };
    return <KeyboardAvoidingView behavior="height" style={styles.container}><Screen title="독후감 쓰기">
        <Text style={styles.heading}>{title}</Text>
        <Text style={styles.meta}>독후감은 쓸 때마다 새로 쌓여요.</Text>
        <EditorField label="독후감" value={fields.text} limit={5000} onChangeText={text => setFields(value => ({ ...value, text }))} />
        <VisibilityPicker subject="독후감" value={fields.visibility ?? 'PRIVATE'} onChange={visibility => setFields(value => ({ ...value, visibility }))} />
        {error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
        <PrimaryButton label="독후감 저장" onPress={save} disabled={saved} />
        <SecondaryButton label="닫기" onPress={close} />
    </Screen></KeyboardAvoidingView>;
}
