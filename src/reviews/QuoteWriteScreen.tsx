import { uuid } from 'expo';
import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { KeyboardAvoidingView, Text } from 'react-native';
import { PrimaryButton, Screen, SecondaryButton, StateView } from '../components';
import { emptyQuoteFields, quoteSchema, type QuoteFields } from '../domain/reviewRules';
import type { RecordRepository } from '../db/repository';
import { useReviewRecords } from './useReviewRecords';
import { EditorField, useEditorExit } from './Editor';
import { reviewStyles as styles } from './styles';

export function QuoteWriteScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { records, retry } = useReviewRecords(id);
    if (records.kind !== 'ready') return <Screen title="문장 추가"><StateView kind={records.kind} onRetry={records.kind === 'error' ? retry : undefined} /></Screen>;
    if (!records.book) return <Screen title="문장 추가"><StateView kind="empty" message="책을 찾을 수 없어요. 삭제된 책에는 문장을 남길 수 없어요." /></Screen>;
    return <QuoteForm key={id} bookId={id} title={records.book.title} repository={records.repository} />;
}

function QuoteForm({ bookId, title, repository }: { bookId: string; title: string; repository: RecordRepository }) {
    const [fields, setFields] = useState<QuoteFields>(emptyQuoteFields);
    const [id] = useState(() => uuid.v4());
    const [error, setError] = useState<string>();
    const [saved, setSaved] = useState(false);
    const close = useEditorExit(bookId, Boolean(fields.text || fields.page), saved);
    const save = () => {
        const result = quoteSchema.safeParse(fields);
        if (!result.success) { setError(result.error.issues[0].message); return; }
        try {
            // #69: 메모 입력을 없애 새 문장은 메모 없이 저장한다. DB와 서버의 memo 칸은 선택 항목이라 그대로 둔다.
            repository.quotes.save({ id, bookId, ...result.data, memo: null });
            setSaved(true);
        } catch { setError('저장하지 못했어요. 기기 저장 공간과 책 상태를 확인하고 다시 시도해 주세요.'); }
    };
    return <KeyboardAvoidingView behavior="height" style={styles.container}><Screen title="문장 추가">
        <Text style={styles.heading}>{title}</Text>
        <EditorField label="좋아하는 문장" value={fields.text} limit={1000} onChangeText={text => setFields(current => ({ ...current, text }))} />
        <EditorField label="쪽수 (선택)" value={fields.page} multiline={false} numeric onChangeText={page => setFields(current => ({ ...current, page }))} />
        {error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
        <PrimaryButton label="문장 저장" onPress={save} disabled={saved} />
        <SecondaryButton label="닫기" onPress={close} />
    </Screen></KeyboardAvoidingView>;
}
