import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, StateView } from '../../src/components';
import type { Genre } from '../../src/domain/pageRules';
import { countShelfGenres, countShelfStatuses, filterShelfBooks, filterShelfGenre, groupShelfBooks, toggleShelfFilter, type ShelfStatus } from '../../src/domain/shelfRules';
import type { BookRecord } from '../../src/db/schema';
import { layoutShelfRow, spineHeightScale, spineThicknessScale, type ShelfPlacement } from '../../src/domain/spineRules';
import { bookStatusIcons, bookStatusLabels } from '../../src/shelf/BookStatus';
import { useShelfRepository } from '../../src/shelf/useShelfRepository';
import { shelfStyles } from '../../src/shelf/styles';
import { colors, radii, sizes, spacing, typography } from '../../src/theme';
import shelfCenter from '../../assets/shelf/shelf-center.jpg';
import shelfLeft from '../../assets/shelf/shelf-left.jpg';
import shelfRight from '../../assets/shelf/shelf-right.jpg';

const FILTERS: readonly ShelfStatus[] = ['READING', 'DONE', 'WANT'];
const emptyFilterMessages: Record<ShelfStatus, string> = {
    READING: '읽는 중인 책이 없어요.',
    DONE: '아직 완독한 책이 없어요.',
    WANT: '읽고 싶은 책이 없어요.',
};
const spineInk: Record<ShelfStatus, string> = {
    READING: colors.surface.paper,
    DONE: colors.surface.paper,
    WANT: colors.brand.espresso,
};
const SPINE_CHARS = 8;

/** S-30: 책등에는 제목을 한 글자씩 세로로 쓰고, 길면 말줄임표로 줄인다. */
function spineTitle(title: string) {
    const chars = Array.from(title.replace(/\s+/g, ''));
    return (chars.length > SPINE_CHARS ? [...chars.slice(0, SPINE_CHARS - 1), '…'] : chars).join('\n');
}

const SPINE_HEIGHT = Math.round(sizes.minTouch * 4.25);
const SPINE_IMAGE_MIN = spacing.lg;
const SPINE_IMAGE_MAX = sizes.minTouch * 2;

/** S-30: 책등 이미지 비율대로 폭을 정하되 너무 얇거나 두껍지 않게 제한한다. */
function spineImageWidth(ratio: number | undefined, height: number) {
    if (ratio === undefined || !Number.isFinite(ratio) || ratio <= 0) return sizes.minTouch;
    return Math.min(SPINE_IMAGE_MAX, Math.max(SPINE_IMAGE_MIN, Math.round(height * ratio)));
}

type SpineProps = {
    book: BookRecord;
    image: boolean;
    width: number;
    height: number;
    placement: ShelfPlacement;
    hidden: boolean;
    onRatio: (ratio: number) => void;
    onFail: () => void;
};

/** S-30: 책등 이미지가 있으면 실제 책등을, 없거나 불러오지 못하면 색 책등과 세로 제목을 보여 준다. */
function ShelfSpine({ book, image, width, height, placement, hidden, onRatio, onFail }: SpineProps) {
    const label = `${book.title}, ${book.author}, ${bookStatusLabels[book.status]}, 책 상세 보기`;
    const open = () => router.push({ pathname: '/book/[id]', params: { id: book.id } });
    // 접근성: 보이는 폭은 책등만큼, 모자란 터치 영역(44dp)은 hitSlop으로 채운다.
    const slop = Math.max(0, (sizes.minTouch - width) / 2);
    // S-30: 기운 책은 바닥에 닿은 아래 모서리를 축으로 돌려서 공중에 뜨지 않게 한다.
    const lean = placement.angle === 0 ? null : {
        transform: [{ rotate: `${placement.angle}deg` }],
        transformOrigin: placement.origin === 'right' ? 'right bottom' : 'left bottom',
    };
    const frame = { width, height, marginLeft: placement.marginLeft };
    return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={open} hitSlop={{ left: slop, right: slop }}
        accessibilityElementsHidden={hidden} importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
        disabled={hidden} pointerEvents={hidden ? 'none' : 'auto'}
        style={({ pressed }) => [styles.spineBase, frame, lean, hidden && styles.hiddenSpine, !image && [styles.spine, spineBackground[book.status]], pressed && shelfStyles.pressed]}>
        {image
            ? <Image testID={`spine-image-${book.id}`} source={{ uri: book.sideCoverUrl ?? undefined }} accessible={false} resizeMode="stretch" fadeDuration={0}
                onLoad={event => { const { width: w, height: h } = event.nativeEvent.source; if (w > 0 && h > 0) onRatio(w / h); }}
                onError={onFail} style={{ width, height }} />
            : <Text style={[styles.spineTitle, { color: spineInk[book.status] }]}>{spineTitle(book.title)}</Text>}
        <View pointerEvents="none" style={styles.spineShade} />
    </Pressable>;
}

