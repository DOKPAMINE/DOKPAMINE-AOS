import { loungeBoxHeading, splitUserBookReviews, writtenDate } from '../loungeRules';

test('#113 S-70 박스 제목은 "닉네임 · 『책 제목』"이에요', () => {
    expect(loungeBoxHeading('독자', '데미안')).toBe('독자 · 『데미안』');
});

test.each([
    ['2026-11-24T15:00:00Z', '2026. 11. 25.', '2026년 11월 25일'],
    ['2026-11-24T14:59:59.999Z', '2026. 11. 24.', '2026년 11월 24일'],
    ['2026-01-04T23:30:00+09:00', '2026. 1. 4.', '2026년 1월 4일'],
    ['2026-12-31T15:00:00Z', '2027. 1. 1.', '2027년 1월 1일'],
])('#113 S-70 S-76 독후감을 쓴 시각 %s는 기기 시간대와 관계없이 KST로 %s예요', (iso, text, label) => {
    expect(writtenDate(iso)).toEqual({ text, label });
});

test.each([null, undefined, '', '날짜 아님'])('#113 S-70 독후감을 쓴 시각이 %p이면 날짜를 보여 주지 않아요', iso => {
    expect(writtenDate(iso)).toBeNull();
});

test('#113 S-76 한줄평과 독후감을 나누고 각 묶음은 서버 순서를 지켜요', () => {
    const reviews = [
        { id: 'report-new', oneLine: null, body: '두 번째 독후감' },
        { id: 'one-line', oneLine: '한줄평', body: null },
        { id: 'both', oneLine: '예전 한줄평', body: '예전 독후감' },
        { id: 'report-old', oneLine: '', body: '첫 독후감' },
        { id: 'empty', oneLine: '  ', body: ' ' },
        { id: 'one-line-old', oneLine: '예전 한줄평만', body: '   ' },
    ];
    const { oneLines, reports } = splitUserBookReviews(reviews);
    expect(oneLines.map(review => review.id)).toEqual(['one-line', 'one-line-old']);
    // 한줄평과 독후감이 함께 든 예전 감상은 좋아요가 하나라 독후감에만 한 번 넣는다.
    expect(reports.map(review => review.id)).toEqual(['report-new', 'both', 'report-old']);
});
