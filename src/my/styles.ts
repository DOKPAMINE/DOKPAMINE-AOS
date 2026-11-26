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
    // S-80 닉네임 카드 안의 연속 독서일. 아이콘과 큰 글자 한 줄, 그 아래 작은 글자 줄로 높이를 맞춘다.
    streak: { gap: spacing.xs },
    streakLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    streakValue: { ...typography.heading, color: colors.brand.espresso, flexShrink: 1 },
    // 누적 숫자 3개는 늘 한 줄에 같은 폭 3칸이다. 큰 글자·좁은 화면에서는 칸 폭을 유지하고 글자가 줄바꿈된다.
    summary: { flexDirection: 'row', alignItems: 'stretch' },
    summaryItem: { flex: 1, alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.sm, paddingHorizontal: spacing.xs },
    summaryDivider: { width: 1, backgroundColor: colors.line.border },
    summaryValue: { ...typography.heading, color: colors.brand.espresso, textAlign: 'center' },
    summaryLabel: { ...typography.bodySmall, color: colors.text.muted, textAlign: 'center' },
    // 장르 줄은 터치 대상이 아니라 글자 높이만큼만 쓴다. 이름 칸은 내용에 맞추되 길면 한 줄 말줄임하고,
    // 막대가 남는 폭을 모두 쓰며 권수는 막대 바로 오른쪽에 붙는다.
    // 막대 두께·색은 캘린더 S-62 장르 막대와 같은 토큰(두께 spacing.md, 빈 부분 brand.sand, 채움 text.muted)이다.
    genres: { gap: spacing.sm },
    genreRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    genreLabel: { ...typography.bodySmall, color: colors.brand.espresso, flexShrink: 1, maxWidth: '40%' },
    barTrack: { flex: 1, height: spacing.md, borderRadius: radii.small, backgroundColor: colors.brand.sand, overflow: 'hidden' },
    barFill: { height: '100%', borderRadius: radii.small, backgroundColor: colors.text.muted },
    genreValue: { ...typography.label, color: colors.brand.espresso },
    // 제목 "마이" 오른쪽 설정 아이콘 버튼. 누르는 영역은 44dp 이상이다.
    settingsButton: { minHeight: sizes.minTouch, minWidth: sizes.minTouch, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill },
    settingsPressed: { opacity: 0.6 },
    // NFR-04 동기화 문제 경고 카드. 오류 배경·글자 토큰으로 평소 카드와 구분한다.
    warningCard: { padding: spacing.lg, gap: spacing.md, borderRadius: radii.card, backgroundColor: colors.state.errorBg },
    warningHeading: { ...typography.title, color: colors.state.error },
    warningItem: { gap: spacing.sm },
});
