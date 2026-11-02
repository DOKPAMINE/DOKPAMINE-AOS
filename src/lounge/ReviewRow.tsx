import { router } from 'expo-router';
import { Pressable, Text } from 'react-native';
import type { FeedItem } from '../api/types';
import { styles } from './styles';

export function ReviewRow({ item }: { item: FeedItem }) {
    return (
        <Pressable accessibilityRole="button" accessibilityLabel={`${item.bookTitle} · ${item.nickname}님의 감상 보기`}
            onPress={() => router.push({ pathname: '/lounge/[id]', params: { id: item.id } })} style={styles.review}>
            <Text style={styles.heading}>{item.bookTitle}</Text>
            <Text style={styles.muted}>{item.bookAuthor} · {item.nickname}{item.mine ? ' · 내 감상' : ''}</Text>
            <Text style={styles.body} numberOfLines={3}>{item.oneLine || item.body}</Text>
            <Text style={styles.muted}>{item.likedByMe ? '좋아요 누름' : '좋아요'} · {item.likeCount}개</Text>
        </Pressable>
    );
}
