import { useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View, type AccessibilityRole, type StyleProp, type TextStyle } from 'react-native';
import { openingBracketIndent } from '../domain/loungeRules';

/**
 * #113 S-70·S-76: "『제목』"으로 시작하는 줄의 글자 왼쪽 끝을 아래 줄(닉네임·감상·날짜)과 맞춘다.
 * 『는 글리프 왼쪽이 비어 있어 그대로 두면 첫 줄만 오른쪽으로 밀려 보인다. React Native에는 첫 줄 들여쓰기가 없으므로
 * 처음 그린 줄 나눔(onTextLayout)을 보고, 한 줄이면 그 줄만, 여러 줄이면 첫 줄만 왼쪽으로 당기고 나머지 줄은 제자리에 다시 놓는다.
 * 글자는 그대로이고 여백만 바꾼다. 스크린리더에는 나눠 그려도 한 문장으로 읽힌다.
 */
export function BracketTitle({ text, style, accessibilityRole, testID }: {
    text: string; style: StyleProp<TextStyle>; accessibilityRole?: AccessibilityRole; testID?: string;
}) {
    const { fontScale } = useWindowDimensions();
    const indent = text.startsWith('『') ? openingBracketIndent(StyleSheet.flatten(style)?.fontSize ?? 16, fontScale) : 0;
    const pulled = [style, { marginLeft: -indent }];
    // 글자·글씨 크기가 바뀌면 줄 나눔을 다시 잰다.
    const layoutKey = `${indent}|${text}`;
    const [split, setSplit] = useState<{ key: string; first: string } | null>(null);
    const first = split?.key === layoutKey ? split.first : null;
    if (first !== null) {
        return (
            <View testID={testID} accessible accessibilityRole={accessibilityRole} accessibilityLabel={text}>
                <Text accessible={false} style={pulled}>{first}</Text>
                <Text accessible={false} style={style}>{text.slice(first.length).trimStart()}</Text>
            </View>
        );
    }
    return (
        <Text testID={testID} accessibilityRole={accessibilityRole} style={pulled} onTextLayout={event => {
            const { lines } = event.nativeEvent;
            const line = lines[0]?.text ?? '';
            if (indent > 0 && lines.length > 1 && line.length > 0 && line.length < text.length) setSplit({ key: layoutKey, first: line });
        }}>{text}</Text>
    );
}
