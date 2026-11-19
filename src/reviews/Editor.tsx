import { useEffect, useState } from 'react';
import { router, usePreventRemove } from 'expo-router';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { colors } from '../theme';
import { reviewStyles as styles } from './styles';

/** D-03: 닫기 버튼과 Android 뒤로 가기를 동일한 확인으로 처리한다. */
export function useEditorExit(bookId: string, dirty: boolean, saved: boolean) {
    const [discarded, setDiscarded] = useState(false);
    usePreventRemove(dirty && !saved && !discarded, ({ repeat }) => {
        Alert.alert('작성 중인 감상을 닫을까요?', '저장하지 않은 내용은 사라져요.', [
            { text: '계속 작성', style: 'cancel' },
            { text: '닫기', style: 'destructive', onPress: () => { setDiscarded(true); repeat(); } },
        ]);
    });
    const close = () => router.dismissTo({ pathname: '/book/[id]/review', params: { id: bookId } });
    useEffect(() => {
        if (saved) router.dismissTo({ pathname: '/book/[id]/review', params: { id: bookId } });
    }, [saved, bookId]);
    return close;
}

export function EditorField({ label, value, onChangeText, limit, multiline = true, numeric = false }: {
    label: string; value: string; onChangeText: (value: string) => void; limit?: number; multiline?: boolean; numeric?: boolean;
}) {
    return <View style={styles.section}>
        <Text style={styles.label}>{label}</Text>
        <TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText}
            multiline={multiline} keyboardType={numeric ? 'number-pad' : 'default'}
            style={[styles.input, multiline && styles.multiline]} selectionColor={colors.brand.camel} />
        {limit !== undefined && <Text style={value.length > limit ? styles.error : styles.meta}>{value.length} / {limit.toLocaleString('ko-KR')}자</Text>}
    </View>;
}

/** FR-08 / S-51: 공개 범위는 쓰기 화면마다 고르고 이번에 저장하는 감상에 적용한다. */
export function VisibilityPicker({ value, onChange, subject }: {
    value: 'PRIVATE' | 'PUBLIC'; onChange: (value: 'PRIVATE' | 'PUBLIC') => void; subject: string;
}) {
    return <>
        <Text style={styles.label}>공개 범위</Text>
        <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={`${subject} 공개 범위`}>
            {(['PRIVATE', 'PUBLIC'] as const).map(visibility => {
                const selected = value === visibility;
                const label = visibility === 'PRIVATE' ? '비공개 · 나만 보기' : '공개';
                return <Pressable key={visibility} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: selected }}
                    onPress={() => onChange(visibility)}
                    style={({ pressed }) => [styles.choice, selected && styles.selected, pressed && styles.pressed]}>
                    <Text style={styles.label}>{label}{selected ? ' (선택됨)' : ''}</Text>
                </Pressable>;
            })}
        </View>
        {value === 'PUBLIC' && <Text style={styles.meta}>연결 후 동기화되면 다른 독자도 이 {subject}을 볼 수 있어요.</Text>}
    </>;
}
