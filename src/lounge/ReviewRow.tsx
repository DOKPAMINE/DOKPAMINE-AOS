import { router } from 'expo-router';
import { Pressable, Text } from 'react-native';
import type { FeedItem } from '../api/types';
import { styles } from './styles';

/** S-71: userBookId가 없는 예전 응답의 감상 하나. #113 박스와 같은 카드 모양으로 책 정보와 구분한다. */
export function ReviewRow({ item }: { item: FeedItem }) {
    return (
        <Pressable accessibilityRole="button" accessibilityLabel={`${item.bookTitle} · ${item.nickname}님의 감상 보기`}
            onPress={() => router.push({ pathname: '/lounge/[id]', params: { id: item.id } })} style={styles.reviewCard}>
            <Text style={styles.heading}>{item.bookTitle}</Text>
            <Text style={styles.muted}>{item.bookAuthor} · {item.nickname}{item.mine ? ' · 내 감상' : ''}</Text>
            <Text style={styles.body} numberOfLines={3}>{item.oneLine || item.body}</Text>
            <Text style={styles.muted}>{item.likedByMe ? '좋아요 누름' : '좋아요'} · {item.likeCount}개</Text>
        </Pressable>
    );
}