// S-30: 책장 칸 이미지(원본 611px 높이)를 왼쪽·가운데·오른쪽으로 나눠, 가운데만 가로로 늘리거나 줄인다.
// side*: 잘라 둔 양옆 조각의 폭, frame*: 바깥 옆판 두께(스크롤하는 책이 이 판 뒤로 들어간다),
// top·bottom·left·right: 처음에 책이 놓이는 바닥 영역까지의 거리(모두 원본 픽셀).
const SHELF_SOURCE = { height: 611, sideLeft: 100, sideRight: 103, frameLeft: 30, frameRight: 31, top: 43, bottom: 53, left: 70, right: 72 } as const;
const SHELF_HEIGHT = Math.round((SPINE_HEIGHT + spacing.sm) * SHELF_SOURCE.height / (SHELF_SOURCE.height - SHELF_SOURCE.top - SHELF_SOURCE.bottom));
const shelfPx = (value: number) => Math.round(value * SHELF_HEIGHT / SHELF_SOURCE.height);
const SHELF_SIDE = { left: shelfPx(SHELF_SOURCE.sideLeft), right: shelfPx(SHELF_SOURCE.sideRight) };
const SHELF_FRAME = { left: shelfPx(SHELF_SOURCE.frameLeft), right: shelfPx(SHELF_SOURCE.frameRight) };
const SHELF_INSET = {
    top: shelfPx(SHELF_SOURCE.top), bottom: shelfPx(SHELF_SOURCE.bottom),
    left: shelfPx(SHELF_SOURCE.left), right: shelfPx(SHELF_SOURCE.right),
};

/** S-30: 사진으로 만든 책장 칸. 양옆 틀은 비율 그대로, 가운데는 가로로만 늘려서 찌그러지지 않게 한다. */
function ShelfBox({ children }: { children: ReactNode }) {
    return <View style={styles.shelfUnit}>
        <View pointerEvents="none" style={styles.shelfImages}>
            <Image source={shelfLeft} accessible={false} resizeMode="stretch" fadeDuration={0} style={[styles.shelfImage, { width: SHELF_SIDE.left }]} />
            <Image source={shelfCenter} accessible={false} resizeMode="stretch" fadeDuration={0} style={[styles.shelfImage, styles.shelfCenter]} />
            <Image source={shelfRight} accessible={false} resizeMode="stretch" fadeDuration={0} style={[styles.shelfImage, { width: SHELF_SIDE.right }]} />
        </View>
        <View style={styles.shelfInside}>{children}</View>
    </View>;
}

// S-30: 책등 사진 비율과 실패 여부를 사진 주소별로 기억한다.
// 필터를 바꿔 책장이 다시 그려져도 처음부터 다시 재지 않아서, 책 두께가 한 번 바뀌며 출렁이지 않는다.
const spineRatios = new Map<string, number>();
const spineFailures = new Set<string>();

/** S-30: 책장 한 칸. 책마다 크기를 정하고 layoutShelfRow로 기울기·간격을 계산해 꽂는다. 책이 많으면 칸 안에서 가로로 넘긴다. */
const HIDDEN_PLACEMENT = { angle: 0, origin: 'right', marginLeft: 0 } as const;

