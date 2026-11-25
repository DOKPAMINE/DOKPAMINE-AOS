import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

import logo from '../../assets/brand/logo-dokpamine.png';
import { login, signup } from '../api/endpoints';
import { ApiError } from '../api/errors';
import { PrimaryButton, StateView } from '../components';
import { colors, radii, sizes, spacing, typography } from '../theme';
import { useAuth } from './AuthProvider';
import { signupSchema, loginSchema, type SignupValues } from './validation';

/** 로고 원본 비율(1036×572) */
const LOGO_RATIO = 1036 / 572;
type FieldName = 'username' | 'password' | 'nickname';
const icons: Record<FieldName, 'card-account-details-outline' | 'lock-outline' | 'account-outline'> = {
    username: 'card-account-details-outline', password: 'lock-outline', nickname: 'account-outline',
};

// FR-10 · S-02/S-03: 로그인·회원가입 화면. 가운데 로고 + 아이콘이 들어간 입력 칸 + 화면 전환 링크.
export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
    const registering = mode === 'signup';
    const auth = useAuth();
    const [error, setError] = useState<ApiError | null>(null);
    const [passwordVisible, setPasswordVisible] = useState(false);
    const { width: screenWidth } = useWindowDimensions();
    // 로고는 화면 폭의 절반 정도, 큰 화면에서도 220dp를 넘지 않게 한다.
    const logoWidth = Math.min(screenWidth * 0.5, 220);
    const inFlight = useRef(false);
    const request = useRef<AbortController | null>(null);
    const mounted = useRef(true);
    const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm<SignupValues>({
        resolver: zodResolver(registering ? signupSchema : loginSchema.extend({ nickname: z.string() })),
        defaultValues: { username: '', password: '', nickname: '' },
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
                    const credentials = { username: values.username, password: values.password };
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
    const switchScreen = () => {
        if (!registering) router.push('/(auth)/signup');
        else if (router.canGoBack()) router.back();
        else router.replace('/(auth)/login');
    };
    const fields = registering ? ['username', 'password', 'nickname'] as const : ['username', 'password'] as const;
    const labels = { username: '아이디', password: '비밀번호', nickname: '닉네임' };
    const hints = {
        username: registering ? '영문, 숫자, 밑줄을 사용해 4~30자로 입력해 주세요.' : '기존 계정은 가입한 이메일을 입력해 주세요.',
        password: '8자 이상 입력해 주세요.',
        nickname: '1~15자로 입력해 주세요.',
    };
    // 로그인은 화면을 가볍게 하려고 오류가 있을 때만 아래 문구를 보여 주고, 회원가입은 규칙을 미리 알려 준다.
    const showHint = (name: FieldName) => !!errors[name] || registering;

    return (
        <KeyboardAvoidingView style={styles.container} behavior="height">
            <SafeAreaView style={styles.container}>
                <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                    <View accessible accessibilityRole="header" accessibilityLabel={registering ? '독파민 회원가입' : '독파민 로그인'} style={styles.brand}>
                        <Image source={logo} resizeMode="contain" style={{ width: logoWidth, height: logoWidth / LOGO_RATIO }} />
                        <Text style={styles.description}>{registering ? '읽은 시간과 마음에 남은 문장을 함께 기록해 보세요.' : '기존 계정은 가입한 이메일로 로그인해 주세요.'}</Text>
                    </View>
                    {!registering && !error && auth.notice && <StateView kind="error" message={auth.notice} />}
                    {fields.map(name => (
                        <View key={name} style={styles.field}>
                            <Controller control={control} name={name} render={({ field: { onChange, onBlur, value, ref } }) => (
                                <View style={[styles.inputBox, errors[name] && styles.invalid]}>
                                    <MaterialCommunityIcons name={icons[name]} size={sizes.icon * 0.85} color={colors.text.muted} accessible={false} />
                                    <TextInput
                                        ref={ref}
                                        accessibilityLabel={labels[name]}
                                        accessibilityHint={errors[name]?.message ?? hints[name]}
                                        placeholder={labels[name]}
                                        placeholderTextColor={colors.text.muted}
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                        autoComplete={name === 'username' ? 'username' : name === 'password' ? registering ? 'new-password' : 'current-password' : 'nickname'}
                                        secureTextEntry={name === 'password' && !passwordVisible}
                                        editable={!isSubmitting}
                                        accessibilityState={{ disabled: isSubmitting }}
                                        onChangeText={onChange}
                                        onBlur={onBlur}
                                        value={value}
                                        style={styles.input}
                                    />
                                    {name === 'password' && (
                                        <Pressable accessibilityRole="button" accessibilityLabel={passwordVisible ? '비밀번호 숨기기' : '비밀번호 보기'}
                                            accessibilityState={{ checked: passwordVisible }} onPress={() => setPasswordVisible(visible => !visible)}
                                            hitSlop={spacing.xs} style={({ pressed }) => [styles.eye, pressed && styles.pressed]}>
                                            <MaterialCommunityIcons name={passwordVisible ? 'eye-outline' : 'eye-off-outline'} size={sizes.icon * 0.85}
                                                color={colors.text.muted} accessible={false} />
                                        </Pressable>
                                    )}
                                </View>
                            )} />
                            {showHint(name) && (
                                <Text accessibilityRole={errors[name] ? 'alert' : 'text'} accessibilityLiveRegion="polite" style={[styles.hint, errors[name] && styles.error]}>
                                    {errors[name]?.message ?? hints[name]}
                                </Text>
                            )}
                        </View>
                    ))}
                    {error && <StateView kind={error.kind === 'offline' ? 'offline' : 'error'} message={error.message} />}
                    {isSubmitting && <Text accessibilityLiveRegion="polite" style={styles.description}>{registering ? '가입 정보를 확인하고 있어요.' : '로그인하고 있어요.'}</Text>}
                    <PrimaryButton label={registering ? '가입하고 시작하기' : '로그인'} onPress={() => { void submit(); }} disabled={isSubmitting} />
                    <View style={styles.switchRow}>
                        <Text style={styles.switchText}>{registering ? '이미 계정이 있으신가요?' : '계정이 없으신가요?'}</Text>
                        <Pressable accessibilityRole="button" accessibilityLabel={registering ? '로그인으로 돌아가기' : '회원가입'}
                            accessibilityState={{ disabled: isSubmitting }} disabled={isSubmitting} onPress={switchScreen}
                            style={({ pressed }) => [styles.switchButton, pressed && styles.pressed]}>
                            <Text style={styles.switchLink}>{registering ? '로그인' : '회원가입'}</Text>
                        </Pressable>
                    </View>
                </ScrollView>
            </SafeAreaView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface.paper },
    content: { flexGrow: 1, justifyContent: 'center', gap: spacing.lg, paddingHorizontal: spacing.xl, paddingVertical: spacing.xxl },
    brand: { alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
    description: { ...typography.body, color: colors.text.muted, textAlign: 'center' },
    field: { gap: spacing.sm },
    inputBox: {
        flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: sizes.button,
        backgroundColor: colors.surface.card, borderWidth: 1, borderColor: colors.line.border, borderRadius: radii.pill, paddingLeft: spacing.lg, paddingRight: spacing.sm,
    },
    input: { ...typography.body, flex: 1, color: colors.brand.espresso, paddingVertical: spacing.md },
    eye: { minWidth: sizes.minTouch, minHeight: sizes.minTouch, alignItems: 'center', justifyContent: 'center' },
    invalid: { borderColor: colors.state.error },
    hint: { ...typography.bodySmall, color: colors.text.muted, paddingHorizontal: spacing.lg },
    error: { color: colors.state.error },
    switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' },
    switchText: { ...typography.bodySmall, color: colors.text.muted },
    switchButton: { minHeight: sizes.minTouch, justifyContent: 'center', paddingHorizontal: spacing.sm },
    switchLink: { ...typography.label, color: colors.brand.espresso, textDecorationLine: 'underline' },
    pressed: { opacity: 0.6 },
});
