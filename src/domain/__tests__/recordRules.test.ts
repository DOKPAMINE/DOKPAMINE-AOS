import { initialRecordFields, newestRecords, recordDateTime, validateRecordFields } from '../recordRules';
import type { ReadingSession } from '../readingTypes';

const now = Date.parse('2026-11-01T16:00:00Z');
test('FR-02 S-36 KST 자정 경계와 현재 쪽을 초기 입력에 반영해요', () => {
    expect(recordDateTime(now)).toEqual({ date: '2026-11-02', time: '01:00' });
    expect(initialRecordFields(84, 240, now, null)).toEqual({ date: '2026-11-02', time: '00:30', minutes: '30', startPage: '84', endPage: '' });
});

test('FR-04 S-35 최신순 동률은 생성 시각과 ID로 정하고 입력 배열을 보존해요', () => {
    const rows = [
        { id: 'a', startedAt: 1, createdAt: 2, deleted: false }, { id: 'b', startedAt: 1, createdAt: 2, deleted: false },
        { id: 'c', startedAt: 1, createdAt: 1, deleted: false }, { id: 'd', startedAt: 2, createdAt: 1, deleted: true },
    ] as ReadingSession[];
    expect(newestRecords(rows).map(row => row.id)).toEqual(['b', 'a', 'c']);
    expect(rows.map(row => row.id)).toEqual(['a', 'b', 'c', 'd']);
});

test('FR-02 S-36 시작보다 작은 종료 쪽과 날짜 형식 오류를 거절해요', () => {
    const fields = { date: '2026-11-01', time: '10:00', minutes: '1', startPage: '84', endPage: '83' };
    expect(validateRecordFields(fields, 240, now)).toEqual({ kind: 'invalid', message: '종료 페이지는 시작 페이지 이상으로 입력해 주세요.' });
    expect(validateRecordFields({ ...fields, time: '24:00' }, 240, now).kind).toBe('invalid');
});
