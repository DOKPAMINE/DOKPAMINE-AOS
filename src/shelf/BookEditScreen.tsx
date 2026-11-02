import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { KeyboardAvoidingView, Pressable, Text, TextInput, View } from 'react-native';
import { PrimaryButton, Screen, SecondaryButton, StateView } from '../components';
import { GENRES } from '../domain/pageRules';
import { parseBookEdit, type BookEditFields } from '../domain/shelfRules';
import type { BookRecord } from '../db/schema';
import type { RecordRepository } from '../db/repository';
import { colors } from '../theme';
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
    const update = (key: keyof BookEditFields, value: string) => setFields(current => ({ ...current, [key]: value }));
    const detail = () => router.dismissTo({ pathname: '/book/[id]', params: { id: book.id } });
    const save = () => {
        const latest = repository.books.get(book.id);
        if (!latest) { setError('삭제된 책은 편집할 수 없어요.'); return; }
        let changes: ReturnType<typeof parseBookEdit>;
        try {
            changes = parseBookEdit(fields, latest);
        } catch (cause) { setError(cause instanceof Error ? cause.message : '입력 내용을 확인해 주세요.'); return; }
        try {
            repository.books.save({ ...latest, ...changes });
            detail();
        } catch { setError('저장하지 못했어요. 기기 저장 공간을 확인하고 다시 시도해 주세요.'); }
    };
    return <KeyboardAvoidingView style={{ flex: 1 }} behavior="height"><Screen title="책 정보 편집">
        {(['title', 'author', 'publisher', 'totalPages'] as const).map(key => {
            const label = { title: '제목', author: '저자', publisher: '출판사 (선택)', totalPages: '전체 쪽수' }[key];
            return <View key={key} style={styles.section}>
                <Text style={styles.label}>{label}</Text>
                <TextInput accessibilityLabel={label} accessibilityHint={error ?? undefined} value={fields[key]} onChangeText={value => update(key, value)}
                    style={styles.field} keyboardType={key === 'totalPages' ? 'number-pad' : 'default'}
                    maxLength={key === 'title' ? 200 : key === 'author' ? 100 : undefined} selectionColor={colors.brand.camel} />
            </View>;
        })}
        <Text style={styles.label}>장르</Text>
        <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="장르 선택">
            {GENRES.map(genre => <Pressable key={genre} accessibilityRole="radio" accessibilityLabel={genre}
                accessibilityState={{ checked: fields.genre === genre }} onPress={() => setFields(current => ({ ...current, genre }))}
                style={({ pressed }) => [styles.choice, fields.genre === genre && styles.selected, pressed && styles.pressed]}>
                <Text style={styles.label}>{genre}{fields.genre === genre ? ' (선택)' : ''}</Text>
            </Pressable>)}
        </View>
        {error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
        <PrimaryButton label="저장" onPress={save} />
        <SecondaryButton label="취소" onPress={detail} />
    </Screen></KeyboardAvoidingView>;
}
