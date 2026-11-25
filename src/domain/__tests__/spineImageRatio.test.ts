import { MAX_SPINE_IMAGE_RATIO, isSpineImageRatio } from '../spineRules';

describe('FR-04 S-30 책등 사진 비율 확인', () => {
    it('FR-04 S-30 길쭉한 실제 책등 사진은 그대로 써요', () => {
        expect(isSpineImageRatio(0.08)).toBe(true);
        expect(isSpineImageRatio(0.25)).toBe(true);
        expect(isSpineImageRatio(MAX_SPINE_IMAGE_RATIO)).toBe(true);
    });

    it('FR-04 S-30 넓적한 대체 그림(이미지 준비중 등)은 책등으로 쓰지 않아요', () => {
        expect(isSpineImageRatio(0.5)).toBe(false);
        expect(isSpineImageRatio(1)).toBe(false);
    });

    it('FR-04 S-30 잘못된 비율은 책등으로 쓰지 않아요', () => {
        expect(isSpineImageRatio(0)).toBe(false);
        expect(isSpineImageRatio(-1)).toBe(false);
        expect(isSpineImageRatio(Number.NaN)).toBe(false);
        expect(isSpineImageRatio(Number.POSITIVE_INFINITY)).toBe(false);
    });
});
