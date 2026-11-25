import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Pressable, Text, View } from 'react-native';
import { ApiError } from '../api/errors';
import type { FeedItem } from '../api/types';
import { Screen, SecondaryButton, StateView } from '../components';
import { loungeBoxHeading, splitUserBookReviews, userBookReportHeadings } from '../domain/loungeRules';
import { BookCover } from '../shelf/BookCover';
import { sizes } from '../theme';
import { LikeButton } from './LikeButton';
import { invalidateLoungeLists, loungeKeys, refetchUserBookFeed, useReviewLike, useUserBookFeed } from './queries';
import { QueryError, removedReviewMessage } from './QueryState';
import { styles } from './styles';

const isNotFound = (error: unknown) => error instanceof ApiError && error.status === 404;

/**
 * #113 S-76 책 감상 모음: S-70 박스를 누르면 그 사람이 그 책에 쓴 공개 감상 전부를 한줄평·독후감으로 나눠 보여 준다.
 * #92 라운지 규칙을 따른다. 화면에 돌아올 때·아래로 당길 때·감상 동기화가 끝났을 때(connectLoungeSyncRefresh) 다시 받고,
 * 404면 삭제됐거나 비공개로 바뀌었다고 알리고 라운지 목록을 다시 받게 한다.
 */
export function UserBookReviewsScreen({ userBookId }: { userBookId: string }) {
    const result = useUserBookFeed(userBookId);
    const client = useQueryClient();
    const [refreshing, setRefreshing] = useState(false);
    const removed = isNotFound(result.error);
    useFocusEffect(useCallback(() => {
        if (userBookId) void refetchUserBookFeed(client, userBookId);
    }, [client, userBookId]));
    useEffect(() => {
        if (removed) void invalidateLoungeLists(client, loungeKeys.userBook(userBookId));
    }, [removed, client, userBookId]);
    // 진행 중인 조회는 취소하지 않고 그 결과를 기다린다. 실패는 목록 자리에 안내한다.
    const refresh = userBookId ? () => {
        setRefreshing(true);
        void result.refetch({ cancelRefetch: false }).finally(() => setRefreshing(false));
    } : undefined;
    const items = result.data ?? [];
    const { oneLines, reports } = splitUserBookReviews(items);
    // 카드는 서버 순서 그대로 두고 번호만 쓴 순서(bodyWrittenAt)로 매긴다.
    const headings = userBookReportHeadings(reports);
    const first = items[0];
    return (
        <Screen title="감상 모음" refreshing={refreshing} onRefresh={refresh}>
            <SecondaryButton label="라운지로 돌아가기" onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/lounge')} />
            {!userBookId ? <StateView kind="empty" message="볼 수 없는 감상이에요" />
                : removed ? <StateView kind="empty" message={removedReviewMessage} />
                    : result.isError ? <QueryError error={result.error} retry={() => { void result.refetch(); }} />
                        : result.isPending ? <StateView kind="loading" />
                            : !first ? <StateView kind="empty" message="아직 공개된 감상이 없어요" /> : (
                                <View style={styles.section}>
                                    {/* 박스와 같게 왼쪽에 표지(없거나 불러오지 못하면 책장의 기본 표지), 오른쪽 칸에 닉네임·제목과 저자를 둔다. */}
                                    <View testID="user-book-header" style={styles.row}>
                                        <BookCover key={first.coverUrl ?? 'none'} uri={first.coverUrl ?? null} genre={first.genre} width={sizes.minTouch * 1.5} />
                                        <View testID="user-book-header-text" style={styles.rowText}>
                                            <Text accessibilityRole="header" style={styles.heading}>{loungeBoxHeading(first.nickname, first.bookTitle)}</Text>
                                            <Text style={styles.muted}>{first.bookAuthor} · {first.genre}{first.mine ? ' · 내 감상' : ''}</Text>
                                        </View>
                                    </View>
                                    {oneLines.length > 0 ? <>
                                        <Text accessibilityRole="header" style={styles.heading}>한줄평</Text>
                                        {oneLines.map(item => <ReviewCard key={item.id} item={item} userBookId={userBookId} kind="oneLine" />)}
                                    </> : null}
                                    {reports.length > 0 ? <>
                                        <Text accessibilityRole="header" style={styles.heading}>독후감</Text>
                                        {reports.map(item => <ReviewCard key={item.id} item={item} userBookId={userBookId} kind="report" heading={headings.get(item.id)} />)}
                                    </> : null}
                                </View>
                            )}
        </Screen>
    );
}

function ReviewCard({ item, userBookId, kind, heading }: {
    item: FeedItem; userBookId: string; kind: 'oneLine' | 'report'; heading?: { text: string; label: string };
}) {
    const like = useReviewLike(item.id, loungeKeys.userBook(userBookId));
    const client = useQueryClient();
    const likeRemoved = isNotFound(like.error);
    // 좋아요가 404면 그 감상이 지워졌거나 비공개로 바뀌었다. 감상 모음과 라운지 목록을 다시 받아 남은 감상만 보여 준다.
    useEffect(() => { if (likeRemoved) void invalidateLoungeLists(client); }, [likeRemoved, client]);
    const context = kind === 'oneLine' ? '한줄평' : heading?.label ?? '독후감';
    return (
        <View style={[styles.review, styles.card]}>
            {kind === 'oneLine' ? <Text style={styles.body}>{item.oneLine}</Text> : (
                <Pressable accessibilityRole="button" accessibilityLabel={`${context} 보기`} style={styles.cardLink}
                    onPress={() => router.push({ pathname: '/lounge/[id]', params: { id: item.id } })}>
                    {heading ? <Text style={styles.titleSmall}>{heading.text}</Text> : null}
                    <Text style={styles.body} numberOfLines={6}>{item.body}</Text>
                    {item.oneLine ? <Text style={styles.muted}>한줄평 · {item.oneLine}</Text> : null}
                </Pressable>
            )}
            {likeRemoved ? <StateView kind="empty" message={removedReviewMessage} /> : <>
                <LikeButton item={item} pending={like.pending} context={context} onPress={() => like.toggle(item)} />
                {like.isError ? <QueryError error={like.error} /> : null}
            </>}
        </View>
    );
}
