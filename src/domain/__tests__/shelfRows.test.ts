import { layoutShelfRow, packShelfRows, shelfRowWidth, type ShelfItem } from '../spineRules';

const shelf = (count: number, prefix = 'book'): ShelfItem[] =>
    Array.from({ length: count }, (_, i) => ({ id: `${prefix}-${i}`, width: 30 + (i % 4) * 4, height: 160 + (i % 5) * 5 }));

describe('FR-04 S-30 장르 책장 여러 층으로 나눠 꽂기', () => {
    it('FR-04 S-30 선반 폭을 넘지 않게 나누고, 책 순서와 권수는 그대로예요', () => {
        const items = shelf(40, 'pack');
        const rows = packShelfRows(items, 300);
        expect(rows.length).toBeGreaterThan(1);
        for (const row of rows) expect(shelfRowWidth(row.placements, row.items)).toBeLessThanOrEqual(300);
        expect(rows.flatMap(row => row.items.map(item => item.id))).toEqual(items.map(item => item.id));
    });

    it('FR-04 S-30 층마다 기울기 규칙을 지켜서 층 끝 책이 빈 곳으로 기울지 않아요', () => {
        for (let s = 0; s < 30; s += 1) {
            for (const row of packShelfRows(shelf(30, `edge${s}`), 260)) {
                expect(row.placements[row.placements.length - 1].angle).toBeLessThanOrEqual(0);
                expect(row.placements).toEqual(layoutShelfRow(row.items));
            }
        }
    });

    it('FR-04 S-30 책이 적으면 한 층이고, 선반보다 넓은 책은 따로 한 층이에요', () => {
        expect(packShelfRows(shelf(3, 'few'), 300)).toHaveLength(1);
        expect(packShelfRows([{ id: 'wide', width: 500, height: 200 }], 300)).toHaveLength(1);
        expect(packShelfRows([], 300)).toEqual([]);
        expect(packShelfRows(shelf(40, 'all'), Infinity)).toHaveLength(1);
    });

    it('FR-04 S-30 같은 책과 같은 폭이면 언제나 같은 층 배치예요', () => {
        expect(packShelfRows(shelf(25, 'same'), 280)).toEqual(packShelfRows(shelf(25, 'same'), 280));
    });
});
