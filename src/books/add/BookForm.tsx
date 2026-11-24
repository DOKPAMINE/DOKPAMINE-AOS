import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { PrimaryButton, SecondaryButton, StateView } from '../../components';
import { GENRES } from '../../domain/pageRules';
import { normalizeIsbn } from '../../domain/bookAddRules';
import { isbnToLookup } from '../../domain/isbnLookupRules';
import { colors, radii, sizes, spacing, typography } from '../../theme';
import { bookAddSchema, type BookAddValues } from './validation';

/** ISBN 자동 조회 결과. 성공하면 채울 값, 실패하면 안내 문구. 중복·취소처럼 폼에서 할 일이 없으면 null */
export type IsbnLookupResult = { values: BookAddValues } | { message: string };
type LookupState = { kind: 'loading' } | { kind: 'filled' | 'failed'; message: string } | null;

export function BookForm({ initialValues, onSave, onLookupIsbn }: {
    initialValues: BookAddValues;
    onSave: (values: BookAddValues, status: 'READING' | 'WANT') => Promise<void>;
    onLookupIsbn?: (isbn: string) => Promise<IsbnLookupResult | null>;
}) {
    const { control, handleSubmit, setValue, getValues, reset, formState: { errors, isSubmitting } } = useForm<BookAddValues>({
        resolver: zodResolver(bookAddSchema), defaultValues: initialValues,
    });
    const lastLookup = useRef<string | null>(normalizeIsbn(initialValues.isbn));
    const [lookup, setLookup] = useState<LookupState>(null);
    // FR-01 / S-21: ISBN을 다 입력하면 바코드 스캔처럼 조회해서 다른 칸을 덮어쓴다. 실패하면 입력한 내용은 그대로 둔다.
    const startLookup = (text: string, finished: boolean) => {
        if (!onLookupIsbn) return;
        const isbn = isbnToLookup(text, lastLookup.current, finished);
        if (isbn === null) return;
        lastLookup.current = isbn;
        setLookup({ kind: 'loading' });
        void onLookupIsbn(isbn).then(result => {
            // 조회하는 동안 ISBN을 다른 번호로 바꿨으면 이 결과는 버린다.
            if (normalizeIsbn(getValues('isbn')) !== isbn) return;
            if (result === null) { setLookup(null); return; }
            if ('values' in result) {
                reset(result.values);
                setLookup({ kind: 'filled', message: 'ISBN으로 책 정보를 채웠어요. 내용을 확인해 주세요.' });
            } else {
                setLookup({ kind: 'failed', message: result.message });
            }
        }, () => setLookup(null));
    };
    const saving = useRef(false);
    const [error, setError] = useState<string | null>(null);
    const submit = async (status: 'READING' | 'WANT') => {
        if (saving.current) return;
        saving.current = true;
        try {
            await handleSubmit(async values => {
                setError(null);
                try { await onSave(values, status); }
                catch { setError('책을 저장하지 못했어요. 입력한 내용을 유지했으니 다시 시도해 주세요.'); }
            })();
        } finally { saving.current = false; }
    };
    const fields = ['isbn', 'title', 'author', 'totalPages', 'publisher'] as const;
    const labels = { title: '제목 (필수)', author: '저자 (필수)', totalPages: '전체 쪽수 (필수)', isbn: 'ISBN (선택)', publisher: '출판사 (선택)' };
    return (
        <KeyboardAvoidingView behavior="height" style={styles.form}>
            {fields.map(name => (
                <View key={name} style={styles.field}>
                    <Text style={styles.label}>{labels[name]}</Text>
                    <Controller control={control} name={name} render={({ field: { onChange, onBlur, value, ref } }) => (
                        <TextInput ref={ref} accessibilityLabel={labels[name]} accessibilityHint={errors[name]?.message}
                            accessibilityState={{ disabled: isSubmitting }} editable={!isSubmitting}
                            keyboardType={name === 'totalPages' ? 'number-pad' : 'default'}
                            autoCapitalize={name === 'isbn' ? 'characters' : 'sentences'}
                            maxLength={name === 'publisher' || name === 'author' ? 100 : name === 'title' ? 200 : undefined}
                            onChangeText={text => {
                                if (name === 'isbn' && normalizeIsbn(text) !== normalizeIsbn(initialValues.isbn)) {
                                    // ISBN을 바꾸면 조회한 책의 표지·책등·상품 링크는 다른 책 것이므로 비운다.
                                    setValue('coverUrl', ''); setValue('sideCoverUrl', ''); setValue('yes24ProductUrl', '');
                                }
                                onChange(text);
                                if (name === 'isbn') startLookup(text, false);
                            }} onBlur={() => {
                                onBlur();
                                if (name === 'isbn') startLookup(String(value ?? ''), true);
                            }} value={value} style={[styles.input, errors[name] && styles.invalid]} />
                    )} />
                    {errors[name] && <Text accessibilityRole="alert" style={styles.error}>{errors[name]?.message}</Text>}
                                       {name === 'isbn' && (lookup?.kind === 'loading'
                                           ? <StateView kind="loading" message="ISBN으로 책을 찾고 있어요." />
                        : <Text accessibilityRole={lookup?.kind === 'failed' ? 'alert' : undefined} accessibilityLiveRegion="polite"
                            style={lookup?.kind === 'failed' ? styles.error : styles.hint}>                                               {lookup?.message ?? 'ISBN을 입력하면 책 정보를 자동으로 채워요.'}
                                           </Text>)}
                </View>
            ))}
            <Text accessibilityRole="header" style={styles.label}>장르 (필수)</Text>
            <Controller control={control} name="genre" render={({ field: { value, onChange } }) => (
                <View style={styles.genres} accessibilityRole="radiogroup" accessibilityLabel="장르 선택">
                    {GENRES.map(genre => (
                        <Pressable key={genre} accessibilityRole="radio" accessibilityLabel={genre}
                            accessibilityState={{ checked: value === genre, disabled: isSubmitting }} disabled={isSubmitting}
                            onPress={() => onChange(genre)} style={[styles.genre, value === genre && styles.selected]}>
                            <Text style={styles.label}>{value === genre ? `선택됨 · ${genre}` : genre}</Text>
                        </Pressable>
                    ))}
                </View>
            )} />
            {errors.genre && <Text accessibilityRole="alert" style={styles.error}>{errors.genre.message}</Text>}
            {error && <StateView kind="error" message={error} />}
            {isSubmitting && <StateView kind="loading" message="기기에 책을 저장하고 있어요." />}
            <PrimaryButton label="읽기 시작" disabled={isSubmitting} onPress={() => { void submit('READING'); }} />
            <SecondaryButton label="읽고 싶은 책에 담기" disabled={isSubmitting} onPress={() => { void submit('WANT'); }} />
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    form: { gap: spacing.lg }, field: { gap: spacing.sm },
    label: { ...typography.label, color: colors.brand.espresso },
    input: { ...typography.body, color: colors.brand.espresso, minHeight: sizes.button, padding: spacing.md, borderWidth: 1, borderColor: colors.line.border, borderRadius: radii.button, backgroundColor: colors.surface.card },
    invalid: { borderColor: colors.state.error }, error: { ...typography.bodySmall, color: colors.state.error },
    hint: { ...typography.bodySmall, color: colors.text.muted },
    genres: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    genre: { minHeight: sizes.minTouch, minWidth: sizes.minTouch, justifyContent: 'center', padding: spacing.md, backgroundColor: colors.surface.chip, borderRadius: radii.small },
    selected: { backgroundColor: colors.brand.sand },
});
