import { uuid } from 'expo';
import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { KeyboardAvoidingView, Text } from 'react-native';
import { PrimaryButton, Screen, SecondaryButton, StateView } from '../components';
import { bookOneLine, planOneLineSave, type OneLineFields } from '../domain/reviewRules';
import type { RecordRepository } from '../db/repository';
import type { ReviewRecord } from '../db/schema';
import { useReviewVisibility, type ReviewVisibility } from '../my/preferences';
import { useReviewRecords } from './useReviewRecords';
import { EditorField, useEditorExit, VisibilityPicker } from './Editor';
import { reviewStyles as styles } from './styles';

export function OneLineWriteScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { records, retry } = useReviewRecords(id);
    const defaultVisibility = useReviewVisibility();
    if (defaultVisibility === undefined) return <Screen title="한줄평"><StateView kind="loading" /></Screen>;
    if (records.kind !== 'ready') return <Screen title="한줄평"><StateView kind={records.kind} onRetry={records.kind === 'error' ? retry : undefined} /></Screen>;
    if (!records.book) return <Screen title="한줄평"><StateView kind="empty" message="책을 찾을 수 없어요. 삭제된 책에는 한줄평을 남길 수 없어요." /></Screen>;
    const current = bookOneLine(records.reviews.filter(review => !review.conflict));
    return <OneLineForm key={id} bookId={id} title={records.book.title} repository={records.repository} current={current} defaultVisibility={defaultVisibility} />;
}

function OneLineForm({ bookId, title, repository, current, defaultVisibility }: {
    bookId: string; title: string; repository: RecordRepository; current: ReviewRecord | undefined; defaultVisibility: ReviewVisibility;
}) {
    // S-51: 한줄평은 책당 하나라 있으면 채워서 고치고, 없을 때만 새 ID로 만든다.
    const [initial] = useState<OneLineFields>(() => ({ text: current?.oneLine ?? '', visibility: current?.visibility ?? defaultVisibility }));
    const [editing] = useState(() => current !== undefined);
    const [fields, setFields] = useState(initial);
    const [newId] = useState(() => uuid.v4());
    const [error, setError] = useState<string>();
    const [saved, setSaved] = useState(false);
    const close = useEditorExit(bookId, fields.text !== initial.text || fields.visibility !== initial.visibility, saved);
    const screenTitle = editing ? '한줄평 수정' : '한줄평 쓰기';
    const save = () => {
        const plan = planOneLineSave(fields, current);
        if (plan.kind === 'invalid') { setError(plan.message); return; }
        try {
            repository.reviews.save({ id: current?.id ?? newId, bookId, oneLine: plan.text, body: current?.body ?? null,
                visibility: plan.visibility, publishedAt: current?.publishedAt ?? null });
            setSaved(true);
        } catch { setError('저장하지 못했어요. 기기 저장 공간과 책 상태를 확인하고 다시 시도해 주세요.'); }
    };
    return <KeyboardAvoidingView behavior="height" style={styles.container}><Screen title={screenTitle}>
        <Text style={styles.heading}>{title}</Text>
        <Text style={styles.meta}>한줄평은 책마다 하나예요. 고치면 기존 한줄평이 바뀌어요.</Text>
        <EditorField label="한줄평" value={fields.text} limit={100} onChangeText={text => setFields(value => ({ ...value, text }))} />
        <VisibilityPicker subject="한줄평" value={fields.visibility ?? 'PRIVATE'} onChange={visibility => setFields(value => ({ ...value, visibility }))} />
        {error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
        <PrimaryButton label="한줄평 저장" onPress={save} disabled={saved} />
        <SecondaryButton label="닫기" onPress={close} />
    </Screen></KeyboardAvoidingView>;
}
