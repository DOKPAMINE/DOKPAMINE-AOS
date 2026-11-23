import { useEffect } from 'react';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Pressable, Text, View } from 'react-native';
import { ApiError } from '../api/errors';
import { Screen, SecondaryButton, StateView } from '../components';
import { invalidateLoungeLists, useFeedItem, useReviewLike } from './queries';
import { QueryError, removedReviewMessage } from './QueryState';
import { styles } from './styles';

export function ReviewDetailScreen({ id }: { id: string }) {
    const result = useFeedItem(id);
    const like = useReviewLike(id);
    const item = result.data;
    const removed = [result.error, like.error].some(error => error instanceof ApiError && error.status === 404);
    const client = useQueryClient();
    // #91: 지워진 감상이 목록·검색에 남아 있지 않게 다시 받는다.
    useEffect(() => { if (removed) void invalidateLoungeLists(client); }, [removed, client]);
    return (
        <Screen title="감상 상세">
            <SecondaryButton label="목록으로 돌아가기" onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/lounge')} />
            {!id ? <StateView kind="empty" message="볼 수 없는 감상이에요" />
                : removed ? <StateView kind="empty" message={removedReviewMessage} />
                : result.isError ? <QueryError error={result.error} retry={() => { void result.refetch(); }} />
                    : !item ? <StateView kind="loading" /> : (
                        <View style={styles.section}>
                            <Text accessibilityRole="header" style={styles.heading}>{item.bookTitle}</Text>
                            <Text style={styles.muted}>{item.bookAuthor} · {item.genre}</Text>
                            <Text style={styles.muted}>{item.nickname}{item.mine ? ' · 내 감상' : ''}</Text>
                            {item.oneLine ? <><Text accessibilityRole="header" style={styles.heading}>한줄평</Text><Text style={styles.body}>{item.oneLine}</Text></> : null}
                            {item.body ? <><Text accessibilityRole="header" style={styles.heading}>독후감</Text><Text style={styles.body}>{item.body}</Text></> : null}
                            <Pressable accessibilityRole="button" accessibilityLabel={item.likedByMe ? '좋아요 취소' : '좋아요'}
                                accessibilityState={{ selected: item.likedByMe, disabled: like.pending, busy: like.pending }}
                                disabled={like.pending} onPress={() => like.toggle(item)} style={[styles.like, item.likedByMe && styles.likeSelected]}>
                                <Text style={[styles.likeText, item.likedByMe && styles.likeSelectedText]}>
                                    {item.likedByMe ? '좋아요 누름' : '좋아요'} · {item.likeCount}개{like.pending ? ' · 반영 중' : ''}
                                </Text>
                            </Pressable>
                            {like.isError && <QueryError error={like.error} />}
                        </View>
                    )}
        </Screen>
    );
}
