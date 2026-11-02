import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, PrimaryButton, ProgressBar, Screen, SecondaryButton, StateView } from '../components';
import { colors, radii, sizes, spacing, typography } from '../theme';
import { useHomeRecords } from './useHomeRecords';

export function HomeView() {
    const router = useRouter();
    const { records, streak, weekSeconds, retry } = useHomeRecords();
    const [selectedId, setSelectedId] = useState<string>();
    const readingBooks = records.kind === 'ready' ? records.books.filter(book => book.status === 'READING') : [];
    const selected = readingBooks.find(book => book.id === selectedId) ?? readingBooks[0];

    return (
        <Screen title="홈">
            <Text style={styles.intro}>독파민과 오늘도 한 쪽을 이어 가세요.</Text>
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
                                {weekSeconds < 60 ? `${weekSeconds}초` : `${Math.floor(weekSeconds / 3600)}시간 ${Math.floor(weekSeconds % 3600 / 60)}분`}
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
                                {readingBooks.map(book => {
                                    const checked = book.id === selected?.id;
                                    return (
                                        <View key={book.id} style={[styles.book, checked && styles.selectedBook]}>
                                            <Pressable
                                                accessibilityRole="radio"
                                                accessibilityLabel={`${book.title}, ${book.author}`}
                                                accessibilityState={{ checked }}
                                                onPress={() => setSelectedId(book.id)}
                                                style={({ pressed }) => [styles.bookChoice, pressed && styles.pressed]}
                                            >
                                                <Text style={styles.bookTitle}>{book.title}</Text>
                                                <Text style={styles.label}>{book.author}</Text>
                                                <Text style={styles.selection}>{checked ? '선택됨' : '이 책 선택하기'}</Text>
                                            </Pressable>
                                            <ProgressBar currentPage={book.currentPage} totalPages={book.totalPages} />
                                        </View>
                                    );
                                })}
                            </View>
                            <PrimaryButton label="독서 시작하기" accessibilityLabel={`${selected?.title} 독서 시작하기`} onPress={() => {
                                if (selected) router.push(`/reading-start?bookId=${selected.id}` as Href);
                            }} />
                        </>
                    )
                )}
                <SecondaryButton label="책 등록하기" onPress={() => router.push('/book-add')} />
                <SecondaryButton label="읽고 싶은 책 등록하기" onPress={() => router.push('/book-add?want=1')} />
            </View>

            <Card>
                <Text accessibilityRole="header" style={styles.heading}>오늘의 명언</Text>
                <Text style={styles.quote}>오늘 읽은 한 쪽이 내일의 나를 만듭니다.</Text>
                <Text style={styles.label}>독파민</Text>
            </Card>
        </Screen>
    );
}

const styles = StyleSheet.create({
    intro: { ...typography.body, color: colors.text.muted },
    section: { gap: spacing.md },
    heading: { ...typography.title, color: colors.brand.espresso },
    stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    stat: { flex: 1, flexBasis: sizes.minTouch * 2, backgroundColor: colors.surface.sandSoft, borderRadius: radii.card, padding: spacing.lg, gap: spacing.sm },
    label: { ...typography.bodySmall, color: colors.text.muted },
    value: { ...typography.titleLarge, color: colors.brand.espresso, fontVariant: ['tabular-nums'] },
    books: { gap: spacing.md },
    book: { backgroundColor: colors.surface.card, borderRadius: radii.card, borderWidth: 1, borderColor: colors.line.border, padding: spacing.lg, gap: spacing.sm },
    selectedBook: { borderColor: colors.brand.espresso },
    bookChoice: { minHeight: sizes.minTouch, minWidth: sizes.minTouch, gap: spacing.xs, paddingVertical: spacing.sm },
    bookTitle: { ...typography.titleSmall, color: colors.brand.espresso },
    selection: { ...typography.label, color: colors.brand.espresso },
    pressed: { backgroundColor: colors.surface.chip },
    quote: { ...typography.body, color: colors.brand.espresso },
});
