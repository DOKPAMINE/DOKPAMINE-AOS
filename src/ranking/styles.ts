import { StyleSheet } from 'react-native';
import type { PodiumTone } from '../domain/rankingView';
import { colors, radii, sizes, spacing, typography } from '../theme';

// S-73 · AOS#126 랭킹판 치수. 제목 줄의 칸 위치를 아래 줄과 맞추려고 한곳에서 계산한다.
const spineWidth = 14; // 책등 두께
const pageOffset = 4; // 뒤 종이가 비켜 난 거리(한 장마다)
// 책갈피는 최소 폭만 두고 글자에 맞게 늘어난다(큰 글씨에서도 "Top 30"이 한 줄).
export const ribbonMinWidth = 76;
const notchDepth = 8; // 책갈피 위 끝 V자 홈 깊이
const ribbonHeight = 44; // 안 고른 책갈피 최소 높이(짧다)
// 고른 책갈피는 위 여백을 더 줘서 글씨 크기와 관계없이 이만큼 더 길다.
const ribbonExtra = 16;
// 줄 바깥 테두리 두 겹. 내 줄이면 두꺼운 하얀 테두리 + 그 바깥 얇은 진한 선으로 강조하고,
// 다른 줄은 같은 두께의 빈 테두리를 둬서 모든 줄의 크기가 같다.
const ringWidth = 1; // 바깥 진한 선
const haloWidth = 3; // 안쪽 하얀 테두리
const outlineWidth = ringWidth + haloWidth;
const cardBorder = 1; // 카드 테두리(아래쪽만 더 두껍게)
const cardBottom = 3;
const rankWidth = 56;
// 내 순위 줄과 목록 줄은 랭킹판 안쪽에서 같은 만큼 들어가 있다: 안쪽 칸 여백 + 바깥 테두리 + 카드 테두리.
const rowInset = spacing.sm + outlineWidth + cardBorder;
// 목록 칸 최소 높이: 줄 3개(줄 높이 + 위아래 바깥 테두리)와 줄 사이·칸 여백. 작은 폰·큰 글씨에서도 0이 되지 않는다.
const rowHeight = sizes.button + outlineWidth * 2;
export const wellMinHeight = rowHeight * 3 + spacing.sm * 2 + spacing.sm * 2;

