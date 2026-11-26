import type { PropsWithChildren, ReactNode } from 'react';
import { Text, View } from 'react-native';
import { styles } from './styles';

/**
 * S-80 "나의 독서" 카드 안의 칸 하나: 제목(header) + 내용. 칸마다 같은 바탕·반경·여백을 쓴다.
 * action을 주면 제목 줄 오른쪽에 둔다(예: 나중에 넣을 "좋아요한 감상" 칸의 "전체 보기" 버튼).
 * 버튼을 넣을 때는 터치 영역 44dp 이상과 accessibilityRole·accessibilityLabel을 지정한다.
 */
export function MySection({ title, action, testID, children }: PropsWithChildren<{ title: string; action?: ReactNode; testID?: string }>) {
    return <View testID={testID} style={styles.section}>
        <View style={styles.sectionHeader}>
            <Text accessibilityRole="header" style={styles.subheading}>{title}</Text>
            {action}
        </View>
        {children}
    </View>;
}
