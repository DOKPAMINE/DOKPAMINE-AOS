import { uuid } from 'expo';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, type Href } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../../api/errors';
import { PrimaryButton, Screen, SecondaryButton, StateView } from '../../components';
import type { BookRecord } from '../../db/schema';
import { normalizeIsbn } from '../../domain/bookAddRules';
import { colors, radii, spacing, typography } from '../../theme';
import { BookForm } from './BookForm';
import { bookAddError, findExistingBook, getBookRepository, lookupBook, saveNewBook } from './service';
import { bookAddSchema, emptyBookValues, type BookAddValues } from './validation';

type Step = 'scan' | 'lookup' | 'confirm' | 'manual' | 'notFound' | 'duplicate' | 'offline' | 'error';

/** FR-01·17 / S-20~S-25: 개인 기록 쓰기는 공통 저장소에서만 수행한다. */
export function BookAddScreen() {
    const [step, setStep] = useState<Step>('scan');
    const [values, setValues] = useState<BookAddValues>(emptyBookValues);
    const [existing, setExisting] = useState<BookRecord | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [permission, requestPermission] = useCameraPermissions();
    const [permissionFailed, setPermissionFailed] = useState(false);
    const [cameraFailed, setCameraFailed] = useState(false);
    const [timedOut, setTimedOut] = useState(false);
    const [cameraReady, setCameraReady] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const permissionRequested = useRef(false);
    const requestVersion = useRef(0);
    const scanLocked = useRef(false);
    const saveLocked = useRef(false);
    const clientId = useRef<string | null>(null);
    const focused = useIsFocused();
    const [wasFocused, setWasFocused] = useState(focused);

    // 포커스가 바뀌면 새 CameraView의 준비 이벤트를 기다린다.
    if (focused !== wasFocused) {
        setWasFocused(focused);
        setCameraReady(false);
        setTimedOut(false);
    }

    useEffect(() => () => { requestVersion.current++; }, []);
    useEffect(() => {
        if (step !== 'scan' || !focused || !permission || permission.status !== 'undetermined' || permissionRequested.current) return;
        permissionRequested.current = true;
        void requestPermission().catch(() => setPermissionFailed(true));
    }, [step, focused, permission, requestPermission]);
    useEffect(() => {
        if (step !== 'scan' || !focused || !permission?.granted || !cameraReady) return;
        const timer = setTimeout(() => setTimedOut(true), 5000);
        return () => clearTimeout(timer);
    }, [step, focused, permission?.granted, cameraReady, attempt]);

    const manual = () => { requestVersion.current++; setStep('manual'); setError(null); };
    const showDuplicate = (book: BookRecord) => { setExisting(book); setStep('duplicate'); };
    const lookup = async (isbn: string) => {
        const normalized = normalizeIsbn(isbn);
        if (!normalized) return;
        const version = ++requestVersion.current;
        setValues({ ...emptyBookValues, isbn: normalized });
        setError(null);
        setStep('lookup');
        try {
            const books = await getBookRepository();
            if (version !== requestVersion.current) return;
            const duplicate = findExistingBook(books, normalized);
            if (duplicate) { showDuplicate(duplicate); return; }
            const result = await lookupBook(normalized);
            if (version !== requestVersion.current) return;
            setValues(result);
            setStep('confirm');
        } catch (caught) {
            if (version !== requestVersion.current) return;
            setError(bookAddError(caught));
            setStep(caught instanceof ApiError && caught.kind === 'offline' ? 'offline'
                : caught instanceof ApiError && caught.status === 404 ? 'notFound' : 'error');
        }
    };
    const save = async (input: BookAddValues, status: 'READING' | 'WANT') => {
        if (saveLocked.current) return;
        saveLocked.current = true;
        setSaving(true);
        setError(null);
        try {
            const books = await getBookRepository();
            clientId.current ??= uuid.v4();
            const result = saveNewBook(books, input, status, clientId.current, values.isbn);
            if (result.kind === 'duplicate') { showDuplicate(result.book); return; }
            // S-40은 6단계에서 구현하며 진입 경로만 계약에 맞춘다.
            router.replace((status === 'READING' ? `/reading-start?bookId=${result.book.id}` : `/book/${result.book.id}`) as Href);
        } finally { saveLocked.current = false; setSaving(false); }
    };
    const saveConfirmed = async (status: 'READING' | 'WANT') => {
        try { await save(values, status); }
        catch { setError('책을 저장하지 못했어요. 다시 시도해 주세요.'); }
    };
    const denied = permissionFailed || permission?.status === 'denied';
    const titles: Record<Step, string> = {
        scan: denied ? '카메라를 쓸 수 없어요' : '바코드 스캔', lookup: '책 정보 조회', confirm: '책 정보 확인',
        manual: '책 직접 입력', notFound: '책을 찾지 못했어요', duplicate: '이미 책장에 있어요', offline: '인터넷 연결이 필요해요', error: '책 정보를 불러오지 못했어요',
    };
    const complete = bookAddSchema.safeParse(values).success;
    return (
        <Screen title={titles[step]}>
            {step === 'scan' && <>
                {cameraFailed ? <><StateView kind="error" message="카메라를 시작하지 못했어요. 다른 앱에서 카메라를 사용 중인지 확인하거나 직접 입력해 주세요." />
                    <SecondaryButton label="카메라 다시 시도" onPress={() => { setCameraFailed(false); setCameraReady(false); setTimedOut(false); scanLocked.current = false; setAttempt(value => value + 1); }} /></>
                    : denied ? <StateView kind="empty" message="카메라 권한이 없어도 직접 입력으로 책을 등록할 수 있어요. 권한은 기기 설정에서 변경할 수 있어요." />
                    : !permission ? <StateView kind="loading" message="카메라 권한을 확인하고 있어요." />
                        : permission.granted && focused ? <>
                            <CameraView key={attempt} style={styles.camera} facing="back" barcodeScannerSettings={{ barcodeTypes: ['ean13'] }}
                                onCameraReady={() => setCameraReady(true)}
                                onMountError={() => { setCameraFailed(true); setCameraReady(false); }}
                                onBarcodeScanned={timedOut ? undefined : ({ data }) => {
                                    if (scanLocked.current || !normalizeIsbn(data)) return;
                                    scanLocked.current = true;
                                    void lookup(data);
                                }} />
                            <Text style={styles.body}>책 뒷면의 ISBN 바코드를 카메라에 맞춰 주세요.</Text>
                            {timedOut && <><StateView kind="empty" message="바코드를 찾지 못했어요. 빛 반사를 피해서 다시 찍거나 직접 입력해 주세요." />
                                <SecondaryButton label="다시 찍기" onPress={() => { setTimedOut(false); setCameraReady(false); scanLocked.current = false; setAttempt(value => value + 1); }} /></>}
                        </> : <StateView kind="loading" message="카메라 사용 권한을 확인해 주세요." />}
                <PrimaryButton label="직접 입력하기" onPress={manual} />
            </>}
            {step === 'lookup' && <><StateView kind="loading" message="ISBN으로 책을 찾고 있어요." /><SecondaryButton label="직접 입력하기" onPress={manual} /></>}
            {step === 'confirm' && <>
                <View style={styles.book}>
                    {values.coverUrl ? <Image source={{ uri: values.coverUrl }} accessibilityLabel={`${values.title || '책'} 표지`} style={styles.cover} />
                        : <View style={[styles.cover, styles.defaultCover]}><Text style={styles.label}>표지 없음</Text></View>}
                    <View style={styles.summary}><Text style={styles.title}>{values.title || '제목 정보가 없어요'}</Text><Text style={styles.body}>{values.author || '저자 정보가 없어요'}</Text></View>
                </View>
                <Text style={styles.body}>ISBN {values.isbn}</Text>
                <Text style={styles.body}>{values.totalPages ? `${values.totalPages}쪽` : '쪽수 정보가 없어요'} · {values.genre || '장르 정보가 없어요'}</Text>
                {!complete && <StateView kind="empty" message="등록에 필요한 정보가 비어 있어요. 정보 수정에서 채워 주세요." />}
                {error && <StateView kind="error" message={error} />}
                <PrimaryButton label="읽기 시작" disabled={!complete || saving} onPress={() => { void saveConfirmed('READING'); }} />
                <SecondaryButton label="읽고 싶은 책에 담기" disabled={!complete || saving} onPress={() => { void saveConfirmed('WANT'); }} />
                <SecondaryButton label="정보 수정" disabled={saving} onPress={manual} />
            </>}
            {step === 'manual' && <BookForm initialValues={values} onSave={save} />}
            {step === 'duplicate' && existing && <>
                <Text style={styles.title}>{existing.title}</Text><Text style={styles.body}>이미 등록한 책이에요. 기존 책에서 독서 기록을 이어 가세요.</Text>
                <PrimaryButton label="기존 책 상세 보기" onPress={() => router.replace(`/book/${existing.id}` as Href)} />
            </>}
            {(step === 'notFound' || step === 'offline' || step === 'error') && <>
                <StateView kind={step === 'offline' ? 'offline' : step === 'notFound' ? 'empty' : 'error'}
                    message={step === 'notFound' ? 'ISBN에 맞는 책 정보가 없어요. 직접 입력해서 등록해 주세요.' : error ?? undefined} />
                <Text style={styles.body}>ISBN {values.isbn}</Text>
                <PrimaryButton label="직접 입력하기" onPress={manual} />
                <SecondaryButton label="다시 조회하기" onPress={() => { void lookup(values.isbn); }} />
            </>}
            <SecondaryButton label="책 등록 닫기" disabled={saving} onPress={() => { requestVersion.current++; if (router.canGoBack()) router.back(); else router.replace('/(tabs)'); }} />
        </Screen>
    );
}

const styles = StyleSheet.create({
    camera: { width: '100%', aspectRatio: 1, borderRadius: radii.card, overflow: 'hidden' },
    body: { ...typography.body, color: colors.text.muted }, title: { ...typography.title, color: colors.brand.espresso },
    label: { ...typography.label, color: colors.text.muted },
    book: { flexDirection: 'row', gap: spacing.lg, alignItems: 'center' }, summary: { flex: 1, gap: spacing.sm },
    cover: { width: spacing.xxl * 3, aspectRatio: 2 / 3, borderRadius: radii.small },
    defaultCover: { backgroundColor: colors.brand.sand, justifyContent: 'center', alignItems: 'center' },
});
