import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Screen, StateView } from '../../src/components';
import { countShelfStatuses, filterShelfBooks, groupShelfBooks, toggleShelfFilter, type ShelfStatus } from '../../src/domain/shelfRules';
import { bookStatusIcons, bookStatusLabels } from '../../src/shelf/BookStatus';
import { useShelfRepository } from '../../src/shelf/useShelfRepository';
import { shelfStyles } from '../../src/shelf/styles';
import { colors, radii, sizes, spacing, typography } from '../../src/theme';

const FILTERS: readonly ShelfStatus[] = ['READING', 'DONE', 'WANT'];
const emptyFilterMessages: Record<ShelfStatus, string> = {
    READING: '읽는 중인 책이 없어요.',
    DONE: '아직 완독한 책이 없어요.',
    WANT: '읽고 싶은 책이 없어요.',
};
const spineInk: Record<ShelfStatus, string> = {
    READING: colors.surface.paper,
    DONE: colors.surface.paper,
    WANT: colors.brand.espresso,
};
const SPINE_CHARS = 9;

/** S-30: 책등에는 제목을 한 글자씩 세로로 쓰고, 길면 말줄임표로 줄인다. */
function spineTitle(title: string) {
    const chars = Array.from(title.replace(/\s+/g, ''));
    return (chars.length > SPINE_CHARS ? [...chars.slice(0, SPINE_CHARS - 1), '…'] : chars).join('\n');
}

// S-30 책장 · FR-04, FR-17
export default function ShelfScreen() {
    const { repository, error, retry } = useShelfRepository();
    const [filter, setFilter] = useState<ShelfStatus | null>(null);
    const books = repository ? repository.books.list() : [];
    const counts = countShelfStatuses(books);
    const total = counts.READING + counts.DONE + counts.WANT;
    const groups = groupShelfBooks(filterShelfBooks(books, filter));

    let content;
    if (error) content = <StateView kind="error" message="책장을 불러오지 못했어요." onRetry={retry} />;
    else if (!repository) content = <StateView kind="loading" />;
    else if (total === 0) content = <StateView kind="empty" message="아직 책장에 책이 없어요. 홈에서 읽는 책이나 읽고 싶은 책을 등록해 주세요." />;
    else content = <>
        <View style={styles.filters}>
            {FILTERS.map(status => {
                const selected = filter === status;
                return <Pressable key={status} accessibilityRole="button" accessibilityState={{ selected }}
                    accessibilityLabel={`${bookStatusLabels[status]} ${counts[status]}권`}
                    onPress={() => setFilter(current => toggleShelfFilter(current, status))}
                    style={({ pressed }) => [shelfStyles.choice, styles.filter, selected && shelfStyles.selected, pressed && shelfStyles.pressed]}>
                    <View style={styles.filterInner}>
                        <MaterialCommunityIcons name={bookStatusIcons[status]} color={colors.brand.espresso} size={sizes.icon * 0.75} accessible={false} />
                                                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[styles.filterText, selected && styles.filterTextSelected]}>
                                                    {selected ? '✓ ' : ''}{bookStatusLabels[status]}
                                                </Text>
                                                <Text numberOfLines={1} style={[styles.filterText, selected && styles.filterTextSelected]}>{counts[status]}</Text>
                    </View>
                </Pressable>;
            })}
        </View>
        {filter !== null && groups.length === 0 ? <StateView kind="empty" message={emptyFilterMessages[filter]} /> :
            groups.map(group => <View key={group.genre} style={shelfStyles.section}>
                <Text accessibilityRole="header" style={shelfStyles.title}>{group.genre} · {group.books.length}권</Text>
                <ScrollView horizontal contentContainerStyle={styles.books}>
                    {group.books.map(book => <Pressable key={book.id} accessibilityRole="button"
                        accessibilityLabel={`${book.title}, ${book.author}, ${bookStatusLabels[book.status]}, 책 상세 보기`}
                        onPress={() => router.push({ pathname: '/book/[id]', params: { id: book.id } })}
                        style={({ pressed }) => [styles.spine, spineBackground[book.status], pressed && shelfStyles.pressed]}>
                        <Text style={[styles.spineTitle, { color: spineInk[book.status] }]}>{spineTitle(book.title)}</Text>
                        <MaterialCommunityIcons name={bookStatusIcons[book.status]} color={spineInk[book.status]} size={sizes.icon} accessible={false} />
                    </Pressable>)}
                </ScrollView>
                <View style={styles.plank} />
            </View>)}
    </>;

    return <Screen title="책장">{content}</Screen>;
}

const styles = StyleSheet.create({
    filters: { flexDirection: 'row', gap: spacing.sm },
    filter: { flex: 1, alignItems: 'center', paddingHorizontal: spacing.xs },
    filterInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
    filterText: { ...typography.caption, color: colors.brand.espresso, flexShrink: 1 },
    filterTextSelected: { fontFamily: typography.heading.fontFamily },
    books: { gap: spacing.xs, alignItems: 'flex-end', paddingHorizontal: spacing.xs },
    spine: { width: sizes.minTouch, minHeight: sizes.minTouch * 4, paddingVertical: spacing.sm, gap: spacing.sm, alignItems: 'center', justifyContent: 'space-between', borderTopLeftRadius: radii.small, borderTopRightRadius: radii.small },
    spineTitle: { ...typography.caption, textAlign: 'center' },
    reading: { backgroundColor: colors.brand.espresso },
    done: { backgroundColor: colors.text.muted },
    want: { backgroundColor: colors.brand.sand },
    plank: { height: spacing.sm, backgroundColor: colors.brand.espresso, marginTop: -spacing.md },
});

const spineBackground = { READING: styles.reading, DONE: styles.done, WANT: styles.want } as const;
