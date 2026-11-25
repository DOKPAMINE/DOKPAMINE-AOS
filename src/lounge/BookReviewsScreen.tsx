import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Screen, SecondaryButton, StateView } from '../components';
import { groupReviewBoxes, sortReviewBoxes, type ReviewBoxOrder } from '../domain/loungeRules';
import { LoungeBox } from './LoungeBox';
import { useBookReviews } from './queries';
import { QueryError } from './QueryState';
import { ReviewRow } from './ReviewRow';
import { styles } from './styles';

const orders: { value: ReviewBoxOrder; label: string }[] = [
    { value: 'latest', label: '최신순' },
    { value: 'likes', label: '좋아요 많은 순' },
];

/**
 * S-71 · FR-16 책별 감상: 서버의 책 묶음(제목·저자·ISBN)과 묶음 순서는 그대로 두고, #113 묶음 안 감상을
 * 사람의 책 박스로 묶어 S-70과 같은 모양으로 보여 준다. 박스는 S-76, userBookId가 없는 예전 응답의 감상은 S-72로 간다.
 * [최신순]·[좋아요 많은 순]은 묶음 안 박스 순서에만 적용한다. 기본은 최신순이다.
 */
export function BookReviewsScreen({ query }: { query: string }) {
    const result = useBookReviews(query);
    const [order, setOrder] = useState<ReviewBoxOrder>('latest');
    return (
        <Screen title="책별 감상">
            <SecondaryButton label="라운지로 돌아가기" onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/lounge')} />
            <Text style={styles.body}>{query.trim() ? `“${query}” 검색 결과` : '책 이름을 입력해 주세요.'}</Text>
            {!query.trim() ? null : result.isError ? <QueryError error={result.error} retry={() => { void result.refetch(); }} />
                : result.isPending ? <StateView kind="loading" />
                    : result.data.length === 0 ? <StateView kind="empty" message="아직 공개된 감상이 없어요" /> : <>
                        <View accessibilityRole="radiogroup" accessibilityLabel="정렬" style={styles.chips}>
                            {orders.map(option => {
                                const selected = option.value === order;
                                return (
                                    <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={option.label}
                                        accessibilityState={{ selected, checked: selected }} onPress={() => setOrder(option.value)}
                                        style={[styles.chip, selected && styles.chipSelected]}>
                                        <Text style={[styles.likeText, selected && styles.likeSelectedText]}>{option.label}</Text>
                                    </Pressable>
                                );
                            })}
                        </View>
                        {result.data.map(group => (
                            <View key={group.bookKey} style={styles.section}>
                                <Text accessibilityRole="header" style={styles.heading}>{group.bookTitle}</Text>
                                <Text style={styles.muted}>{group.bookAuthor}{group.isbn ? ` · ISBN ${group.isbn}` : ''}</Text>
                                {sortReviewBoxes(groupReviewBoxes(group.reviews), order).map(box => box.userBookId
                                    ? <LoungeBox key={box.key} item={box.representative} />
                                    : <ReviewRow key={box.key} item={box.representative} />)}
                            </View>
                        ))}
                    </>}
        </Screen>
    );
}
