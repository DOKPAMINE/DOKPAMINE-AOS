import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, StateView } from '../../src/components';
import type { Genre } from '../../src/domain/pageRules';
import { countShelfGenres, countShelfStatuses, filterShelfBooks, filterShelfGenre, groupShelfBooks, toggleShelfFilter, type ShelfStatus } from '../../src/domain/shelfRules';
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

/** S-30: 고른 상태·장르에 맞는 책이 없을 때 보여 줄 안내 문구 */
function emptyMessage(status: ShelfStatus | null, genre: Genre | null) {
    if (status !== null && genre !== null) return '고른 조건에 맞는 책이 없어요. 다른 장르나 상태를 골라 보세요.';
    if (genre !== null) return `${genre} 책이 없어요.`;
    return status !== null ? emptyFilterMessages[status] : '';
}

// S-30 책장 · FR-04, FR-17
export default function ShelfScreen() {
    const insets = useSafeAreaInsets();
    const { repository, error, retry } = useShelfRepository();
    const [filter, setFilter] = useState<ShelfStatus | null>(null);
    const [genre, setGenre] = useState<Genre | null>(null);
    const [genreSheetOpen, setGenreSheetOpen] = useState(false);

    const books = repository ? repository.books.list() : [];
    const counts = countShelfStatuses(books);
    const total = counts.READING + counts.DONE + counts.WANT;
    const statusBooks = filterShelfBooks(books, filter);
    const genreCounts = countShelfGenres(statusBooks);
    const genreOptions: { genre: Genre | null; count: number }[] = [
        { genre: null, count: genreCounts.reduce((sum, item) => sum + item.count, 0) },
        ...genreCounts,
    ];
    const groups = groupShelfBooks(filterShelfGenre(statusBooks, genre));
    const genreLabel = genre ?? '전체';

    const chooseGenre = (next: Genre | null) => {
        setGenre(next);
        setGenreSheetOpen(false);
    };

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

        <Pressable accessibilityRole="button" accessibilityState={{ expanded: genreSheetOpen }}
            accessibilityLabel={`장르 선택, 지금은 ${genreLabel}`}
            onPress={() => setGenreSheetOpen(true)}
            style={({ pressed }) => [shelfStyles.choice, styles.genreButton, genre !== null && shelfStyles.selected, pressed && shelfStyles.pressed]}>
            <MaterialCommunityIcons name="shape-outline" color={colors.brand.espresso} size={sizes.icon * 0.75} accessible={false} />
            <Text style={[styles.genreButtonText, genre !== null && styles.filterTextSelected]}>장르: {genreLabel}</Text>
            <MaterialCommunityIcons name="chevron-down" color={colors.brand.espresso} size={sizes.icon} accessible={false} />
        </Pressable>

        {(filter !== null || genre !== null) && groups.length === 0 ? <StateView kind="empty" message={emptyMessage(filter, genre)} /> :
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

        <Modal visible={genreSheetOpen} transparent animationType="slide" onRequestClose={() => setGenreSheetOpen(false)}>
            <View style={styles.sheetRoot}>
                <Pressable style={styles.backdrop} accessibilityRole="button" accessibilityLabel="장르 선택 닫기" onPress={() => setGenreSheetOpen(false)} />
                <View accessibilityViewIsModal style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
                    <Text accessibilityRole="header" style={shelfStyles.title}>장르 선택</Text>
                    <ScrollView style={styles.sheetList}>
                        {genreOptions.map(option => {
                            const selected = genre === option.genre;
                            const name = option.genre ?? '전체';
                            return <Pressable key={name} accessibilityRole="button" accessibilityState={{ selected }}
                                accessibilityLabel={`${name} ${option.count}권`}
                                onPress={() => chooseGenre(option.genre)}
                                style={({ pressed }) => [styles.option, pressed && shelfStyles.pressed]}>
                                <Text style={[shelfStyles.body, selected && styles.optionSelected]}>{name}</Text>
                                <View style={styles.optionRight}>
                                    <Text style={shelfStyles.muted}>{option.count}권</Text>
                                    {selected
                                        ? <MaterialCommunityIcons name="check" color={colors.brand.espresso} size={sizes.icon} accessible={false} />
                                        : <View style={styles.checkSpace} />}
                                </View>
                            </Pressable>;
                        })}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    </>;

    return <Screen title="책장">{content}</Screen>;
}

const styles = StyleSheet.create({
    filters: { flexDirection: 'row', gap: spacing.sm },
    filter: { flex: 1, alignItems: 'center', paddingHorizontal: spacing.xs },
    filterInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
    filterText: { ...typography.caption, color: colors.brand.espresso, flexShrink: 1 },
    filterTextSelected: { fontFamily: typography.heading.fontFamily },
    genreButton: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: spacing.sm },
    genreButtonText: { ...typography.label, color: colors.brand.espresso },
    books: { gap: spacing.xs, alignItems: 'flex-end', paddingHorizontal: spacing.xs },
    spine: { width: sizes.minTouch, minHeight: sizes.minTouch * 4, paddingVertical: spacing.sm, gap: spacing.sm, alignItems: 'center', justifyContent: 'space-between', borderTopLeftRadius: radii.small, borderTopRightRadius: radii.small },
    spineTitle: { ...typography.caption, textAlign: 'center' },
    reading: { backgroundColor: colors.brand.espresso },
    done: { backgroundColor: colors.text.muted },
    want: { backgroundColor: colors.brand.sand },
    plank: { height: spacing.sm, backgroundColor: colors.brand.espresso, marginTop: -spacing.md },
    sheetRoot: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { ...StyleSheet.absoluteFill },
    sheet: { maxHeight: '70%', gap: spacing.md, paddingTop: spacing.xl, paddingHorizontal: spacing.xl, backgroundColor: colors.surface.paper, borderTopLeftRadius: radii.card, borderTopRightRadius: radii.card, borderWidth: 1, borderBottomWidth: 0, borderColor: colors.line.border },    option: { minHeight: sizes.minTouch, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.line.border },
    sheetList: { flexGrow: 0 },
    optionRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    optionSelected: { fontFamily: typography.heading.fontFamily },
    checkSpace: { width: sizes.icon },
});

const spineBackground = { READING: styles.reading, DONE: styles.done, WANT: styles.want } as const;
