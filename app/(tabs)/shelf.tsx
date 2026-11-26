import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, StateView } from '../../src/components';
import type { Genre } from '../../src/domain/pageRules';
import { countShelfGenres, countShelfStatuses, filterShelfBooks, filterShelfGenre, groupShelfBooks, toggleShelfFilter, type ShelfStatus } from '../../src/domain/shelfRules';
import type { BookRecord } from '../../src/db/schema';
import { isSpineImageRatio, packShelfRows, shelfRowWidth, spineHeightScale, spineThicknessScale, type ShelfPlacement } from '../../src/domain/spineRules';
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
    /** 책장 묶음 안에서 책등 왼쪽 위 위치(dp). 숨긴 책은 null */
    position: { left: number; top: number } | null;
    hidden: boolean;
    onRatio: (ratio: number) => void;
    onFail: () => void;
};

/** S-30: 책등 이미지가 있으면 실제 책등을, 없거나 불러오지 못하면 색 책등과 세로 제목을 보여 준다. */
function ShelfSpine({ book, image, width, height, placement, position, hidden, onRatio, onFail }: SpineProps) {
    const label = `${book.title}, ${book.author}, ${bookStatusLabels[book.status]}, 책 상세 보기`;
    const open = () => router.push({ pathname: '/book/[id]', params: { id: book.id } });
    // 접근성: 보이는 폭은 책등만큼, 모자란 터치 영역(44dp)은 hitSlop으로 채운다.
    const slop = Math.max(0, (sizes.minTouch - width) / 2);
    // S-30: 기운 책은 바닥에 닿은 아래 모서리를 축으로 돌려서 공중에 뜨지 않게 한다.
    const lean = placement.angle === 0 ? null : {
        transform: [{ rotate: `${placement.angle}deg` }],
        transformOrigin: placement.origin === 'right' ? 'right bottom' : 'left bottom',
    };
    const frame = { width, height, ...(position ?? {}) };
    return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={open} hitSlop={{ left: slop, right: slop }}
        accessibilityElementsHidden={hidden} importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
        disabled={hidden} pointerEvents={hidden ? 'none' : 'auto'}
        style={({ pressed }) => [styles.spineBase, styles.spinePlaced, frame, lean, hidden && styles.hiddenSpine, !image && [styles.spine, spineBackground[book.status]], pressed && shelfStyles.pressed]}>
        {image
            ? <Image testID={`spine-image-${book.id}`} source={{ uri: book.sideCoverUrl ?? undefined }} accessible={false} resizeMode="stretch" fadeDuration={0}
                onLoad={event => { const { width: w, height: h } = event.nativeEvent.source; if (w > 0 && h > 0) onRatio(w / h); }}
                onError={onFail} style={{ width, height }} />
            : <Text style={[styles.spineTitle, { color: spineInk[book.status] }]}>{spineTitle(book.title)}</Text>}
        <View pointerEvents="none" style={styles.spineShade} />
    </Pressable>;
}

// S-30: 책장 칸 이미지(원본 611px 높이)를 왼쪽·가운데·오른쪽으로 나눠, 가운데만 가로로 늘리거나 줄인다.
// side*: 잘라 둔 양옆 조각의 폭, top·bottom·left·right: 책이 놓이는 바닥 영역까지의 거리(모두 원본 픽셀).
const SHELF_SOURCE = { height: 611, sideLeft: 100, sideRight: 103, top: 43, bottom: 53, left: 62, right: 64 } as const;
const SHELF_HEIGHT = Math.round((SPINE_HEIGHT + spacing.sm) * SHELF_SOURCE.height / (SHELF_SOURCE.height - SHELF_SOURCE.top - SHELF_SOURCE.bottom));
const shelfPx = (value: number) => Math.round(value * SHELF_HEIGHT / SHELF_SOURCE.height);
const SHELF_SIDE = { left: shelfPx(SHELF_SOURCE.sideLeft), right: shelfPx(SHELF_SOURCE.sideRight) };
const SHELF_INSET = {
    top: shelfPx(SHELF_SOURCE.top), bottom: shelfPx(SHELF_SOURCE.bottom),
    left: shelfPx(SHELF_SOURCE.left), right: shelfPx(SHELF_SOURCE.right),
};

