import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Screen, StateView } from '../../src/components';
import { groupShelfBooks } from '../../src/domain/shelfRules';
import { BookStatus, bookStatusLabels } from '../../src/shelf/BookStatus';
import { useShelfRepository } from '../../src/shelf/useShelfRepository';
import { shelfStyles } from '../../src/shelf/styles';
import { colors, radii, sizes, spacing } from '../../src/theme';

// S-30 책장 · FR-04
export default function ShelfScreen() {
    const { repository, error, retry } = useShelfRepository();
    const groups = repository ? groupShelfBooks(repository.books.list()) : [];
    return <Screen title="책장">
        {error ? <StateView kind="error" message="책장을 불러오지 못했어요." onRetry={retry} /> : !repository ? <StateView kind="loading" /> : groups.length === 0 ?
            <StateView kind="empty" message="아직 책장에 책이 없어요. 홈에서 읽는 책이나 읽고 싶은 책을 등록해 주세요." /> :
            groups.map(group => <View key={group.genre} style={shelfStyles.section}>
                <Text accessibilityRole="header" style={shelfStyles.title}>{group.genre} · {group.books.length}권</Text>
                <ScrollView horizontal contentContainerStyle={styles.books}>
                    {group.books.map(book => <Pressable key={book.id} accessibilityRole="button"
                        accessibilityLabel={`${book.title}, ${book.author}, ${bookStatusLabels[book.status]}, 책 상세 보기`}
                        onPress={() => router.push({ pathname: '/book/[id]', params: { id: book.id } })}
                        style={({ pressed }) => [styles.spine, book.status === 'DONE' && styles.done, pressed && shelfStyles.pressed]}>
                        <Text style={shelfStyles.title} numberOfLines={4}>{book.title}</Text>
                        <Text style={shelfStyles.muted} numberOfLines={2}>{book.author}</Text>
                        <BookStatus status={book.status} />
                    </Pressable>)}
                </ScrollView>
                <View style={styles.plank} />
            </View>)}
    </Screen>;
}

const styles = StyleSheet.create({
    books: { gap: spacing.sm, alignItems: 'stretch' },
    spine: { width: sizes.minTouch * 3, minHeight: sizes.minTouch * 5, padding: spacing.md, gap: spacing.md, justifyContent: 'space-between', borderTopLeftRadius: radii.small, borderTopRightRadius: radii.small, backgroundColor: colors.brand.sand, borderLeftWidth: spacing.xs, borderLeftColor: colors.text.muted },
    done: { backgroundColor: colors.surface.sandSoft },
    plank: { height: spacing.sm, backgroundColor: colors.brand.espresso, marginTop: -spacing.md },
});
