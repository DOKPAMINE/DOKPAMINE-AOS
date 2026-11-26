import { useRef, useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import type { LikedBookGroup, LikedPerson } from '../api/types';
import { Screen, SecondaryButton, StateView } from '../components';
import { hiddenPeopleCount, likedPersonLabel, mergeLikedPages, morePeopleText, visiblePeople } from '../domain/likedReviews';
import { colors, sizes } from '../theme';
import { LikedCover } from './LikedCover';
import { LikedError } from './LikedError';
import { refreshLikedBookPages, restartLikedBookPages, useLikedBookPages } from './likedQueries';
import { likedStyles } from './likedStyles';

const title = '좋아요한 감상';

/**
 * #132 FR-09 S-80 하위 좋아요한 감상 목록.
 * 책 묶음(표지·제목·저자)마다 사람 줄(닉네임·♥ 수·"내 감상")을 두고, 3명이 넘으면 "N명 더 보기"로 펼친다.
 * 사람 줄을 누르면 S-76 책 감상 모음을 연다. 아래로 스크롤하면 20개씩 이어 받고, 아래로 당기면 처음부터 다시 받는다.
 * 목록 안에서 좋아요를 취소하지 않는다.
 */
export function LikedReviewsScreen() {
    const client = useQueryClient();
    const query = useLikedBookPages();
    const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
    const [refreshing, setRefreshing] = useState(false);
    // onEndReached가 한 번에 여러 번 와도 다음 페이지를 한 번만 부른다.
    const loadingMore = useRef(false);
    const groups = query.data ? mergeLikedPages(query.data.pages) : [];
    const restart = () => { setExpanded(new Set()); void restartLikedBookPages(client); };
    const retryFirst = () => { void query.refetch(); };
    const loadMore = () => {
        if (loadingMore.current || !query.hasNextPage || query.isFetching || query.isFetchNextPageError) return;
        loadingMore.current = true;
        void query.fetchNextPage().finally(() => { loadingMore.current = false; });
    };
    const retryMore = () => {
        if (loadingMore.current) return;
        loadingMore.current = true;
        void query.fetchNextPage().finally(() => { loadingMore.current = false; });
    };
    const refresh = () => {
        setRefreshing(true);
        void refreshLikedBookPages(client).finally(() => setRefreshing(false));
    };
    const toggle = (bookKey: string) => setExpanded(previous => new Set(previous).add(bookKey));
    // 첫 페이지를 받은 뒤 새로고침이 실패하면 목록은 두고 위에 안내한다. 다음 페이지 실패는 목록 아래에 안내한다.
    const refreshError = query.isRefetchError && !query.isFetchNextPageError;
    const back = <SecondaryButton label="마이로 돌아가기" onPress={() => router.dismissTo('/my')} />;

    if (!query.data) {
        return <Screen title={title}>
            {back}
            {query.isError ? <LikedError error={query.error} retry={retryFirst} restart={restart} /> : <StateView kind="loading" />}
        </Screen>;
    }
    return <Screen title={title} scroll={false}>
        {back}
        <FlatList testID="liked-list" style={likedStyles.list} contentContainerStyle={likedStyles.listContent}
            data={groups} keyExtractor={group => group.bookKey} initialNumToRender={20}
            onEndReached={loadMore} onEndReachedThreshold={0.5}
            refreshControl={<RefreshControl accessibilityLabel={`${title} 새로고침`} refreshing={refreshing} onRefresh={refresh}
                colors={[colors.brand.espresso]} tintColor={colors.brand.espresso} progressBackgroundColor={colors.surface.card} />}
            ListHeaderComponent={refreshError ? <LikedError error={query.error} retry={retryFirst} restart={restart} /> : undefined}
            ListEmptyComponent={refreshError ? undefined : <StateView kind="empty" message="아직 좋아요한 감상이 없어요." />}
            ListFooterComponent={query.isFetchNextPageError ? <LikedError error={query.error} retry={retryMore} restart={restart} />
                : query.isFetchingNextPage ? <StateView kind="loading" /> : undefined}
            renderItem={({ item }) => <BookGroup group={item} expanded={expanded.has(item.bookKey)} onExpand={() => toggle(item.bookKey)} />} />
    </Screen>;
}

function BookGroup({ group, expanded, onExpand }: { group: LikedBookGroup; expanded: boolean; onExpand: () => void }) {
    const hidden = expanded ? 0 : hiddenPeopleCount(group.people);
    return <View testID="liked-group" style={likedStyles.group}>
        <View style={likedStyles.groupHeader}>
            <LikedCover key={group.coverUrl ?? 'none'} uri={group.coverUrl} width={sizes.minTouch} />
            <View style={likedStyles.groupText}>
                <Text accessibilityRole="header" numberOfLines={2} style={likedStyles.groupTitle}>{group.bookTitle}</Text>
                <Text numberOfLines={1} style={likedStyles.author}>{group.bookAuthor}</Text>
            </View>
        </View>
        <View style={likedStyles.people}>
            {visiblePeople(group.people, expanded).map(person => <PersonRow key={person.userBookId} bookTitle={group.bookTitle} person={person} />)}
        </View>
        {hidden > 0 && <Pressable accessibilityRole="button" accessibilityLabel={`${group.bookTitle}, ${morePeopleText(hidden)}`} onPress={onExpand}
            style={({ pressed }) => [likedStyles.more, pressed && likedStyles.pressed]}>
            <Text style={likedStyles.moreText}>{morePeopleText(hidden)}</Text>
        </Pressable>}
    </View>;
}

function PersonRow({ bookTitle, person }: { bookTitle: string; person: LikedPerson }) {
    return <Pressable testID="liked-person" accessibilityRole="button" accessibilityLabel={likedPersonLabel(bookTitle, person)}
        onPress={() => router.push({ pathname: '/lounge/user-books/[userBookId]', params: { userBookId: person.userBookId, from: 'liked' } })}
        style={({ pressed }) => [likedStyles.person, pressed && likedStyles.pressed]}>
        <Text numberOfLines={1} style={likedStyles.nickname}>{person.nickname}</Text>
        {person.mine && <Text style={likedStyles.mine}>내 감상</Text>}
        <View style={likedStyles.likes}>
            <MaterialCommunityIcons testID="liked-heart" name="heart" size={sizes.icon * 0.75} color={colors.text.muted}
                accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
            <Text style={likedStyles.likeCount}>{person.likedCount}</Text>
        </View>
    </Pressable>;
}