/** S-30: 사진으로 만든 선반 한 층. 양옆 틀은 비율 그대로, 가운데는 가로로만 늘려서 찌그러지지 않게 한다. */
function ShelfBackground({ top }: { top: number }) {
    return <View pointerEvents="none" style={[styles.shelfImages, { top, height: SHELF_HEIGHT }]}>
        <Image source={shelfLeft} accessible={false} resizeMode="stretch" fadeDuration={0} style={[styles.shelfImage, { width: SHELF_SIDE.left }]} />
        <Image source={shelfCenter} accessible={false} resizeMode="stretch" fadeDuration={0} style={[styles.shelfImage, styles.shelfCenter]} />
        <Image source={shelfRight} accessible={false} resizeMode="stretch" fadeDuration={0} style={[styles.shelfImage, { width: SHELF_SIDE.right }]} />
    </View>;
}

// S-30: 책등 사진 비율과 실패 여부를 사진 주소별로 기억한다.
// 필터를 바꿔 책장이 다시 그려져도 처음부터 다시 재지 않아서, 책 두께가 한 번 바뀌며 출렁이지 않는다.
const spineRatios = new Map<string, number>();
const spineFailures = new Set<string>();

const HIDDEN_PLACEMENT = { angle: 0, origin: 'right', marginLeft: 0 } as const;
/** 마지막 층이 아닌 층에서 남는 폭을 책 사이에 나눠 줄 때, 한 틈에 더하는 최대 폭 */
const MAX_EXTRA_GAP = spacing.xs / 2;
/**
 * S-30: 책장. 책마다 크기를 정하고, 선반 폭을 넘으면 아래에 선반을 한 층 더 쌓아 이어서 꽂는다(가로 스크롤 없음).
 * 책등은 층이 바뀌어도 같은 부모 안에서 위치만 옮겨서, 다시 그리며 사진을 불러오지 않는다(깜빡임 방지).
 */
