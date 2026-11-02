import { useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Card, PrimaryButton, ProgressBar, Screen, SecondaryButton, StateView } from '../components';
import { kstDate } from '../domain/kstDate';
import { parseEndPage } from '../domain/pageRules';
import { readingCheckDue, timerTimeLabel } from '../domain/timerFlow';
import { elapsedMs } from '../domain/timerState';
import { colors, radii, sizes, spacing, typography } from '../theme';
import { useReadingTimer } from './useReadingTimer';

export default function ReadingScreen() {
    const { bookId } = useLocalSearchParams<{ bookId?: string }>();
    const reading = useReadingTimer(bookId);
    const [confirmation, setConfirmation] = useState<'reread' | 'complete' | null>(null);
    const [pageError, setPageError] = useState<string | null>(null);
    const { book, draft, saved, now } = reading;
    const home = () => router.dismissTo('/(tabs)');
    if (reading.loadError) return <Screen title="독서 시작"><StateView kind="error" message="타이머를 불러오지 못했어요. 저장된 기록을 보존하고 있어요." onRetry={reading.retry} /></Screen>;
    if (!reading.ready) return <Screen title="독서 시작"><StateView kind="loading" /></Screen>;
    if (!book) return <Screen title="독서 시작">{reading.notice && <Text style={styles.secondary}>{reading.notice}</Text>}<StateView kind="empty" message="책을 찾을 수 없어요. 책장에서 읽을 책을 선택해 주세요." /><SecondaryButton label="홈으로" onPress={home} /></Screen>;

    const timer = draft?.timer;
    const finished = timer?.finishedAtMs !== null && timer !== undefined;
    const paused = timer?.runningSinceMs === null;
    const checkDue = Boolean(draft && !saved && readingCheckDue(draft.timer, draft.confirmedChecks, now));
    const title = saved ? '저장 완료' : confirmation === 'complete' ? '완독하셨나요?' : finished ? '오늘 읽은 만큼' : timer ? paused ? '잠깐 쉬는 중이에요' : '독서 측정 중' : '독서 시작';
    const save = () => {
        if (!timer) return;
        const result = parseEndPage(timer.endPageDraft, timer.startPage, book.totalPages);
        if (result.kind === 'invalid') { setPageError(result.message); return; }
        setPageError(null);
        if (result.kind === 'reread') { setConfirmation('reread'); return; }
        if (result.kind === 'valid' && result.endPage === book.totalPages) { setConfirmation('complete'); return; }
        reading.save(false);
    };

    return <Screen title={title}>
        <Text style={styles.book}>{book.title}</Text>
        <Text style={styles.secondary}>{book.author}</Text>
        {draft && bookId && draft.timer.bookId !== bookId && <Text style={styles.secondary}>진행 중이던 책의 독서를 이어서 보여 드려요.</Text>}
        {timer && <Card><Text style={styles.secondary}>오늘 독서한 시간</Text><Text accessibilityLabel={`독서 시간 ${timerTimeLabel(elapsedMs(timer, now))}`} style={styles.time}>{timerTimeLabel(elapsedMs(timer, now))}</Text><Text style={styles.secondary}>시작한 쪽 · {timer.startPage}쪽</Text></Card>}
        <ProgressBar currentPage={book.currentPage} totalPages={book.totalPages} />
        {reading.notice && <Text style={styles.secondary}>{reading.notice}</Text>}
        {reading.error && <StateView kind="error" message={reading.error} />}
        {pageError && <View accessibilityRole="alert"><Text style={styles.error}>페이지를 확인해 주세요</Text><Text style={styles.error}>{pageError}</Text></View>}

        {/* S-40: 지난 쪽 자동 입력, 수정 가능 */}
        {!timer && <><PageField label="시작 쪽" value={reading.startPage} onChange={reading.setStartPage} /><Text style={styles.secondary}>지난번 읽은 쪽을 넣어 두었어요. 다른 쪽부터 읽으셔도 괜찮아요.</Text><PrimaryButton label="독서 시작" onPress={reading.start} /><SecondaryButton label="홈으로" onPress={home} /></>}

        {/* S-41·42: 일시정지에서도 마치기와 재개만 제공하며 기록은 버리지 않는다. */}
        {timer && !finished && !saved && <><PageField label="지금 읽는 쪽 (선택)" value={timer.endPageDraft} onChange={reading.setEndPage} /><PrimaryButton label={paused ? '계속 읽기' : '잠깐 쉬기'} onPress={paused ? reading.resume : reading.pause} /><SecondaryButton label="마치기" onPress={reading.finish} /><SecondaryButton label="홈으로" onPress={home} /></>}

        {/* S-43·44·E-02 */}
        {timer && finished && !saved && confirmation === null && <><PageField label="마지막으로 읽은 쪽 (선택)" value={timer.endPageDraft} onChange={text => { setPageError(null); reading.setEndPage(text); }} /><Text style={styles.secondary}>빈칸으로 두시면 독서 시간만 저장해요.</Text><PrimaryButton label="저장" onPress={save} /></>}
        {!saved && confirmation === 'reread' && <><Text style={styles.body}>시작 쪽보다 앞쪽을 입력하셨어요. 되돌아 읽은 기록으로 저장할까요? 읽은 쪽수는 0쪽으로 집계해요.</Text><PrimaryButton label="되돌아 읽기로 저장" onPress={() => reading.save(false)} /><SecondaryButton label="쪽 다시 입력" onPress={() => setConfirmation(null)} /></>}
        {!saved && confirmation === 'complete' && <><Text style={styles.body}>마지막 쪽까지 읽으셨어요. 완독한 책으로 표시할까요?</Text><PrimaryButton label="완독으로 저장" onPress={() => reading.save(true)} /><SecondaryButton label="아직 읽는 중으로 저장" onPress={() => reading.save(false)} /><SecondaryButton label="쪽 다시 입력" onPress={() => setConfirmation(null)} /></>}

        {/* S-45: 날짜별 라우트 도입 전에는 캘린더 탭에 날짜를 전달한다. */}
        {saved && timer && <><Text style={styles.body}>독서 기록을 기기에 저장했어요. 연결되면 자동으로 동기화해요.</Text><PrimaryButton label="캘린더에서 보기" onPress={() => router.dismissTo({ pathname: '/(tabs)/calendar', params: { date: kstDate(timer.startedAtMs) } })} /><SecondaryButton label="홈으로" onPress={home} /></>}

        {/* S-46 / NFR-08: 알림 권한과 독립된 앱 안 대화상자 */}
        <Modal visible={checkDue} animationType="none" onRequestClose={() => reading.confirmCheck(false)}>
            <Screen title="계속 읽고 계신가요?">
                <Text style={styles.body}>90분 동안 읽으셨어요. 확인하시는 동안 타이머를 잠시 멈췄어요.</Text>
                <PrimaryButton label="계속 읽고 있어요" onPress={() => reading.confirmCheck(true)} />
                <SecondaryButton label="잠깐 쉴게요" onPress={() => reading.confirmCheck(false)} />
            </Screen>
        </Modal>
    </Screen>;
}

function PageField({ label, value, onChange }: { label: string; value: string; onChange: (text: string) => void }) {
    return <View style={styles.field}><Text style={styles.body}>{label}</Text><TextInput accessibilityRole="none" accessibilityLabel={label} keyboardType="number-pad" value={value} onChangeText={onChange} style={styles.input} /></View>;
}

const styles = StyleSheet.create({
    book: { ...typography.title, color: colors.brand.espresso },
    body: { ...typography.body, color: colors.brand.espresso },
    secondary: { ...typography.bodySmall, color: colors.text.muted },
    time: { ...typography.heading, color: colors.brand.espresso, fontVariant: ['tabular-nums'] },
    error: { ...typography.bodySmall, color: colors.state.error },
    field: { gap: spacing.sm },
    input: { ...typography.body, color: colors.brand.espresso, backgroundColor: colors.surface.card, minHeight: sizes.minTouch, padding: spacing.md, borderWidth: 1, borderColor: colors.line.border, borderRadius: radii.small },
});