export const styles = StyleSheet.create({
    body: { ...typography.body, color: colors.brand.espresso },
    pressed: { opacity: 0.6 },
    // 책 모양 랭킹판: 위에 책갈피 줄, 아래에 책. 뒤 종이가 비켜 날 자리를 오른쪽·아래에 둔다.
    boardArea: { flex: 1 },
    book: { flex: 1, marginRight: pageOffset * 2, marginBottom: pageOffset * 2 },
    // 판 뒤 오른쪽 아래로 비켜 놓은 종이 두 장(책 두께). 외곽선은 보조 글자색으로 또렷하게.
    page: {
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        borderWidth: 1, borderColor: colors.text.muted, borderRadius: radii.small, backgroundColor: colors.surface.paper,
    },
    pageBack: { transform: [{ translateX: pageOffset * 2 }, { translateY: pageOffset * 2 }] },
    pageMiddle: { transform: [{ translateX: pageOffset }, { translateY: pageOffset }] },
    board: {
        flex: 1, gap: spacing.sm, overflow: 'hidden',
        paddingVertical: spacing.sm, paddingRight: spacing.sm, paddingLeft: spineWidth + spacing.sm,
        borderWidth: 1, borderColor: colors.text.muted, borderRadius: radii.small, backgroundColor: colors.surface.paper,
    },
    // 책등: 판 왼쪽의 진한 세로 띠. 내용은 그 오른쪽부터 시작한다.
    spine: { position: 'absolute', top: 0, bottom: 0, left: 0, width: spineWidth, backgroundColor: colors.brand.espresso },
    // 책갈피 탭: 아래가 평평하게 판 윗변에 붙어 위로 솟은 리본. 위 끝 가운데가 V자로 파여 있다.
    // 아래를 맞춰 세우므로 고른 책갈피가 더 높이 솟는다.
    // 판 위쪽 오른편에 둔다. 오른쪽 끝은 판 안쪽 오른쪽 여백(뒤 종이 자리 + 판 테두리 + 판 여백)에 맞춘다.
    ribbons: {
        flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'flex-end', gap: spacing.sm,
        marginRight: pageOffset * 2 + 1 + spacing.sm,
    },
    // 글자는 아래쪽에 둬서 위 끝 홈에 잘리지 않는다.
    ribbon: {
        minWidth: ribbonMinWidth, minHeight: ribbonHeight, alignItems: 'center', justifyContent: 'flex-end',
        paddingTop: notchDepth + spacing.xs, paddingBottom: spacing.sm, paddingHorizontal: spacing.md,
        backgroundColor: colors.brand.sand,
    },
    ribbonSelected: {
        minHeight: ribbonHeight + ribbonExtra, paddingTop: notchDepth + spacing.xs + ribbonExtra, backgroundColor: colors.brand.espresso,
    },
    // 위 끝 V자 홈: 화면 배경색의 아래로 뾰족한 삼각형으로 가운데를 파낸다. 좌우 폭은 책갈피 실제 폭의 절반씩이다.
    ribbonNotch: {
        position: 'absolute', top: 0, left: 0, width: 0, height: 0, borderTopWidth: notchDepth,
        borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: colors.surface.paper,
    },
    // 선택은 색과 함께 굵기로도 구분한다.
    ribbonLabel: { ...typography.label, fontFamily: typography.body.fontFamily, color: colors.brand.espresso, textAlign: 'center' },
    ribbonLabelSelected: { ...typography.label, fontFamily: typography.heading.fontFamily, color: colors.surface.paper },
    columns: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: rowInset },
    columnLabel: { ...typography.caption, color: colors.text.muted },
    rankColumn: { width: rankWidth, textAlign: 'center' },
    nicknameColumn: { flex: 1, paddingHorizontal: spacing.md },
    timeColumn: { paddingRight: spacing.md, textAlign: 'right' },
    mine: { paddingHorizontal: spacing.sm },
    // 한 톤 진한 안쪽 칸. 순위 목록은 이 안에서만 스크롤된다.
    well: { flex: 1, minHeight: wellMinHeight, padding: spacing.sm, borderRadius: radii.button, backgroundColor: colors.surface.sandSoft },
    listScroll: { flex: 1 },
    list: { gap: spacing.sm },
    notice: {
        minHeight: sizes.button + outlineWidth * 2, justifyContent: 'center', padding: spacing.md,
        borderRadius: radii.button, borderWidth: cardBorder, borderColor: colors.line.border, backgroundColor: colors.surface.sandSoft,
    },
    noticeText: { ...typography.bodySmall, color: colors.brand.espresso },
    outline: { borderWidth: ringWidth, borderColor: 'transparent', borderRadius: radii.button + outlineWidth },
    outlineMine: { borderColor: colors.text.muted },
    halo: { borderWidth: haloWidth, borderColor: 'transparent', borderRadius: radii.button + haloWidth },
    haloMine: { borderColor: colors.surface.card },
    card: {
        flexDirection: 'row', alignItems: 'stretch', minHeight: sizes.button, overflow: 'hidden',
        borderRadius: radii.button, borderWidth: cardBorder, borderBottomWidth: cardBottom,
        borderColor: colors.line.border, borderBottomColor: colors.brand.sand, backgroundColor: colors.surface.card,
    },
    rankCell: { width: rankWidth, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand.sand },
    rank: { ...typography.heading, color: colors.brand.espresso, fontVariant: ['tabular-nums'] },
    nickname: { ...typography.body, color: colors.brand.espresso, alignSelf: 'center' },
    myName: { ...typography.titleSmall },
    time: { ...typography.body, color: colors.brand.espresso, alignSelf: 'center', fontVariant: ['tabular-nums'] },
    // 목록 스크롤 맨 아래 안내 글
    notes: { gap: spacing.xs, marginTop: spacing.sm },
    note: { ...typography.footnote, color: colors.text.muted },
});

// S-73 · AOS#126: Top 30 탭 1~3위는 카드 전체를 채우고 순위 칸·아래 테두리는 조금 진한 같은 색으로 구분한다.
type ToneStyle = { card: { backgroundColor: string; borderColor: string; borderBottomColor: string }; rank: { backgroundColor: string } };
const tone = (base: string, strong: string): ToneStyle =>
    ({ card: { backgroundColor: base, borderColor: strong, borderBottomColor: strong }, rank: { backgroundColor: strong } });
export const toneStyles: Record<PodiumTone, ToneStyle> = {
    gold: tone(colors.rank.gold, colors.rank.goldStrong),
    sky: tone(colors.rank.sky, colors.rank.skyStrong),
    orange: tone(colors.rank.orange, colors.rank.orangeStrong),
};
