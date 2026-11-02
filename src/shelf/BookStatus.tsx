import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import type { BookRecord } from '../db/schema';
import { colors, sizes } from '../theme';
import { shelfStyles as styles } from './styles';

export const bookStatusLabels = { WANT: '읽고 싶은 책', READING: '읽는 중', DONE: '완독' } as const;
const icons = { WANT: 'bookmark-outline', READING: 'book-open-page-variant-outline', DONE: 'check-circle-outline' } as const;

export function BookStatus({ status }: { status: BookRecord['status'] }) {
    return <View style={styles.row}>
        <MaterialCommunityIcons name={icons[status]} color={colors.text.muted} size={sizes.icon} accessible={false} />
        <Text style={styles.muted}>{bookStatusLabels[status]}</Text>
    </View>;
}
