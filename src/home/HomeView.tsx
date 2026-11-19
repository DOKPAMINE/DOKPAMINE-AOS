import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton, Screen, SecondaryButton, StateView } from '../components';
import { colors, radii, sizes, spacing, typography } from '../theme';
import { clampHomePage, homePageBooks, homePageCount, homePageOf, readingPercent } from '../domain/homeBooks';
import { formatWeekTime } from '../domain/homeTime';
import { BookCover } from '../shelf/BookCover';
import { useHomeRecords } from './useHomeRecords';

export function HomeView() {
    const router = useRouter();
    const { records, streak, weekSeconds, retry } = useHomeRecords();
    const [selectedId, setSelectedId] = useState<string>();
    const [page, setPage] = useState<number>();
    const readingBooks = records.kind === 'ready' ? records.books.filter(book => book.status === 'READING') : [];
    const selected = readingBooks.find(book => book.id === selectedId) ?? readingBooks[0];

    // S-10: 처음에는 선택된 책이 있는 페이지, 넘긴 뒤에는 넘긴 페이지를 보여 준다.
    const pageCount = homePageCount(readingBooks.length);
    const currentPage = clampHomePage(page ?? homePageOf(readingBooks.findIndex(book => book.id === selected?.id)), readingBooks.length);
    const pageBooks = homePageBooks(readingBooks, currentPage);
    const isFirst = currentPage === 0;
    const isLast = currentPage === pageCount - 1;

    return (
        <Screen title="홈">
            <View style={styles.section}>
                <Text accessibilityRole="header" style={styles.heading}>나의 독서</Text>
                {records.kind === 'ready' ? (
                    <View style={styles.stats}>
                        <View style={styles.stat}>
                            <Text style={styles.label}>연속 독서일</Text>
                            <Text style={styles.value}>{streak}일</Text>
                        </View>
                        <View style={styles.stat}>
                            <Text style={styles.label}>이번 주 읽은 시간</Text>
                            <Text style={styles.value}>
                                {formatWeekTime(weekSeconds)}
                            </Text>
                        </View>
                    </View>
                ) : <StateView kind={records.kind} message={records.kind === 'loading' ? '독서 기록을 불러오고 있어요.' : '독서 기록을 불러오지 못했어요.'} onRetry={records.kind === 'error' ? retry : undefined} />}
            </View>

            <View style={styles.section}>
                <Text accessibilityRole="header" style={styles.heading}>읽는 중인 책</Text>
                {records.kind === 'ready' && (
                    readingBooks.length === 0 ? (
                        <StateView kind="empty" message={records.books.length === 0 ? '아직 등록한 책이 없어요. 첫 책을 등록해 주세요.' : '읽는 중인 책이 없어요. 읽을 책을 등록해 주세요.'} />
                    ) : (
                        <>
                            <View accessibilityRole="radiogroup" accessibilityLabel="독서를 시작할 책 선택" style={styles.books}>
                                {pageBooks.map(book => {
                                    const checked = book.id === selected?.id;
                                    const percent = readingPercent(book.currentPage, book.totalPages);
                                    return (
                                        <View key={book.id} style={[styles.book, checked && styles.selectedBook]}>
                                            <View style={styles.bookInfo}>
                                                <Pressable
                                                    accessibilityRole="radio"
                                                    accessibilityLabel={`${book.title}, ${book.author}`}
                                                    accessibilityState={{ checked }}
                                                    onPress={() => setSelectedId(book.id)}
                                                    style={({ pressed }) => [styles.bookChoice, pressed && styles.bookPressed]}
                                                >
                                                    <Text numberOfLines={2} style={styles.bookTitle}>{book.title}</Text>
                                                    <Text numberOfLines={1} style={styles.label}>{book.author}</Text>
                                                </Pressable>
                                                <View accessible accessibilityRole="progressbar" accessibilityLabel="독서 진행"
                                                    accessibilityValue={{ min: 0, max: 100, now: percent, text: `${percent}%, ${book.currentPage} / ${book.totalPages}쪽` }}
                                                    style={styles.progressRow}>
                                                    <View style={styles.track}>
                                                        <View style={[styles.fill, { width: `${percent}%` as const }]} />
                                                    </View>
                                                    <Text style={styles.percent}>{`${percent}%`}</Text>
                                                </View>
                                            </View>
                                            <Pressable accessible={false} onPress={() => setSelectedId(book.id)}
                                                style={({ pressed }) => pressed && styles.bookPressed}>
                                                <BookCover key={book.coverUrl ?? 'none'} uri={book.coverUrl} genre={book.genre} width={sizes.minTouch * 1.5} />
                                            </Pressable>
                                        </View>
                                    );
                                })}
                            </View>
                            {pageCount > 1 && (
                                <View style={styles.pager}>
                                    <Pressable
                                        accessibilityRole="button"
                                        accessibilityLabel="이전 페이지"
                                        accessibilityState={{ disabled: isFirst }}
                                        disabled={isFirst}
                                        onPress={() => setPage(currentPage - 1)}
                                        style={({ pressed }) => [styles.pageButton, isFirst && styles.pageDisabled, pressed && styles.pressed]}
                                    >
                                        <Text accessible={false} style={styles.pageArrow}>{'‹'}</Text>
                                    </Pressable>
                                    <Text accessibilityLabel={`읽는 중인 책 ${pageCount}페이지 중 ${currentPage + 1}페이지`} style={styles.pageText}>
                                        {`${currentPage + 1} / ${pageCount}`}
                                    </Text>
                                    <Pressable
                                        accessibilityRole="button"
                                        accessibilityLabel="다음 페이지"
                                        accessibilityState={{ disabled: isLast }}
                                        disabled={isLast}
                                        onPress={() => setPage(currentPage + 1)}
                                        style={({ pressed }) => [styles.pageButton, isLast && styles.pageDisabled, pressed && styles.pressed]}
                                    >
                                        <Text accessible={false} style={styles.pageArrow}>{'›'}</Text>
                                    </Pressable>
                                </View>
                            )}
                            <PrimaryButton label="독서 시작하기" accessibilityLabel={`${selected?.title} 독서 시작하기`} onPress={() => {
                                if (selected) router.push(`/reading-start?bookId=${selected.id}` as Href);
                            }} />
                        </>
                    )
                )}
                <SecondaryButton label="책 등록하기" onPress={() => router.push('/book-add')} />
            </View>
        </Screen>
    );
}

