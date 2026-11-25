import { router } from 'expo-router';
import { Pressable, Text } from 'react-native';
import type { FeedItem } from '../api/types';
import { loungeBoxHeading, writtenDate } from '../domain/loungeRules';
import { styles } from './styles';

/**
 * #113 S-70: 사람의 책 하나를 박스 하나로 보여 준다. 내용은 서버가 고른 대표 독후감이다.
 * 누르면 그 사람이 그 책에 쓴 공개 감상 모음(S-76)을 연다. userBookId를 주지 않는 구버전 서버면 대표 감상의 상세(S-72)를 연다.
 */
export function LoungeBox({ item }: { item: FeedItem }) {
    const heading = loungeBoxHeading(item.nickname, item.bookTitle);
    const date = writtenDate(item.bodyWrittenAt);
    const open = () => item.userBookId
        ? router.push({ pathname: '/lounge/user-books/[userBookId]', params: { userBookId: item.userBookId } })
        : router.push({ pathname: '/lounge/[id]', params: { id: item.id } });
    return (
        <Pressable accessibilityRole="button" onPress={open} style={styles.review}
            accessibilityLabel={`${heading}${item.mine ? ', 내 감상' : ''}${date ? `, ${date.label}에 쓴 독후감` : ''}, 감상 모음 보기`}>
            <Text style={styles.titleSmall}>{heading}{item.mine ? ' · 내 감상' : ''}</Text>
            <Text style={styles.body} numberOfLines={3}>{item.body || item.oneLine}</Text>
            {date ? <Text style={styles.muted}>{date.text}</Text> : null}
        </Pressable>
    );
}
