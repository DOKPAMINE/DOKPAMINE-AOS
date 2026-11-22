import { Alert, Pressable, Text, View } from 'react-native';
import { reviewStyles as styles } from './styles';

/** #91 S-50: 카드마다 둔 수정·삭제 버튼. 막혀 있으면 비활성 상태와 이유를 함께 알린다. */
export function CardActions({ subject, onEdit, onDelete, lockedReason }: {
    subject: string; onEdit: () => void; onDelete: () => void; lockedReason?: string;
}) {
    const disabled = lockedReason !== undefined;
    const action = (label: string, onPress: () => void) => <Pressable accessibilityRole="button" accessibilityLabel={`${subject} ${label}`}
        accessibilityHint={lockedReason} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
        style={({ pressed }) => [styles.action, (disabled || pressed) && styles.dimmed]}>
        <Text style={styles.label}>{label}</Text>
    </Pressable>;
    return <View style={styles.section}>
        <View style={styles.row}>{action('수정', onEdit)}{action('삭제', onDelete)}</View>
        {lockedReason && <Text style={styles.meta}>{lockedReason}</Text>}
    </View>;
}

/** #91 S-50: 삭제는 되돌릴 수 없으므로 한 번 확인한다. */
export function confirmDelete(onConfirm: () => void) {
    Alert.alert('삭제할까요?', '되돌릴 수 없어요.', [
        { text: '취소', style: 'cancel' },
        { text: '삭제', style: 'destructive', onPress: onConfirm },
    ]);
}
