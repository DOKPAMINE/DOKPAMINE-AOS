import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

import { login, signup } from '../api/endpoints';
import { ApiError } from '../api/errors';
import { PrimaryButton, Screen, SecondaryButton, StateView } from '../components';
import { colors, radii, sizes, spacing, typography } from '../theme';
import { useAuth } from './AuthProvider';
import { signupSchema, loginSchema, type SignupValues } from './validation';

export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
    const registering = mode === 'signup';
    const auth = useAuth();
    const [error, setError] = useState<ApiError | null>(null);
    const inFlight = useRef(false);
    const request = useRef<AbortController | null>(null);
    const mounted = useRef(true);
    const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm<SignupValues>({
        resolver: zodResolver(registering ? signupSchema : loginSchema.extend({ nickname: z.string() })),
        defaultValues: { email: '', password: '', nickname: '' },
    });

    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; request.current?.abort(); };
    }, []);

    const submit = async () => {
        if (inFlight.current) return;
        inFlight.current = true;
        try {
            await handleSubmit(async values => {
                setError(null);
                const controller = new AbortController();
                request.current = controller;
                try {
                    const credentials = { email: values.email, password: values.password };
                    const response = registering
                        ? await signup({ ...credentials, nickname: values.nickname }, controller.signal)
                        : await login(credentials, controller.signal);
                    if (mounted.current) await auth.signIn(response);
                } catch (caught) {
                    if (mounted.current && !controller.signal.aborted) {
                        setError(caught instanceof ApiError ? caught : new ApiError('network', 'UNKNOWN', '로그인하지 못했어요. 다시 시도해 주세요.'));
                    }
                } finally {
                    request.current = null;
                }
            })();
        } finally {
            inFlight.current = false;
        }
    };
    const fields = registering ? ['email', 'password', 'nickname'] as const : ['email', 'password'] as const;
    const labels = { email: '이메일', password: '비밀번호', nickname: '닉네임' };
    const hints = { email: '가입한 이메일을 입력해 주세요.', password: '8~64자로 입력해 주세요.', nickname: '1~30자로 입력해 주세요.' };

    return (
        <KeyboardAvoidingView style={styles.container} behavior="height">
            <Screen title={registering ? '독파민 회원가입' : '독파민 로그인'}>
                <Text style={styles.description}>{registering ? '읽은 시간과 마음에 남은 문장을 함께 기록해 보세요.' : '이메일로 로그인하고 독서 기록을 이어 가세요.'}</Text>
                {!registering && !error && auth.notice && <StateView kind="error" message={auth.notice} />}
                {fields.map(name => (
                    <View key={name} style={styles.field}>
                        <Text nativeID={`${name}-label`} style={styles.label}>{labels[name]}</Text>
                        <Controller control={control} name={name} render={({ field: { onChange, onBlur, value, ref } }) => (
                            <TextInput
                                ref={ref}
                                accessibilityLabel={labels[name]}
                                accessibilityLabelledBy={`${name}-label`}
                                accessibilityHint={errors[name]?.message ?? hints[name]}
                                autoCapitalize="none"
                                autoCorrect={false}
                                autoComplete={name === 'email' ? 'email' : name === 'password' ? registering ? 'new-password' : 'current-password' : 'nickname'}
                                keyboardType={name === 'email' ? 'email-address' : 'default'}
                                secureTextEntry={name === 'password'}
                                editable={!isSubmitting}
                                accessibilityState={{ disabled: isSubmitting }}
                                onChangeText={onChange}
                                onBlur={onBlur}
                                value={value}
                                style={[styles.input, errors[name] && styles.invalid]}
                            />
                        )} />
                        <Text accessibilityRole={errors[name] ? 'alert' : 'text'} accessibilityLiveRegion="polite" style={[styles.hint, errors[name] && styles.error]}>{errors[name]?.message ?? hints[name]}</Text>
                    </View>
                ))}
                {error && <StateView kind={error.kind === 'offline' ? 'offline' : 'error'} message={error.message} />}
                {isSubmitting && <Text accessibilityLiveRegion="polite" style={styles.description}>{registering ? '가입 정보를 확인하고 있어요.' : '로그인하고 있어요.'}</Text>}
                <PrimaryButton label={registering ? '가입하고 시작하기' : '로그인'} onPress={() => { void submit(); }} disabled={isSubmitting} />
                <SecondaryButton label={registering ? '로그인으로 돌아가기' : '회원가입'} disabled={isSubmitting} onPress={() => router.replace(registering ? '/(auth)/login' : '/(auth)/signup')} />
            </Screen>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    description: { ...typography.body, color: colors.text.muted },
    field: { gap: spacing.sm },
    label: { ...typography.label, color: colors.brand.espresso },
    input: { ...typography.body, minHeight: sizes.button, color: colors.brand.espresso, backgroundColor: colors.surface.card, borderWidth: 1, borderColor: colors.line.border, borderRadius: radii.button, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
    invalid: { borderColor: colors.state.error },
    hint: { ...typography.bodySmall, color: colors.text.muted },
    error: { color: colors.state.error },
});