function ShelfRow({ books, visibleIds }: { books: readonly BookRecord[]; visibleIds: ReadonlySet<string> }) {
    const [, setVersion] = useState(0);
    const items = books.map(book => {
        const height = Math.round(SPINE_HEIGHT * spineHeightScale(book.id));
        const url = book.sideCoverUrl;
        const image = !!url && !spineFailures.has(url);
        const width = image && url ? spineImageWidth(spineRatios.get(url), height) : Math.round(sizes.minTouch * spineThicknessScale(book.id));
        return { book, image, width, height };
    });
    const remember = (url: string | null, ratio: number | null) => {
        if (!url) return;
        if (ratio === null) {
            if (spineFailures.has(url)) return;
            spineFailures.add(url);
        } else {
            if (spineRatios.get(url) === ratio) return;
            spineRatios.set(url, ratio);
        }
        setVersion(version => version + 1);
    };
    // 필터에 맞지 않는 책은 지우지 않고 숨겨 두고(사진을 다시 불러오지 않게), 보이는 책만으로 배치를 계산한다.
    const visible = items.filter(item => visibleIds.has(item.book.id));
    const placements = new Map(layoutShelfRow(visible.map(({ book, width, height }) => ({ id: book.id, width, height })))
        .map(placement => [placement.id, placement]));
    return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.books}>
        {items.map(item => <ShelfSpine key={item.book.id} {...item} hidden={!visibleIds.has(item.book.id)}
            placement={placements.get(item.book.id) ?? { id: item.book.id, ...HIDDEN_PLACEMENT }}
            onRatio={ratio => remember(item.book.sideCoverUrl, ratio)}
            onFail={() => remember(item.book.sideCoverUrl, null)} />)}
    </ScrollView>;
}

/** S-30: 고른 상태·장르에 맞는 책이 없을 때 보여 줄 안내 문구 */
function emptyMessage(status: ShelfStatus | null, genre: Genre | null) {
    if (status !== null && genre !== null) return '고른 조건에 맞는 책이 없어요. 다른 장르나 상태를 골라 보세요.';
    if (genre !== null) return `${genre} 책이 없어요.`;
    return status !== null ? emptyFilterMessages[status] : '';
}

