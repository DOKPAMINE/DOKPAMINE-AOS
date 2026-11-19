import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, PrimaryButton, ProgressBar, Screen, SecondaryButton, StateView } from '../components';
import { beginReading, completeReading, readingTimeLabel } from '../domain/shelfRules';
import { bookOneLine } from '../domain/reviewRules';
import type { BookRecord } from '../db/schema';
import type { RecordRepository } from '../db/repository';
import { BookCover } from './BookCover';
import { BookStatus } from './BookStatus';
import { useShelfRepository } from './useShelfRepository';
import { shelfStyles as styles } from './styles';
import { colors, sizes, spacing, typography } from '../theme';

export function BookDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { repository, error, retry } = useShelfRepository();
    if (error || !repository) return <Screen title="책 상세"><StateView kind={error ? 'error' : 'loading'} onRetry={error ? retry : undefined} /></Screen>;
    const book = repository.books.get(id);
    if (!book) return <Screen title="책 상세"><StateView kind="empty" message="책을 찾을 수 없어요. 삭제된 책인지 확인해 주세요." /><SecondaryButton label="책장으로" onPress={() => router.dismissTo('/shelf')} /></Screen>;
    return <BookDetail book={book} repository={repository} />;
}

function BookDetail({ book, repository }: { book: BookRecord; repository: RecordRepository }) {
    const [notice, setNotice] = useState<string | null>(null);
    const sessions = repository.sessions.list({ bookId: book.id });
    const review = bookOneLine(repository.reviews.list({ bookId: book.id }).filter(row => !row.conflict));
    const timeLabel = readingTimeLabel(sessions);
    const reviewLabel = review?.oneLine ?? '아직 남긴 한줄평이 없어요.';
    // 타이머 화면은 후속 단계 소유이며 bookId 계약만 연결한다.
    const read = () => router.push({ pathname: '/reading-start', params: { bookId: book.id } } as Href);
    const openRecords = () => router.push({ pathname: '/book/[id]/records', params: { id: book.id } });
    const openReview = () => router.push({ pathname: '/book/[id]/review', params: { id: book.id } } as Href);
    const openEdit = () => router.push({ pathname: '/book/[id]/edit', params: { id: book.id } });
    const changeStatus = (complete: boolean) => {
        try {
            const latest = repository.books.get(book.id);
            if (!latest) throw new Error('책을 찾을 수 없어요.');
            repository.books.save(complete ? completeReading(latest, Date.now()) : beginReading(latest));
            setNotice(null);
            if (!complete) read();
        } catch {
            setNotice('변경하지 못했어요. 기기 저장 공간을 확인하고 다시 시도해 주세요.');
        }
    };
    const done = book.status === 'DONE';
    // FR-04 / S-31: 실수로 누르지 않도록 확인 후 완독 처리한다. 다시 읽기는 아래 "다시 읽기" 버튼으로 한다.
    const confirmComplete = () => Alert.alert('완독으로 표시할까요?', `「${book.title}」을(를) 다 읽은 책으로 옮겨요.`, [
        { text: '취소', style: 'cancel' },
        { text: '완독', onPress: () => changeStatus(true) },
    ]);
    return <Screen title={book.title}>
        <Card>
            <View style={local.cardHeader}>
                <BookStatus status={book.status} />
                <Pressable accessibilityRole="button" accessibilityLabel="정보 편집" onPress={openEdit}
                    style={({ pressed }) => [local.editButton, pressed && styles.pressed]}>
                    <MaterialCommunityIcons name="pencil-outline" color={colors.brand.espresso} size={sizes.icon * 0.75} accessible={false} />
                    <Text style={styles.label}>편집</Text>
                </Pressable>
            </View>
            <View style={local.infoRow}>
                <View style={local.infoText}>
                    <Text style={styles.body}>{book.author}</Text>
                    <Text style={styles.muted}>{book.publisher ?? '출판사 정보가 없어요'}</Text>
                    <Text style={styles.muted}>{book.genre} · {book.totalPages}쪽</Text>
                </View>
                <BookCover key={book.coverUrl ?? 'none'} uri={book.coverUrl} genre={book.genre} width={sizes.minTouch * 2} />
            </View>
        </Card>
        {book.status !== 'WANT' && <Card>
            <View style={local.cardHeader}>
                <Text accessibilityRole="header" style={styles.title}>독서 현황</Text>
                <Pressable accessibilityRole="checkbox" accessibilityLabel="완독으로 표시" accessibilityState={{ checked: done, disabled: done }}
                    disabled={done} onPress={confirmComplete} style={({ pressed }) => [local.checkButton, pressed && styles.pressed]}>
                    <MaterialCommunityIcons name={done ? 'checkbox-marked' : 'checkbox-blank-outline'} color={colors.brand.espresso} size={sizes.icon} accessible={false} />
                    <Text style={styles.label}>{done ? '완독함' : '완독으로 표시'}</Text>
                </Pressable>
            </View>
            <ProgressBar currentPage={book.currentPage} totalPages={book.totalPages} />
            <Pressable accessibilityRole="button" accessibilityLabel="기록 보기" accessibilityHint={`누적 독서 시간 ${timeLabel}`}
                onPress={openRecords} style={({ pressed }) => [local.linkRow, pressed && styles.pressed]}>
                <View style={local.linkText}>
                    <Text style={styles.body}>누적 독서 시간 · {timeLabel}</Text>
                </View>
                <Text accessible={false} style={local.chevron}>{'›'}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="감상과 문장" accessibilityHint={`한줄평 ${reviewLabel}`}
                onPress={openReview} style={({ pressed }) => [local.linkRow, pressed && styles.pressed]}>
                <View style={local.linkText}>
                    <Text style={styles.label}>한줄평</Text>
                    <Text style={styles.body}>{reviewLabel}</Text>
                </View>
                <Text accessible={false} style={local.chevron}>{'›'}</Text>
            </Pressable>
        </Card>}
        {notice && <Text accessibilityRole="alert" style={styles.error}>{notice}</Text>}
        {book.status === 'WANT' && <PrimaryButton label="읽기 시작" onPress={() => changeStatus(false)} />}
        {book.status === 'DONE' && <PrimaryButton label="다시 읽기" onPress={() => changeStatus(false)} />}
        {book.status === 'READING' && <>
            <PrimaryButton label="이어서 읽기" onPress={read} />
        </>}
        <SecondaryButton label="책장으로" onPress={() => router.dismissTo('/shelf')} />
    </Screen>;
}

const local = StyleSheet.create({
    cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    editButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, minHeight: sizes.minTouch, minWidth: sizes.minTouch, paddingHorizontal: spacing.sm },
    checkButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: sizes.minTouch, paddingHorizontal: spacing.xs },
    infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg },
    infoText: { flex: 1, gap: spacing.sm },
    linkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: sizes.minTouch, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line.border },
    linkText: { flex: 1, gap: spacing.xs },
    chevron: { ...typography.heading, color: colors.text.muted },
});