const styles = StyleSheet.create({
    section: { gap: spacing.md },
    heading: { ...typography.title, color: colors.brand.espresso },
    stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    stat: { flex: 1, flexBasis: sizes.minTouch * 2, backgroundColor: colors.surface.sandSoft, borderRadius: radii.card, padding: spacing.lg, gap: spacing.sm },
    label: { ...typography.bodySmall, color: colors.text.muted },
    value: { ...typography.titleLarge, color: colors.brand.espresso, fontVariant: ['tabular-nums'] },
    books: { gap: spacing.md },
    book: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface.card, borderRadius: radii.card, borderWidth: 1, borderColor: colors.line.border, padding: spacing.lg, gap: spacing.lg },
    bookInfo: { flex: 1, gap: spacing.sm },
    selectedBook: { borderColor: colors.brand.espresso, backgroundColor: colors.surface.sandSoft },
    bookChoice: { minHeight: sizes.minTouch, minWidth: sizes.minTouch, gap: spacing.xs, paddingVertical: spacing.sm },
    bookTitle: { ...typography.titleSmall, color: colors.brand.espresso },
    pressed: { backgroundColor: colors.surface.chip },
    bookPressed: { opacity: 0.6 },
    progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    track: { flex: 1, height: spacing.sm, borderRadius: radii.pill, backgroundColor: colors.brand.sand, overflow: 'hidden' },
    fill: { height: '100%', borderRadius: radii.pill, backgroundColor: colors.text.muted },
    percent: { ...typography.label, color: colors.brand.espresso, fontVariant: ['tabular-nums'] },    pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
    pageButton: { minWidth: sizes.minTouch, minHeight: sizes.minTouch, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill, backgroundColor: colors.surface.chip },
    pageDisabled: { opacity: 0.4 },
    pageText: { ...typography.label, color: colors.brand.espresso, fontVariant: ['tabular-nums'] },
    pageArrow: { ...typography.heading, color: colors.brand.espresso },
});
