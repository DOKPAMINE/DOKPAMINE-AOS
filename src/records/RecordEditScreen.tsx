import { uuid } from 'expo';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Text, TextInput, View } from 'react-native';
import { PrimaryButton, Screen, SecondaryButton, StateView } from '../components';
import type { RecordRepository } from '../db/repository';
import type { BookRecord, SessionRecord } from '../db/schema';
import { initialRecordFields, validateRecordFields, type RecordFields } from '../domain/recordRules';
import { useShelfRepository } from '../shelf/useShelfRepository';
import { colors } from '../theme';
import { prepareRecordSave } from './service';
import { recordStyles as styles } from './styles';

export function RecordEditScreen() {
    const { id, recordId } = useLocalSearchParams<{ id: string; recordId?: string }>();
    const { repository, error, retry } = useShelfRepository();
    if (error || !repository) return <Screen title="독서 기록"><StateView kind={error ? 'error' : 'loading'} onRetry={error ? retry : undefined} /></Screen>;
    const book = repository.books.get(id);
    const existing = recordId ? repository.sessions.get(recordId) : null;
    if (!book || (recordId && (!existing || existing.bookId !== id))) return <Screen title="독서 기록"><StateView kind="empty" message="책이나 독서 기록을 찾을 수 없어요." /><SecondaryButton label="기록 목록으로" onPress={() => router.dismissTo({ pathname: '/book/[id]/records', params: { id } })} /></Screen>;
    return <RecordForm key={`${id}:${recordId ?? 'new'}`} book={book} existing={existing} repository={repository} />;
}

function RecordForm({ book, existing, repository }: { book: BookRecord; existing: SessionRecord | null; repository: RecordRepository }) {
    const [fields, setFields] = useState(() => initialRecordFields(book.currentPage, book.totalPages, Date.now(), existing));
    const [error, setError] = useState<string | null>(null);
    const [clientId] = useState(() => existing?.id ?? uuid.v4());
    const pendingSave = useRef<(() => void) | null>(null);
    const [savePending, setSavePending] = useState(false);
    const list = () => router.dismissTo({ pathname: '/book/[id]/records', params: { id: book.id } });
    const save = () => {
        try {
            if (!pendingSave.current) {
                const latest = repository.books.get(book.id);
                if (!latest) { setError('삭제된 책에는 기록을 저장할 수 없어요.'); return; }
                const now = Date.now();
                const valid = validateRecordFields(fields, latest.totalPages, now);
                if (valid.kind === 'invalid') { setError(valid.message); return; }
                pendingSave.current = prepareRecordSave(repository, book.id, clientId, valid, now, !!existing);
                setSavePending(true);
            }
            pendingSave.current();
            pendingSave.current = null;
            setSavePending(false);
            list();
        } catch { setError('저장을 마무리하지 못했어요. 입력한 내용은 유지했으니 기기 저장 공간을 확인하고 다시 저장해 주세요.'); }
    };
    const labels: Record<keyof RecordFields, string> = { date: '독서 날짜 (YYYY-MM-DD)', time: '시작 시각 (HH:mm)', minutes: '독서 시간 (분)', startPage: '시작 쪽', endPage: '종료 쪽 (선택)' };
    return <KeyboardAvoidingView style={{ flex: 1 }} behavior="height"><Screen title={existing ? '기록 수정' : '기록 직접 추가'}>
        <Text style={styles.label}>{book.title}</Text>
        <Text style={styles.muted}>직접 추가하거나 수정한 기록은 랭킹에서 제외됩니다.</Text>
        <Text style={styles.muted}>날짜와 시작 시각은 한국 시각(KST)으로 입력해 주세요. 종료 쪽을 비우면 시간만 저장해요.</Text>
        {(Object.keys(labels) as (keyof RecordFields)[]).map(key => <View key={key} style={styles.section}>
            <Text style={styles.label}>{labels[key]}</Text>
            <TextInput accessibilityLabel={labels[key]} accessibilityState={{ disabled: savePending }} editable={!savePending}
                value={fields[key]} onChangeText={value => { setFields(current => ({ ...current, [key]: value })); setError(null); }}
                keyboardType={key === 'minutes' || key === 'startPage' || key === 'endPage' ? 'number-pad' : 'default'}
                autoCapitalize="none" autoCorrect={false} maxLength={key === 'date' ? 10 : key === 'time' ? 5 : 10}
                selectionColor={colors.brand.camel} style={styles.field} />
        </View>)}
        {error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
        <PrimaryButton label="저장" onPress={save} />
        <SecondaryButton label="취소" onPress={list} />
    </Screen></KeyboardAvoidingView>;
}