// S-30 책장 · FR-04, FR-17
export default function ShelfScreen() {
    const insets = useSafeAreaInsets();
    const { repository, error, retry } = useShelfRepository();
    const [filter, setFilter] = useState<ShelfStatus | null>(null);
    const [genre, setGenre] = useState<Genre | null>(null);
    const [genreSheetOpen, setGenreSheetOpen] = useState(false);

    const books = repository ? repository.books.list() : [];
    const counts = countShelfStatuses(books);
    const total = counts.READING + counts.DONE + counts.WANT;
    const statusBooks = filterShelfBooks(books, filter);
    const genreCounts = countShelfGenres(statusBooks);
    const genreOptions: { genre: Genre | null; count: number }[] = [
        { genre: null, count: genreCounts.reduce((sum, item) => sum + item.count, 0) },
        ...genreCounts,
    ];
    const groups = groupShelfBooks(filterShelfGenre(statusBooks, genre));
    // S-30: 필터를 바꿔도 장르 책장을 지우지 않고 숨기기만 해서, 다시 보일 때 깜빡이지 않게 한다.
    const allGroups = groupShelfBooks(books);
    const visibleIds = new Set(groups.flatMap(group => group.books.map(book => book.id)));
    const visibleCounts = new Map(groups.map(group => [group.genre, group.books.length]));
    const shelfGroups = [
        ...groups.map(group => allGroups.find(all => all.genre === group.genre) ?? group),
        ...allGroups.filter(all => !visibleCounts.has(all.genre)),
    ];
    const genreLabel = genre ?? '전체';

    const chooseGenre = (next: Genre | null) => {
        setGenre(next);
        setGenreSheetOpen(false);
    };

    let content;
    if (error) content = <StateView kind="error" message="책장을 불러오지 못했어요." onRetry={retry} />;
    else if (!repository) content = <StateView kind="loading" />;
    else if (total === 0) content = <StateView kind="empty" message="아직 책장에 책이 없어요. 홈에서 읽는 책이나 읽고 싶은 책을 등록해 주세요." />;
    else content = <>
        <View style={styles.filters}>
            {FILTERS.map(status => {
                const selected = filter === status;
                return <Pressable key={status} accessibilityRole="button" accessibilityState={{ selected }}
                    accessibilityLabel={`${bookStatusLabels[status]} ${counts[status]}권`}
                    onPress={() => setFilter(current => toggleShelfFilter(current, status))}
                    style={({ pressed }) => [shelfStyles.choice, styles.filter, selected && shelfStyles.selected, pressed && shelfStyles.pressed]}>
                    <View style={styles.filterInner}>
                        <MaterialCommunityIcons name={selected ? 'check' : bookStatusIcons[status]} color={colors.brand.espresso} size={sizes.icon * 0.75} accessible={false} />
                        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[styles.filterText, selected && styles.filterTextSelected]}>
                            {bookStatusLabels[status]}
                        </Text>
                        <Text numberOfLines={1} style={[styles.filterText, selected && styles.filterTextSelected]}>{counts[status]}</Text>
                    </View>
                </Pressable>;
            })}
        </View>

        <Pressable accessibilityRole="button" accessibilityState={{ expanded: genreSheetOpen }}
            accessibilityLabel={`장르 선택, 지금은 ${genreLabel}`}
            onPress={() => setGenreSheetOpen(true)}
            style={({ pressed }) => [shelfStyles.choice, styles.genreButton, genre !== null && shelfStyles.selected, pressed && shelfStyles.pressed]}>
            <MaterialCommunityIcons name="shape-outline" color={colors.brand.espresso} size={sizes.icon * 0.75} accessible={false} />
            <Text style={[styles.genreButtonText, genre !== null && styles.filterTextSelected]}>장르: {genreLabel}</Text>
            <MaterialCommunityIcons name="chevron-down" color={colors.brand.espresso} size={sizes.icon} accessible={false} />
        </Pressable>

        {(filter !== null || genre !== null) && groups.length === 0 && <StateView kind="empty" message={emptyMessage(filter, genre)} />}
        {shelfGroups.map(group => {
            const count = visibleCounts.get(group.genre) ?? 0;
            return <View key={group.genre} style={[shelfStyles.section, count === 0 && styles.hiddenSection]}
                pointerEvents={count === 0 ? 'none' : 'auto'} accessibilityElementsHidden={count === 0} importantForAccessibility={count === 0 ? 'no-hide-descendants' : 'auto'}>
                {count > 0 && <Text accessibilityRole="header" style={shelfStyles.title}>{group.genre} · {count}권</Text>}
                <ShelfBox><ShelfRow books={group.books} visibleIds={visibleIds} /></ShelfBox>
            </View>;
        })}

        <Modal visible={genreSheetOpen} transparent animationType="slide" onRequestClose={() => setGenreSheetOpen(false)}>
            <View style={styles.sheetRoot}>
                <Pressable style={styles.backdrop} accessibilityRole="button" accessibilityLabel="장르 선택 닫기" onPress={() => setGenreSheetOpen(false)} />
                <View accessibilityViewIsModal style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
                    <Text accessibilityRole="header" style={shelfStyles.title}>장르 선택</Text>
                    <ScrollView style={styles.sheetList}>
                        {genreOptions.map(option => {
                            const selected = genre === option.genre;
                            const name = option.genre ?? '전체';
                            return <Pressable key={name} accessibilityRole="button" accessibilityState={{ selected }}
                                accessibilityLabel={`${name} ${option.count}권`}
                                onPress={() => chooseGenre(option.genre)}
                                style={({ pressed }) => [styles.option, pressed && shelfStyles.pressed]}>
                                <Text style={[shelfStyles.body, selected && styles.optionSelected]}>{name}</Text>
                                <View style={styles.optionRight}>
                                    <Text style={shelfStyles.muted}>{option.count}권</Text>
                                    {selected
                                        ? <MaterialCommunityIcons name="check" color={colors.brand.espresso} size={sizes.icon} accessible={false} />
                                        : <View style={styles.checkSpace} />}
                                </View>
                            </Pressable>;
                        })}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    </>;

    return <Screen title="책장">{content}</Screen>;
}

