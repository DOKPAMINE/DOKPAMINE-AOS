import { StyleSheet } from 'react-native';
import { colors, radii, sizes, spacing, typography } from '../theme';

/** #132 FR-09 S-80 좋아요한 감상 미리보기 칸과 S-80 하위 좋아요한 감상 목록. 색·글자·간격은 토큰만 쓴다. */
export const likedStyles = StyleSheet.create({
    // 미리보기 칸 제목 오른쪽 "전체 보기 >". 누르는 영역은 44dp 이상이다.
    seeAll: { minHeight: sizes.minTouch, minWidth: sizes.minTouch, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
        paddingLeft: spacing.sm, borderRadius: radii.button },
    seeAllText: { ...typography.label, color: colors.text.muted },
    pressed: { opacity: 0.6 },
    previewList: { gap: spacing.sm },
    // 미리보기 한 줄: 작은 표지 + "제목 · 첫 사람 외 N명". 큰 글자에서는 2줄까지 늘어난다.
    previewRow: { minHeight: sizes.minTouch, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radii.small },
    previewText: { ...typography.body, color: colors.brand.espresso, flex: 1 },
    // 전체 목록: 화면 남은 높이를 목록이 쓴다.
    list: { flex: 1 },
    listContent: { gap: spacing.lg, paddingBottom: spacing.xl },
    group: { padding: spacing.lg, gap: spacing.md, borderRadius: radii.card, borderWidth: 1, borderColor: colors.line.border,
        backgroundColor: colors.surface.card },
    groupHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    groupText: { flex: 1, gap: spacing.xs },
    groupTitle: { ...typography.title, color: colors.brand.espresso },
    author: { ...typography.bodySmall, color: colors.text.muted },
    people: { gap: spacing.xs },
    // 사람 줄: 닉네임 · ("내 감상") · ♥ 수. 터치 영역 44dp 이상.
    person: { minHeight: sizes.minTouch, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm, borderRadius: radii.button, backgroundColor: colors.surface.sandSoft },
    nickname: { ...typography.body, color: colors.brand.espresso, flexShrink: 1 },
    // "내 감상"은 색만이 아니라 글자로 구분한다.
    mine: { ...typography.caption, color: colors.brand.espresso, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
        borderRadius: radii.pill, borderWidth: 1, borderColor: colors.brand.espresso, overflow: 'hidden' },
    likes: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    likeCount: { ...typography.label, color: colors.brand.espresso },
    more: { minHeight: sizes.minTouch, alignItems: 'center', justifyContent: 'center', borderRadius: radii.button,
        backgroundColor: colors.surface.chip },
    moreText: { ...typography.label, color: colors.brand.espresso },
    restart: { gap: spacing.sm },
});
