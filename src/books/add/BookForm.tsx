import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { PrimaryButton, SecondaryButton, StateView } from '../../components';
import { GENRES } from '../../domain/pageRules';
import { normalizeIsbn } from '../../domain/bookAddRules';
import { colors, radii, sizes, spacing, typography } from '../../theme';
import { bookAddSchema, type BookAddValues } from './validation';

export function BookForm({ initialValues, onSave }: {
    initialValues: BookAddValues;
    onSave: (values: BookAddValues, status: 'READING' | 'WANT') => Promise<void>;
}) {
    const { control, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<BookAddValues>({
        resolver: zodResolver(bookAddSchema), defaultValues: initialValues,
    });
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
    const fields = ['title', 'author', 'totalPages', 'isbn', 'publisher'] as const;
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
                                if (name === 'isbn' && normalizeIsbn(text) !== normalizeIsbn(initialValues.isbn)) setValue('coverUrl', '');
                                onChange(text);
                            }} onBlur={onBlur} value={value} style={[styles.input, errors[name] && styles.invalid]} />
                    )} />
                    {errors[name] && <Text accessibilityRole="alert" style={styles.error}>{errors[name]?.message}</Text>}
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
    genres: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    genre: { minHeight: sizes.minTouch, minWidth: sizes.minTouch, justifyContent: 'center', padding: spacing.md, backgroundColor: colors.surface.chip, borderRadius: radii.small },
    selected: { backgroundColor: colors.brand.sand },
});
