import { StyleSheet } from 'react-native';
import { colors, radii, sizes, spacing, typography } from '../theme';

export const styles = StyleSheet.create({
    section: { gap: spacing.lg },
    heading: { ...typography.title, color: colors.brand.espresso },
    titleSmall: { ...typography.titleSmall, color: colors.brand.espresso },
    body: { ...typography.body, color: colors.brand.espresso },
    muted: { ...typography.bodySmall, color: colors.text.muted },
    input: {
        ...typography.body, color: colors.brand.espresso, backgroundColor: colors.surface.card,
        borderWidth: 1, borderColor: colors.line.border, borderRadius: radii.button,
        minHeight: sizes.button, padding: spacing.md,
    },
    // #124 검색창 아래에 안내와 자동완성 목록을 붙여 둔다.
    searchBox: { gap: spacing.xs },
    searchIcon: { position: 'absolute', top: 0, bottom: 0, left: spacing.md, justifyContent: 'center' },
    // #124 지우기 버튼은 입력칸 오른쪽 안쪽에서 입력칸 높이만큼(52dp 이상) 차지하고 아이콘을 가운데에 둔다. 너비는 화면에서 44dp 이상으로 준다.
    searchClear: {
        position: 'absolute', top: 0, bottom: 0, right: 0, minHeight: sizes.minTouch,
        justifyContent: 'center', alignItems: 'center', borderRadius: radii.button,
    },
    suggestions: {
        backgroundColor: colors.surface.card, borderWidth: 1, borderColor: colors.line.border,
        borderRadius: radii.button, overflow: 'hidden',
    },
    suggestion: {
        flexDirection: 'row', alignItems: 'center', gap: spacing.md,
        minHeight: sizes.minTouch, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    },
    suggestionDivider: { borderTopWidth: 1, borderTopColor: colors.line.border },
    suggestionPressed: { backgroundColor: colors.surface.chip },
    // #124 자동완성 결과 안내(0권·오류·오프라인)는 목록과 같은 자리·테두리에 글만 둔다.
    suggestionMessage: { minHeight: sizes.minTouch, justifyContent: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    // #124 최근 고른 책: 머리(제목·전체 지우기)와 책 줄(책 버튼·지우기 버튼). 버튼은 모두 44dp 이상이다.
    recentHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, paddingLeft: spacing.md },
    recentAction: { minHeight: sizes.minTouch, justifyContent: 'center', paddingHorizontal: spacing.md },
    recentRow: { flexDirection: 'row', alignItems: 'stretch' },
    recentBook: { flex: 1, minWidth: 0 },
    recentRemove: { minWidth: sizes.minTouch, minHeight: sizes.minTouch, justifyContent: 'center', alignItems: 'center' },
    review: {
        minHeight: sizes.minTouch, gap: spacing.sm, paddingVertical: spacing.lg,
        borderBottomWidth: 1, borderBottomColor: colors.line.border,
    },
    // #113 표지 왼쪽·글 오른쪽. 글 칸은 남은 너비만 차지하고 그 안에서 줄바꿈한다.
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
    rowText: { flex: 1, minWidth: 0, gap: spacing.sm },
    card: { alignItems: 'flex-start' },
    // #113 S-71: 감상 박스는 공통 Card와 같은 테두리·배경·반경으로 책 정보와 구분한다.
    reviewCard: {
        minHeight: sizes.minTouch, gap: spacing.sm, padding: spacing.lg,
        borderRadius: radii.card, borderWidth: 1, borderColor: colors.line.border, backgroundColor: colors.surface.card,
    },
    divider: { height: 1, backgroundColor: colors.line.border },
    // 좁은 화면이나 큰 글씨에서 정렬 버튼이 "N명의 감상" 아래 줄로 내려가도록 감싼다.
    countRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },

    cardLink: { alignSelf: 'stretch', minHeight: sizes.minTouch, gap: spacing.sm },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    chip: {
        minHeight: sizes.minTouch, paddingHorizontal: spacing.lg, justifyContent: 'center', alignItems: 'center',
        backgroundColor: colors.surface.chip, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.line.border,
    },
    chipSelected: { borderColor: colors.brand.espresso },
    like: {
        minHeight: sizes.button, minWidth: sizes.minTouch, padding: spacing.md,
        backgroundColor: colors.surface.chip, borderRadius: radii.button,
        justifyContent: 'center', alignItems: 'center',
    },
    likeSelected: { borderWidth: 1, borderColor: colors.brand.espresso },
    likeText: { ...typography.label, color: colors.brand.espresso },
    likeSelectedText: { ...typography.titleSmall },
});