function ShelfStack({ books, visibleIds }: { books: readonly BookRecord[]; visibleIds: ReadonlySet<string> }) {
    const [, setVersion] = useState(0);
    const [rowWidth, setRowWidth] = useState(0);
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
    // 필터에 맞지 않는 책은 지우지 않고 숨겨 두고(사진을 다시 불러오지 않게), 보이는 책만으로 층과 배치를 계산한다.
    const visible = items.filter(item => visibleIds.has(item.book.id));
    // 폭을 재기 전에는 한 층에 모두 두고, 잰 뒤에는 선반 폭에 맞춰 층을 나눈다.
    const maxWidth = rowWidth > 0 ? rowWidth : Infinity;
    const toShelfItem = ({ book, width, height }: typeof items[number]) => ({ id: book.id, width, height });
    const rows = packShelfRows(visible.map(toShelfItem), maxWidth);
    const placed = new Map<string, { placement: ShelfPlacement; position: { left: number; top: number } }>();
    rows.forEach((row, r) => {
        const floor = (r + 1) * SHELF_HEIGHT - SHELF_INSET.bottom;
        // 마지막 층이 아니면 남는 폭을 똑바로 선 책 사이에 조금씩 나눠 줄 끝까지 차 보이게 한다.
        // 기댄 책과 받침 사이(맞닿아야 하는 곳)는 건드리지 않는다.
        const joints = row.placements.filter((placement, k) => k > 0 && row.placements[k - 1].angle <= 0 && placement.angle >= 0).length;
        const slack = r < rows.length - 1 && Number.isFinite(maxWidth) ? Math.max(0, maxWidth - shelfRowWidth(row.placements, row.items)) : 0;
        const extra = joints > 0 ? Math.min(MAX_EXTRA_GAP, slack / joints) : 0;
        let x = SHELF_INSET.left;
        row.items.forEach((item, k) => {
            const placement = row.placements[k];
            const joint = k > 0 && row.placements[k - 1].angle <= 0 && placement.angle >= 0;
            x += placement.marginLeft + (joint ? extra : 0);
            placed.set(item.id, { placement, position: { left: x, top: floor - item.height } });
            x += item.width;
        });
    });
    const floors = Math.max(1, rows.length);
    // 선반 사진은 모든 책을 꽂을 때 필요한 층 수만큼 늘 그려 두고, 지금 필요한 층까지만 보이게 자른다.
    // 필터를 바꿔 층 수가 줄었다 늘어도 선반 사진을 새로 불러오지 않아서 깜빡이지 않는다.
    const builtFloors = Math.max(floors, packShelfRows(items.map(toShelfItem), maxWidth).length);
    return <View style={[styles.stack, { height: floors * SHELF_HEIGHT }]}
        onLayout={event => {
            // 숨겨진 동안(보이는 책 0권)은 자리 비키느라 폭이 달라지므로 재지 않는다. 다시 보일 때 넓은 폭으로 한 번 잘못 꽂히는 것을 막는다.
            if (visible.length > 0) setRowWidth(event.nativeEvent.layout.width - SHELF_INSET.left - SHELF_INSET.right);
        }}>
    {Array.from({ length: builtFloors }, (_, r) => <ShelfBackground key={`floor-${r}`} top={r * SHELF_HEIGHT} />)}
        {items.map(item => {
            const spot = placed.get(item.book.id);
            return <ShelfSpine key={item.book.id} {...item} hidden={!spot}
                placement={spot?.placement ?? { id: item.book.id, ...HIDDEN_PLACEMENT }} position={spot?.position ?? null}
                onRatio={ratio => remember(item.book.sideCoverUrl, isSpineImageRatio(ratio) ? ratio : null)}
                onFail={() => remember(item.book.sideCoverUrl, null)} />;
        })}
    </View>;
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
    // S-30: 책장은 하나다. 모든 책을 장르끼리 이어서 꽂아 두고, 상태·장르 필터는 보일 책만 고른다.
    // 필터를 바꿔도 책장과 책등을 다시 그리지 않아서 깜빡이지 않는다.
    const shelfBooks = groupShelfBooks(books).flatMap(group => group.books);
    const visibleIds = new Set(groups.flatMap(group => group.books.map(book => book.id)));
    const visibleCount = visibleIds.size;
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
        <View style={[shelfStyles.section, visibleCount === 0 && styles.hiddenSection]}
            pointerEvents={visibleCount === 0 ? 'none' : 'auto'} accessibilityElementsHidden={visibleCount === 0}
            importantForAccessibility={visibleCount === 0 ? 'no-hide-descendants' : 'auto'}>
            {visibleCount > 0 && <Text accessibilityRole="header" style={shelfStyles.title}>{genreLabel} · {visibleCount}권</Text>}
            <ShelfStack books={shelfBooks} visibleIds={visibleIds} />
        </View>

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
    // S-30: 사진 선반을 층 수만큼 쌓고, 책등은 그 위에 절대 위치로 놓는다.
    stack: { overflow: 'hidden' },
    // 숨김은 display: 'none'을 쓰지 않는다. 새 아키텍처(Fabric)는 display: 'none'인 뷰의 네이티브 뷰를 없애서,
    // 다시 보일 때 책장·책등 사진을 처음부터 다시 불러오며 깜빡인다. 투명 + 절대 위치로 자리만 비키고 뷰는 그대로 둔다.
    hiddenSpine: { position: 'absolute', left: 0, bottom: 0, opacity: 0 },
    hiddenSection: { position: 'absolute', top: 0, left: 0, right: 0, opacity: 0 },
    shelfImages: { position: 'absolute', left: 0, right: 0, flexDirection: 'row' },
    shelfImage: { height: '100%' },
    shelfCenter: { flex: 1 },
    spinePlaced: { position: 'absolute' },
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
