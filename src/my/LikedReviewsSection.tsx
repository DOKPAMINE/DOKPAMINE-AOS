import { useCallback } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import type { LikedBookGroup } from '../api/types';
import { StateView } from '../components';
import { likedPreviewLabel, likedPreviewText } from '../domain/likedReviews';
import { colors, sizes } from '../theme';
import { LikedCover } from './LikedCover';
import { LikedError } from './LikedError';
import { refetchLikedPreview, useLikedPreview } from './likedQueries';
import { likedStyles } from './likedStyles';
import { MySection } from './MySection';

const openList = () => router.push('/liked-reviews');

/**
 * #132 FR-09 S-80 "나의 독서" 카드의 세 번째 칸 "좋아요한 감상".
 * 최근 책 묶음 3개를 한 줄씩(표지 + "제목 · 첫 사람 외 N명") 보여 주고, 줄이나 "전체 보기"를 누르면 전체 목록을 연다.
 * 비어 있으면 안내만 보이고 "전체 보기"는 숨긴다. 마이 탭에 들어올 때마다 다시 받는다.
 */
export function LikedReviewsSection() {
    const client = useQueryClient();
    const preview = useLikedPreview();
    useFocusEffect(useCallback(() => { void refetchLikedPreview(client); }, [client]));
    const items = preview.data?.items ?? [];
    const showItems = !preview.isError && items.length > 0;
    const retry = () => { void preview.refetch(); };
    const seeAll = showItems ? <Pressable testID="my-liked-see-all" accessibilityRole="button" accessibilityLabel="좋아요한 감상 전체 보기"
        onPress={openList} style={({ pressed }) => [likedStyles.seeAll, pressed && likedStyles.pressed]}>
        <Text style={likedStyles.seeAllText}>전체 보기</Text>
        <MaterialCommunityIcons name="chevron-right" size={sizes.icon} color={colors.text.muted}
            accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
    </Pressable> : undefined;
    return <MySection testID="my-section-liked" title="좋아요한 감상" action={seeAll}>
        {preview.isError ? <LikedError error={preview.error} retry={retry} restart={retry} />
            : preview.isPending ? <StateView kind="loading" />
                : items.length === 0 ? <StateView kind="empty" message="아직 좋아요한 감상이 없어요." />
                    : <View style={likedStyles.previewList}>
                        {items.map(group => <PreviewRow key={group.bookKey} group={group} />)}
                    </View>}
    </MySection>;
}

function PreviewRow({ group }: { group: LikedBookGroup }) {
    return <Pressable testID="my-liked-row" accessibilityRole="button" accessibilityLabel={likedPreviewLabel(group)} onPress={openList}
        style={({ pressed }) => [likedStyles.previewRow, pressed && likedStyles.pressed]}>
        {/* 표지는 꾸밈이라 보조 기술에서 숨긴다. 사진이 없거나 못 불러오면 책 아이콘 칸이다. 폭은 33dp로 줄 높이 44dp 안팎이다. */}
        <LikedCover key={group.coverUrl ?? 'none'} uri={group.coverUrl} width={Math.round(sizes.minTouch * 0.75)} />
        <Text numberOfLines={2} style={likedStyles.previewText}>{likedPreviewText(group)}</Text>
    </Pressable>;
}
