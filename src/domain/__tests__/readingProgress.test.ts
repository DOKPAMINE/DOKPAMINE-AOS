import { readingProgress } from '../readingProgress';

describe('FR-03 · PRD D6 쪽수 진행 표시', () => {
    test.each([
        [0, 240, '0 / 240쪽', 0],
        [84, 240, '84 / 240쪽', 0.35],
        [300, 240, '300 / 240쪽', 1],
        [0, 0, '0 / 0쪽', 0],
        [84, 0, '84 / 0쪽', 0],
        [-10, 240, '0 / 240쪽', 0],
        [Number.NaN, Number.POSITIVE_INFINITY, '0 / 0쪽', 0],
    ])('FR-03 현재 %s쪽·전체 %s쪽이면 %s과 안전한 막대를 반환해요', (current, total, label, ratio) => {
        expect(readingProgress(current, total)).toEqual({ label, ratio });
    });
});