const styles = StyleSheet.create({
    filters: { flexDirection: 'row', gap: spacing.sm },
    filter: { flex: 1, alignItems: 'center', paddingHorizontal: spacing.xs },
    filterInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
    filterText: { ...typography.caption, color: colors.brand.espresso, flexShrink: 1 },
    filterTextSelected: { fontFamily: typography.heading.fontFamily },
    genreButton: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: spacing.sm },
    genreButtonText: { ...typography.label, color: colors.brand.espresso },
    // S-30: 사진 책장 칸. 책은 윗판·바닥·양옆 틀 안쪽에만 꽂히고, 칸 안에서 가로로 넘겨 본다.
    shelfUnit: { height: SHELF_HEIGHT },
    // 숨김은 display: 'none'을 쓰지 않는다. 새 아키텍처(Fabric)는 display: 'none'인 뷰의 네이티브 뷰를 없애서,
    // 다시 보일 때 책장·책등 사진을 처음부터 다시 불러오며 깜빡인다. 투명 + 절대 위치로 자리만 비키고 뷰는 그대로 둔다.
    hiddenSpine: { position: 'absolute', left: 0, bottom: 0, opacity: 0 },
    hiddenSection: { position: 'absolute', top: 0, left: 0, right: 0, opacity: 0 },
    shelfImages: { ...StyleSheet.absoluteFill, flexDirection: 'row' },
    shelfImage: { height: '100%' },
    shelfCenter: { flex: 1 },
    shelfInside: {
        flex: 1, justifyContent: 'flex-end', overflow: 'hidden',
        marginTop: SHELF_INSET.top, marginBottom: SHELF_INSET.bottom, marginLeft: SHELF_FRAME.left, marginRight: SHELF_FRAME.right,
    },
    books: { alignItems: 'flex-end', paddingLeft: SHELF_INSET.left - SHELF_FRAME.left, paddingRight: SHELF_INSET.right - SHELF_FRAME.right },
    spineBase: { overflow: 'hidden', borderTopLeftRadius: radii.small, borderTopRightRadius: radii.small },
    spine: { paddingVertical: spacing.sm, alignItems: 'center', borderWidth: 1, borderBottomWidth: 0, borderColor: colors.line.border },
    spineTitle: { ...typography.caption, textAlign: 'center' },
    // 책 사이 은은한 그림자(오른쪽)
    spineShade: { position: 'absolute', top: 0, bottom: 0, right: 0, width: spacing.xs / 2, backgroundColor: colors.brand.espresso, opacity: 0.25 },
    reading: { backgroundColor: colors.brand.espresso },
    done: { backgroundColor: colors.text.muted },
    want: { backgroundColor: colors.brand.sand },
    sheetRoot: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { ...StyleSheet.absoluteFill },
    sheet: { maxHeight: '70%', gap: spacing.md, paddingTop: spacing.xl, paddingHorizontal: spacing.xl, backgroundColor: colors.surface.paper, borderTopLeftRadius: radii.card, borderTopRightRadius: radii.card, borderWidth: 1, borderBottomWidth: 0, borderColor: colors.line.border },
    option: { minHeight: sizes.minTouch, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.line.border },
    sheetList: { flexGrow: 0 },
    optionRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    optionSelected: { fontFamily: typography.heading.fontFamily },
    checkSpace: { width: sizes.icon },
});

const spineBackground = { READING: styles.reading, DONE: styles.done, WANT: styles.want } as const;
