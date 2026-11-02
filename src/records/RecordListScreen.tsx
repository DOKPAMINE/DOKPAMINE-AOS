import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, Text, View } from 'react-native';
import { Card, PrimaryButton, Screen, SecondaryButton, StateView } from '../components';
import { newestRecords, recordDateTime } from '../domain/recordRules';
import { readingTimeLabel } from '../domain/shelfRules';
import { useShelfRepository } from '../shelf/useShelfRepository';
import { prepareRecordDelete } from './service';
import { recordStyles as styles } from './styles';

export function RecordListScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { repository, error, retry } = useShelfRepository();
    const [notice, setNotice] = useState<string | null>(null);
    const [pendingDelete, setPendingDelete] = useState<(() => void) | null>(null);
    if (error || !repository) return <Screen title="독서 기록"><StateView kind={error ? 'error' : 'loading'} onRetry={error ? retry : undefined} /></Screen>;
    const book = repository.books.get(id);
    const detail = () => router.dismissTo({ pathname: '/book/[id]', params: { id } });
    if (!book) return <Screen title="독서 기록"><StateView kind="empty" message="책을 찾을 수 없어요." /><SecondaryButton label="책장으로" onPress={() => router.dismissTo('/shelf')} /></Screen>;
    const records = newestRecords(repository.sessions.list({ bookId: id }));
    const remove = (operation = pendingDelete) => {
        try { operation?.(); setPendingDelete(null); setNotice(null); }
        catch { setPendingDelete(() => operation); setNotice('삭제를 마무리하지 못했어요. 기기 저장 공간을 확인하고 다시 시도해 주세요.'); }
    };
    const confirmDelete = (recordId: string) => Alert.alert('독서 기록을 삭제할까요?', '이 기록의 독서 시간과 쪽수가 통계에서 제외돼요. 삭제한 기록은 되돌릴 수 없어요.', [
        { text: '취소', style: 'cancel' },
        { text: '삭제', style: 'destructive', onPress: () => {
            try { remove(prepareRecordDelete(repository, id, recordId)); }
            catch { setNotice('삭제할 기록을 찾을 수 없어요.'); }
        } },
    ]);
    return <Screen title="독서 기록">
        <Text style={styles.label}>{book.title}</Text>
        <Text style={styles.muted}>최신순 · {records.length}건 · {readingTimeLabel(records)}</Text>
        <PrimaryButton label="기록 직접 추가" disabled={!!pendingDelete} onPress={() => router.push({ pathname: '/book/[id]/records/new', params: { id } })} />
        {notice && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{notice}</Text>}
        {pendingDelete && <SecondaryButton label="삭제 다시 시도" onPress={() => remove()} />}
        {records.length === 0 && <StateView kind="empty" message="아직 독서 기록이 없어요. 읽은 시간을 직접 남겨 보세요." />}
        {records.map(record => {
            const { date, time } = recordDateTime(record.startedAt);
            const label = `${date} ${time}`;
            return <Card key={record.id}>
                <Text accessibilityRole="header" style={styles.label}>{label}</Text>
                <Text style={styles.body}>{readingTimeLabel([record])}</Text>
                <Text style={styles.body}>{record.endPage === null ? `${record.startPage}쪽 시작 · 시간만 기록` : `${record.startPage} → ${record.endPage}쪽`}</Text>
                <Text style={styles.muted}>{record.source === 'MANUAL' ? '직접 추가·수정 · 랭킹에서 제외됩니다' : '타이머 기록'}{record.syncPending ? ' · 전송 대기' : ''}</Text>
                <View style={styles.row}>
                    <Pressable accessibilityRole="button" accessibilityLabel={`${label} 기록 수정`} accessibilityState={{ disabled: !!pendingDelete }} disabled={!!pendingDelete}
                        onPress={() => router.push({ pathname: '/book/[id]/records/[recordId]', params: { id, recordId: record.id } })}
                        style={({ pressed }) => [styles.action, pressed && styles.pressed]}><Text style={styles.label}>수정</Text></Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={`${label} 기록 삭제`} accessibilityState={{ disabled: !!pendingDelete }} disabled={!!pendingDelete}
                        onPress={() => confirmDelete(record.id)} style={({ pressed }) => [styles.action, pressed && styles.pressed]}><Text style={styles.label}>삭제</Text></Pressable>
                </View>
            </Card>;
        })}
        <SecondaryButton label="책 상세로" onPress={detail} />
    </Screen>;
}
