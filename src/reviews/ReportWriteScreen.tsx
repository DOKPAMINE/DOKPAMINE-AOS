import { uuid } from 'expo';
import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { KeyboardAvoidingView, Text } from 'react-native';
import { PrimaryButton, Screen, SecondaryButton, StateView } from '../components';
import { bookVisibility, planReportSave } from '../domain/reviewRules';
import type { RecordRepository } from '../db/repository';
import type { ReviewRecord } from '../db/schema';
import { useBookReviewVisibility, type ReviewVisibility } from '../my/preferences';
import { useReviewRecords } from './useReviewRecords';
import { EditorField, useEditorExit, VisibilityNotice } from './Editor';
import { reviewStyles as styles } from './styles';

export function ReportWriteScreen() {
    const { id, reviewId } = useLocalSearchParams<{ id: string; reviewId?: string }>();
    const { records, retry } = useReviewRecords(id);
    // #91: 고칠 독후감은 처음 연 값으로 고정한다. 편집 중 충돌·삭제돼도 입력 중인 화면을 닫지 않고, 저장할 때 다시 확인해 안내한다.
    const [opened, setOpened] = useState<ReviewRecord>();
    const screenTitle = reviewId ? '독후감 수정' : '독후감 쓰기';
    // 감상이 없는 책은 책 상세에서 기기에 저장한 값(없으면 S-81 기본값)을 따른다.
    const defaultVisibility = useBookReviewVisibility(id)?.visibility;
    if (defaultVisibility === undefined) return <Screen title={screenTitle}><StateView kind="loading" /></Screen>;
    if (records.kind !== 'ready') return <Screen title={screenTitle}><StateView kind={records.kind} onRetry={records.kind === 'error' ? retry : undefined} /></Screen>;
    if (!records.book) return <Screen title={screenTitle}><StateView kind="empty" message="책을 찾을 수 없어요. 삭제된 책에는 독후감을 남길 수 없어요." /></Screen>;
    const reviews = records.reviews.filter(review => !review.conflict);
    if (reviewId) {
        // #91 S-53: 고칠 독후감은 충돌·삭제되지 않은 것만 연다. 공개 범위는 그 독후감의 값을 표시만 하고 그대로 둔다.
        const found = reviews.find(review => review.id === reviewId && review.body?.trim());
        if (found && !opened) setOpened(found);
        const current = opened ?? found;
        if (!current) return <Screen title={screenTitle}><StateView kind="empty" message="고칠 독후감을 찾을 수 없어요. 삭제됐거나 동기화 충돌 중인지 감상 목록에서 확인해 주세요." /></Screen>;
        return <ReportForm key={reviewId} bookId={id} title={records.book.title} repository={records.repository} visibility={current.visibility} current={current} />;
    }
    // FR-08 / S-53: 새 독후감은 책의 공개 범위(감상이 없으면 책별 저장값, 없으면 S-81 기본값)를 따른다.
    const visibility = bookVisibility(reviews, defaultVisibility);
    return <ReportForm key={id} bookId={id} title={records.book.title} repository={records.repository} visibility={visibility} />;
}

function ReportForm({ bookId, title, repository, visibility, current }: {
    bookId: string; title: string; repository: RecordRepository; visibility: ReviewVisibility; current?: ReviewRecord;
}) {
    const [initial] = useState(() => current?.body ?? '');
    // 고칠 독후감 ID는 화면을 연 순간에 고정한다. 편집 중 동기화로 목록이 바뀌어도 다른 독후감을 고치지 않는다.
    const [targetId] = useState(() => current?.id);
    const editing = targetId !== undefined;
    const [text, setText] = useState(initial);
    // S-53: 새 독후감은 독서마다 쌓이므로 늘 새 ID로 추가하고, 저장 재시도에는 같은 ID를 쓴다.
    const [newId] = useState(() => uuid.v4());
    const [error, setError] = useState<string>();
    const [saved, setSaved] = useState(false);
    const close = useEditorExit(bookId, text !== initial, saved);
    const screenTitle = editing ? '독후감 수정' : '독후감 쓰기';
    const save = () => {
        let target: ReviewRecord | null | undefined;
        try { target = targetId === undefined ? undefined : repository.reviews.get(targetId); } catch {
            setError('저장하지 못했어요. 기기 저장 공간과 책 상태를 확인하고 다시 시도해 주세요.'); return;
        }
        if (targetId !== undefined && (!target || target.conflict || !target.body?.trim())) {
            setError('고치던 독후감이 서버 기록과 달라졌거나 삭제됐어요. 닫고 감상 목록에서 확인해 주세요.'); return;
        }
        const plan = planReportSave(text, target ?? undefined);
        if (plan.kind === 'invalid') { setError(plan.message); return; }
        try {
            if (target) repository.reviews.updateReport(target.id, plan.text);
            else repository.reviews.save({ id: newId, bookId, oneLine: null, body: plan.text, visibility, publishedAt: null });
            setSaved(true);
        } catch { setError('저장하지 못했어요. 기기 저장 공간과 책 상태를 확인하고 다시 시도해 주세요.'); }
    };
    return <KeyboardAvoidingView behavior="height" style={styles.container}><Screen title={screenTitle}>
        <Text style={styles.heading}>{title}</Text>
        <Text style={styles.meta}>{editing ? '고치면 이 독후감이 바뀌어요. 새 독후감은 생기지 않아요.' : '독후감은 쓸 때마다 새로 쌓여요.'}</Text>
        <EditorField label="독후감" value={text} limit={5000} onChangeText={setText} />
        <VisibilityNotice subject="독후감" visibility={visibility} />
        {error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
        <PrimaryButton label="독후감 저장" onPress={save} disabled={saved} />
        <SecondaryButton label="닫기" onPress={close} />
    </Screen></KeyboardAvoidingView>;
}
