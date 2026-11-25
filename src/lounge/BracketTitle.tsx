import { isLoaded } from 'expo-font';
import { StyleSheet, Text, useWindowDimensions, View, type AccessibilityRole, type TextStyle } from 'react-native';
import { bookTitleLabel, openingBracketIndent } from '../domain/loungeRules';

/**
 * #113 S-70·S-76: "『제목』 (내 감상)" 줄. 가로 한 줄 안에 『, 제목, 』, (내 감상)을 따로 놓는다.
 * - 『는 글리프 왼쪽이 비어 있어 그대로 두면 아래 줄보다 오른쪽으로 밀려 보이므로, 『만 그 빈 공간만큼 왼쪽으로 당긴다.
 *   당기는 값은 Noto Sans KR 수치라 그 글꼴을 불러왔을 때만 쓰고, 못 불러왔으면 당기지 않는다.
 * - 제목만 줄어들 수 있고(flexShrink) maxLines 줄을 넘으면 …으로 줄인다. 』와 (내 감상)은 줄지 않아 항상 보인다.
 * - 스크린리더는 "『제목』 내 감상"을 한 번에 읽는다.
 */
export function BracketTitle({ title, mine, style, maxLines, accessibilityRole, testID }: {
    title: string; mine: boolean; style: TextStyle; maxLines: number; accessibilityRole?: AccessibilityRole; testID?: string;
}) {
    const { fontScale } = useWindowDimensions();
    const flat: TextStyle = StyleSheet.flatten(style) ?? {};
    const notoLoaded = typeof flat.fontFamily === 'string' && isLoaded(flat.fontFamily);
    const indent = openingBracketIndent(flat.fontSize ?? 16, fontScale, notoLoaded);
    return (
        <View testID={testID} accessible accessibilityRole={accessibilityRole} accessibilityLabel={bookTitleLabel(title, mine)} style={styles.row}>
            <Text testID="bracket-open" style={[style, styles.fixed, styles.top, { marginLeft: indent > 0 ? -indent : 0 }]}>『</Text>
            <Text testID="bracket-title" style={[style, styles.title]} numberOfLines={maxLines} ellipsizeMode="tail">{title}</Text>
            <Text testID="bracket-close" style={[style, styles.fixed]}>』</Text>
            {mine ? <Text testID="bracket-mine" style={[style, styles.fixed]}> (내 감상)</Text> : null}
        </View>
    );
}

const styles = StyleSheet.create({
    // 제목이 두 줄이면 』와 (내 감상)은 마지막 줄 옆에, 『는 첫 줄 옆에 둔다.
    row: { flexDirection: 'row', alignItems: 'flex-end', minWidth: 0 },
    top: { alignSelf: 'flex-start' },
    title: { flexShrink: 1, minWidth: 0 },
    fixed: { flexShrink: 0 },
});
