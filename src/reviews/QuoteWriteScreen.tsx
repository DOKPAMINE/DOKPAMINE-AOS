import { uuid } from 'expo';
import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { KeyboardAvoidingView, Text } from 'react-native';
import { PrimaryButton, Screen, SecondaryButton, StateView } from '../components';
import { emptyQuoteFields, planQuoteSave, quoteFieldsOf, type QuoteFields } from '../domain/reviewRules';
import type { RecordRepository } from '../db/repository';
import type { QuoteRecord } from '../db/schema';
import { useReviewRecords } from './useReviewRecords';
import { EditorField, useEditorExit } from './Editor';
import { reviewStyles as styles } from './styles';

export function QuoteWriteScreen() {
    const { id, quoteId } = useLocalSearchParams<{ id: string; quoteId?: string }>();
    const { records, retry } = useReviewRecords(id);
    // #91: 고칠 문장은 처음 연 값으로 고정한다. 편집 중 삭제돼도 입력 중인 화면을 닫지 않고, 저장할 때 다시 확인해 안내한다.
    const [opened, setOpened] = useState<QuoteRecord>();
    const screenTitle = quoteId ? '문장 수정' : '문장 추가';
    if (records.kind !== 'ready') return <Screen title={screenTitle}><StateView kind={records.kind} onRetry={records.kind === 'error' ? retry : undefined} /></Screen>;
    if (!records.book) return <Screen title={screenTitle}><StateView kind="empty" message="책을 찾을 수 없어요. 삭제된 책에는 문장을 남길 수 없어요." /></Screen>;
    if (quoteId) {
        const found = records.quotes.find(quote => quote.id === quoteId);
        if (found && !opened) setOpened(found);
        const current = opened ?? found;
        if (!current) return <Screen title={screenTitle}><StateView kind="empty" message="고칠 문장을 찾을 수 없어요. 삭제됐는지 감상 목록에서 확인해 주세요." /></Screen>;
        return <QuoteForm key={quoteId} bookId={id} title={records.book.title} repository={records.repository} current={current} />;
    }
    return <QuoteForm key={id} bookId={id} title={records.book.title} repository={records.repository} />;
}

function QuoteForm({ bookId, title, repository, current }: { bookId: string; title: string; repository: RecordRepository; current?: QuoteRecord }) {
    // #91 S-52: 수정은 기존 문장·쪽수를 채워 열고, 고칠 문장 ID는 화면을 연 순간에 고정한다.
    const [initial] = useState<QuoteFields>(() => current ? quoteFieldsOf(current) : emptyQuoteFields);
    const [targetId] = useState(() => current?.id);
    const editing = targetId !== undefined;
    const [fields, setFields] = useState<QuoteFields>(initial);
    const [newId] = useState(() => uuid.v4());
    const [error, setError] = useState<string>();
    const [saved, setSaved] = useState(false);
    const close = useEditorExit(bookId, fields.text !== initial.text || fields.page !== initial.page, saved);
    const screenTitle = editing ? '문장 수정' : '문장 추가';
    const save = () => {
        let target: QuoteRecord | null | undefined;
        try { target = targetId === undefined ? undefined : repository.quotes.get(targetId); } catch {
            setError('저장하지 못했어요. 기기 저장 공간과 책 상태를 확인하고 다시 시도해 주세요.'); return;
        }
        if (targetId !== undefined && !target) { setError('고치던 문장이 삭제됐어요. 닫고 감상 목록에서 확인해 주세요.'); return; }
        const plan = planQuoteSave(fields, target ?? undefined);
        if (plan.kind === 'invalid') { setError(plan.message); return; }
        try {
            // #69: 새 문장은 메모 없이 저장한다. #91: 고칠 때는 입력칸이 없는 예전 메모를 지우지 않고 그대로 둔다.
            repository.quotes.save({ id: targetId ?? newId, bookId, text: plan.text, page: plan.page, memo: target?.memo ?? null });
            setSaved(true);
        } catch { setError('저장하지 못했어요. 기기 저장 공간과 책 상태를 확인하고 다시 시도해 주세요.'); }
    };
    return <KeyboardAvoidingView behavior="height" style={styles.container}><Screen title={screenTitle}>
        <Text style={styles.heading}>{title}</Text>
        <EditorField label="좋아하는 문장" value={fields.text} limit={1000} onChangeText={text => setFields(value => ({ ...value, text }))} />
        <EditorField label="쪽수 (선택)" value={fields.page} multiline={false} numeric onChangeText={page => setFields(value => ({ ...value, page }))} />
        {error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
        <PrimaryButton label="문장 저장" onPress={save} disabled={saved} />
        <SecondaryButton label="닫기" onPress={close} />
    </Screen></KeyboardAvoidingView>;
}
