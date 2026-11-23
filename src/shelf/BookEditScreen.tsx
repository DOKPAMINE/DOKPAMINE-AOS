import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { PrimaryButton, Screen, SecondaryButton, StateView } from '../components';
import { GENRES } from '../domain/pageRules';
import { BookEditError, parseBookEdit, type BookEditFields } from '../domain/shelfRules';
import { validateSessionPageRange } from '../domain/syncValidation';
import type { BookRecord } from '../db/schema';
import type { RecordRepository } from '../db/repository';
import { colors, radii, sizes, spacing, typography } from '../theme';
import { shelfStyles as styles } from './styles';
import { useShelfRepository } from './useShelfRepository';

export function BookEditScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { repository, error, retry } = useShelfRepository();
    if (error || !repository) return <Screen title="책 정보 편집"><StateView kind={error ? 'error' : 'loading'} onRetry={error ? retry : undefined} /></Screen>;
    const book = repository.books.get(id);
    if (!book) return <Screen title="책 정보 편집"><StateView kind="empty" message="책을 찾을 수 없어요. 삭제된 책은 편집할 수 없어요." /><SecondaryButton label="책장으로" onPress={() => router.dismissTo('/shelf')} /></Screen>;
    return <BookEditForm key={book.id} book={book} repository={repository} />;
}

function BookEditForm({ book, repository }: { book: BookRecord; repository: RecordRepository }) {
    const [fields, setFields] = useState<BookEditFields>({ title: book.title, author: book.author, publisher: book.publisher ?? '', totalPages: String(book.totalPages), genre: book.genre });
    const [error, setError] = useState<string | null>(null);
    const [errorField, setErrorField] = useState<keyof BookEditFields | null>(null);
    const update = (key: keyof BookEditFields, value: string) => {
        setFields(current => ({ ...current, [key]: value }));
        setError(null); setErrorField(null);
    };
    const detail = () => router.dismissTo({ pathname: '/book/[id]', params: { id: book.id } });
    const save = () => {
        setErrorField(null);
        const latest = repository.books.get(book.id);
        if (!latest) { setError('삭제된 책은 편집할 수 없어요.'); return; }
        let changes: ReturnType<typeof parseBookEdit>;
        try {
            changes = parseBookEdit(fields, latest);
            validateSessionPageRange(changes.totalPages, repository.sessions.list({ bookId: book.id }));
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : '입력 내용을 확인해 주세요.');
            setErrorField(cause instanceof BookEditError ? cause.field : null);
            return;
        }
        try {
            repository.books.save({ ...latest, ...changes, catalogPending: false });
                        detail();
        } catch { setError('저장하지 못했어요. 기기 저장 공간을 확인하고 다시 시도해 주세요.'); }
    };
    // S-34: 책 삭제는 편집 화면 맨 아래에 두고, 함께 지워지는 기록을 확인한 뒤에만 삭제한다.
    const confirmDelete = () => Alert.alert('책을 삭제할까요?', `「${book.title}」 책을 삭제하면 이 책의 독서 기록·감상·문장도 함께 삭제돼요.`, [
        { text: '취소', style: 'cancel' },
        { text: '삭제', style: 'destructive', onPress: () => {
            try {
                repository.books.softDelete(book.id);
                router.dismissTo('/shelf');
            } catch { setError('삭제하지 못했어요. 기기 저장 공간을 확인하고 다시 시도해 주세요.'); }
        } },
    ]);
    const deleteButton = <Pressable accessibilityRole="button" accessibilityLabel={`${book.title} 책 삭제`} onPress={confirmDelete}
        style={({ pressed }) => [local.deleteButton, pressed && styles.pressed]}>
        <MaterialCommunityIcons name="trash-can-outline" color={colors.state.error} size={sizes.icon * 0.75} accessible={false} />
        <Text style={local.deleteText}>삭제</Text>
    </Pressable>;
    return <KeyboardAvoidingView style={{ flex: 1 }} behavior="height"><Screen title="책 정보 편집" action={deleteButton}>
        {(['title', 'author', 'publisher', 'totalPages'] as const).map(key => {
            const label = { title: '제목', author: '저자', publisher: '출판사 (선택)', totalPages: '전체 쪽수' }[key];
            return <View key={key} style={styles.section}>
                <Text style={styles.label}>{label}</Text>
                <TextInput accessibilityLabel={label} accessibilityHint={errorField === key ? error ?? undefined : undefined} value={fields[key]} onChangeText={value => update(key, value)}
                    style={styles.field} keyboardType={key === 'totalPages' ? 'number-pad' : 'default'}
                    maxLength={key === 'title' ? 200 : key === 'author' || key === 'publisher' ? 100 : undefined} selectionColor={colors.brand.camel} />
            </View>;
        })}
        <Text style={styles.label}>장르</Text>
        <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="장르 선택">
            {GENRES.map(genre => <Pressable key={genre} accessibilityRole="radio" accessibilityLabel={genre}
                accessibilityState={{ checked: fields.genre === genre }} onPress={() => update('genre', genre)}
                style={({ pressed }) => [styles.choice, fields.genre === genre && styles.selected, pressed && styles.pressed]}>
                <Text style={styles.label}>{genre}{fields.genre === genre ? ' (선택)' : ''}</Text>
            </Pressable>)}
        </View>
        {error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
        <PrimaryButton label="저장" onPress={save} />
        <SecondaryButton label="취소" onPress={detail} />
    </Screen></KeyboardAvoidingView>;
}

const local = StyleSheet.create({
    deleteButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, minHeight: sizes.minTouch, minWidth: sizes.minTouch, paddingHorizontal: spacing.md, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.state.error, backgroundColor: colors.state.errorBg },
    deleteText: { ...typography.label, fontFamily: typography.heading.fontFamily, color: colors.state.error },
});
