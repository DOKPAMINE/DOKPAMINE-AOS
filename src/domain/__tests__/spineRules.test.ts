import {
    LEAN_MAX_DEGREES, LEAN_MIN_DEGREES, SPINE_HEIGHT_MIN_SCALE, SPINE_THICKNESS_MIN_SCALE,
    chainGap, layoutShelfRow, leanGap, spineHeightScale, spineThicknessScale, type ShelfItem,
} from '../spineRules';

const shelf = (count: number, prefix = 'book'): ShelfItem[] =>
    Array.from({ length: count }, (_, i) => ({ id: `${prefix}-${i}`, width: 30 + (i % 4) * 4, height: 190 + (i % 5) * 6 }));

describe('FR-04 S-30 책등 높이·두께', () => {
    it('FR-04 S-30 같은 책은 언제나 같은 높이와 두께예요', () => {
        expect(spineHeightScale('book-1')).toBe(spineHeightScale('book-1'));
        expect(spineThicknessScale('book-1')).toBe(spineThicknessScale('book-1'));
    });

    it('FR-04 S-30 높이와 두께 비율은 정해진 범위 안에서 다양하게 나와요', () => {
        const ids = Array.from({ length: 100 }, (_, i) => `book-${i}`);
        for (const id of ids) {
            expect(spineHeightScale(id)).toBeGreaterThanOrEqual(SPINE_HEIGHT_MIN_SCALE);
            expect(spineHeightScale(id)).toBeLessThanOrEqual(1);
            expect(spineThicknessScale(id)).toBeGreaterThanOrEqual(SPINE_THICKNESS_MIN_SCALE);
            expect(spineThicknessScale(id)).toBeLessThanOrEqual(1);
        }
        expect(new Set(ids.slice(0, 20).map(spineHeightScale)).size).toBeGreaterThan(15);
    });
});

describe('FR-04 S-30 책장 배치', () => {
    it('FR-04 S-30 같은 책 목록이면 언제나 같은 배치예요', () => {
        expect(layoutShelfRow(shelf(30))).toEqual(layoutShelfRow(shelf(30)));
    });

    it('FR-04 S-30 기운 책은 언제나 받침(똑바로 선 책이나 왼쪽 벽)에 기대요', () => {
        for (let count = 1; count <= 40; count += 1) {
            const placements = layoutShelfRow(shelf(count, `shelf${count}`));
            placements.forEach((placement, k) => {
                if (placement.angle > 0) {
                    // 오른쪽으로 기울면 오른쪽에 같은 각도로 기운 책이 이어지거나 똑바로 선 받침이 있어야 해요
                    const next = placements[k + 1];
                    expect(next).toBeDefined();
                    expect(next.angle === 0 || next.angle === placement.angle).toBe(true);
                }
                if (placement.angle < 0 && k > 0) {
                    const previous = placements[k - 1];
                    expect(previous.angle === 0 || previous.angle === placement.angle).toBe(true);
                }
            });
            // 연속으로 기운 책의 끝에는 반드시 똑바로 선 책이 받쳐요
            placements.forEach((placement, k) => {
                if (placement.angle > 0) {
                    let j = k;
                    while (placements[j].angle > 0) j += 1;
                    expect(placements[j].angle).toBe(0);
                }
            });
        }
    });

    it('FR-04 S-30 기울기는 3~7도이고, 똑바로 선 책과 양쪽으로 기운 책이 섞여요', () => {
        const placements = Array.from({ length: 10 }, (_, s) => layoutShelfRow(shelf(20, `mix${s}`))).flat();
        for (const { angle } of placements) {
            if (angle !== 0) {
                expect(Math.abs(angle)).toBeGreaterThanOrEqual(LEAN_MIN_DEGREES);
                expect(Math.abs(angle)).toBeLessThanOrEqual(LEAN_MAX_DEGREES);
            }
        }
        const upright = placements.filter(p => p.angle === 0).length;
        expect(upright).toBeGreaterThan(placements.length / 2);
        expect(placements.some(p => p.angle > 0)).toBe(true);
        expect(placements.some(p => p.angle < 0)).toBe(true);
    });

    it('FR-04 S-30 같은 방향으로 두 권이 이어서 기대는 경우도 있어요', () => {
        const placements = Array.from({ length: 20 }, (_, s) => layoutShelfRow(shelf(20, `chain${s}`)));
        const hasChain = placements.some(row => row.some((p, k) => k > 0 && p.angle !== 0 && p.angle === row[k - 1].angle));
        expect(hasChain).toBe(true);
    });

    it('FR-04 S-30 오른쪽으로 기울면 회전 축은 오른쪽 아래, 왼쪽이면 왼쪽 아래 모서리예요', () => {
        const placements = Array.from({ length: 10 }, (_, s) => layoutShelfRow(shelf(20, `origin${s}`))).flat();
        for (const p of placements) {
            if (p.angle > 0) expect(p.origin).toBe('right');
            if (p.angle < 0) expect(p.origin).toBe('left');
        }
    });

    it('FR-04 S-30 간격은 음수가 아니고, 붙은 책과 조금 떨어진 책이 섞여요', () => {
        const placements = Array.from({ length: 10 }, (_, s) => layoutShelfRow(shelf(20, `gap${s}`))).flat();
        expect(placements.every(p => p.marginLeft >= 0)).toBe(true);
        expect(placements.some(p => p.marginLeft === 0)).toBe(true);
        expect(placements.some(p => p.marginLeft > 0)).toBe(true);
    });

    it('FR-04 S-30 마지막 책을 똑같은 방식으로 기울이지 않고, 책이 적으면 억지로 기울이지 않아요', () => {
        const lastLeans = Array.from({ length: 30 }, (_, s) => layoutShelfRow(shelf(6, `last${s}`)))
            .map(row => row[row.length - 1].angle);
        expect(new Set(lastLeans).size).toBeGreaterThan(1);
        expect(lastLeans.some(angle => angle === 0)).toBe(true);
        const one = layoutShelfRow([{ id: 'only', width: 30, height: 200 }]);
        if (one[0].angle < 0) expect(one[0].marginLeft).toBe(leanGap(200, -one[0].angle, Infinity));
        expect(one[0].angle).toBeLessThanOrEqual(0);
        expect(layoutShelfRow([])).toEqual([]);
    });

    it('FR-04 S-30 기운 책은 받침에 닿을 만큼만 떨어져요', () => {
        // 받침이 더 낮으면 받침 위 모서리에 닿고, 더 높으면 기운 책 꼭대기가 받침 옆면에 닿아요
        expect(leanGap(200, 10, 100)).toBe(Math.ceil(100 * Math.tan(Math.PI / 18) * 2) / 2);
        expect(leanGap(200, 10, 400)).toBe(Math.ceil(200 * Math.sin(Math.PI / 18) * 2) / 2);
        expect(chainGap(30, 0)).toBe(0);
        expect(chainGap(30, 10)).toBeGreaterThan(0);
    });

    it('FR-04 S-30 책을 더하거나 빼도 배치 규칙을 지켜요', () => {
        const base = shelf(12, 'edit');
        for (const items of [base.slice(0, 11), [...base, { id: 'new', width: 34, height: 200 }], base.filter((_, k) => k !== 5)]) {
            const placements = layoutShelfRow(items);
            expect(placements).toHaveLength(items.length);
            placements.forEach((p, k) => { if (p.angle > 0) expect(placements[k + 1]).toBeDefined(); });
        }
    });
});
