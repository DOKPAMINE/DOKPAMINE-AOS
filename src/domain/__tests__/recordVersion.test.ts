import { nextRecordVersion } from '../recordVersion';

test('NFR-05 S-45 같은 밀리초와 시계 역행에도 버전이 증가해요', () => {
    expect(nextRecordVersion(100)).toBe(100);
    expect(nextRecordVersion(100, 100)).toBe(101);
    expect(nextRecordVersion(90, 100)).toBe(101);
    expect(nextRecordVersion(200, 100)).toBe(200);
});
test.each([NaN, Infinity, 1.5])('NFR-05 S-45 저장할 수 없는 시각 %s는 거부해요', now => {
    expect(() => nextRecordVersion(now)).toThrow();
});
test('NFR-05 S-45 버전 정수 범위를 넘으면 기록을 변경하지 않아요', () => {
    expect(() => nextRecordVersion(100, Number.MAX_SAFE_INTEGER)).toThrow();
});
