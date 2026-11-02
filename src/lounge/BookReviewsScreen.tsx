import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { Screen, SecondaryButton, StateView } from '../components';
import { useBookReviews } from './queries';
import { QueryError } from './QueryState';
import { ReviewRow } from './ReviewRow';
import { styles } from './styles';

export function BookReviewsScreen({ query }: { query: string }) {
    const result = useBookReviews(query);
    return (
        <Screen title="책별 감상">
            <SecondaryButton label="라운지로 돌아가기" onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/lounge')} />
            <Text style={styles.body}>{query.trim() ? `“${query}” 검색 결과` : '책 이름을 입력해 주세요.'}</Text>
            {!query.trim() ? null : result.isError ? <QueryError error={result.error} retry={() => { void result.refetch(); }} />
                : result.isPending ? <StateView kind="loading" />
                    : result.data.length === 0 ? <StateView kind="empty" message="아직 공개된 감상이 없어요" />
                        : result.data.map(group => (
                            <View key={group.bookKey} style={styles.section}>
                                <Text accessibilityRole="header" style={styles.heading}>{group.bookTitle}</Text>
                                <Text style={styles.muted}>{group.bookAuthor}{group.isbn ? ` · ISBN ${group.isbn}` : ''}</Text>
                                {group.reviews.map(item => <ReviewRow key={item.id} item={item} />)}
                            </View>
                        ))}
        </Screen>
    );
}
