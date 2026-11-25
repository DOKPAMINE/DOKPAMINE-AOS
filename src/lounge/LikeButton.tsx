import { Pressable, Text } from 'react-native';
import type { FeedItem } from '../api/types';
import { styles } from './styles';

/**
 * FR-09 S-72 · #113 S-76: 감상 하나의 좋아요 버튼. 선택 상태는 굵기·테두리와 "좋아요 누름" 문구로도 구분한다.
 * 한 화면에 버튼이 여럿이면 context로 어느 감상의 좋아요인지 스크린리더에 알린다.
 */
export function LikeButton({ item, pending, onPress, context }: {
    item: FeedItem; pending: boolean; onPress: () => void; context?: string;
}) {
    const action = item.likedByMe ? '좋아요 취소' : '좋아요';
    return (
        <Pressable accessibilityRole="button" accessibilityLabel={context ? `${context} ${action}` : action}
            accessibilityState={{ selected: item.likedByMe, disabled: pending, busy: pending }}
            disabled={pending} onPress={onPress} style={[styles.like, item.likedByMe && styles.likeSelected]}>
            <Text style={[styles.likeText, item.likedByMe && styles.likeSelectedText]}>
                {item.likedByMe ? '좋아요 누름' : '좋아요'} · {item.likeCount}개{pending ? ' · 반영 중' : ''}
            </Text>
        </Pressable>
    );
}
