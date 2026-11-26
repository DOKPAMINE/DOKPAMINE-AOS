import { StyleSheet } from 'react-native';
import { colors, radii, sizes, spacing, typography } from '../theme';

export const styles = StyleSheet.create({
    heading: { ...typography.title, color: colors.brand.espresso },
    body: { ...typography.body, color: colors.brand.espresso },
    meta: { ...typography.bodySmall, color: colors.text.muted },
    row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
    choice: { minHeight: sizes.minTouch, minWidth: sizes.minTouch, justifyContent: 'center', padding: spacing.md,
        borderRadius: radii.button, backgroundColor: colors.surface.chip },
    selected: { borderWidth: 1, borderColor: colors.brand.espresso },
    switch: { minHeight: sizes.minTouch, minWidth: sizes.minTouch },
    // S-80 연속 독서일 · 누적 기록. 높이를 고정하지 않고 줄바꿈해 큰 글자에서도 잘리지 않는다.
    subheading: { ...typography.titleSmall, color: colors.brand.espresso },
    streak: { gap: spacing.xs },
    streakLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: spacing.sm },
    streakValue: { ...typography.heading, color: colors.brand.espresso },
    // 넓으면 한 줄에 3개, 좁으면(한 칸 최소 폭 3 × 44) 줄바꿈한다(캘린더 S-62 요약 숫자와 같은 배치).
    summary: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    summaryItem: { flexGrow: 1, flexBasis: 0, minWidth: sizes.minTouch * 3, alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.sm },
    summaryValue: { ...typography.heading, color: colors.brand.espresso, textAlign: 'center' },
    summaryLabel: { ...typography.bodySmall, color: colors.text.muted, textAlign: 'center' },
    // 장르 막대는 캘린더 S-62 장르 막대와 같은 토큰(빈 부분 brand.sand, 채움 text.muted)을 쓴다.
    genres: { gap: spacing.md },
    genreRow: { minHeight: sizes.minTouch, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    genreLabel: { ...typography.bodySmall, color: colors.brand.espresso, width: '28%' },
    barTrack: { flex: 1, height: spacing.md, borderRadius: radii.small, backgroundColor: colors.brand.sand, overflow: 'hidden' },
    barFill: { height: '100%', borderRadius: radii.small, backgroundColor: colors.text.muted },
    genreValue: { ...typography.label, color: colors.brand.espresso, width: '20%', textAlign: 'right' },
    // NFR-04 동기화 문제 경고 카드. 오류 배경·글자 토큰으로 평소 카드와 구분한다.
    warningCard: { padding: spacing.lg, gap: spacing.md, borderRadius: radii.card, backgroundColor: colors.state.errorBg },
    warningHeading: { ...typography.title, color: colors.state.error },
    warningItem: { gap: spacing.sm },
});
