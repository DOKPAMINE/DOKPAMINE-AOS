import { bookTitleLine, boxRepresentative, groupCover, groupReviewBoxes, loungeBoxLabel, OPENING_BRACKET_INDENT_EM, openingBracketIndent, previewText, sortReviewBoxes, splitUserBookReviews, userBookReportHeadings, withMine, writtenDate } from '../loungeRules';

test('#113 S-70 S-76 첫 줄은 "『책 제목』"이고 내가 쓴 박스면 "(내 감상)"을 붙여요', () => {
    expect(bookTitleLine('데미안', false)).toBe('『데미안』');
    expect(bookTitleLine('데미안', true)).toBe('『데미안』 (내 감상)');
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

const review = (id: string, fields: Partial<{ userBookId: string | null; oneLine: string | null; body: string | null;
    publishedAt: string | null; bodyWrittenAt: string | null; likeCount: number }> = {}) =>
    ({ id, userBookId: null, oneLine: null, body: null, publishedAt: null, bodyWrittenAt: null, likeCount: 0, ...fields });

test('#113 S-71 대표 감상은 가장 최근에 새로 쓴 독후감이고 같으면 서버 순서가 앞선 것, 독후감이 없으면 첫 한줄평이에요', () => {
    expect(boxRepresentative([
        review('a', { body: '독후감', bodyWrittenAt: '2026-11-01T00:00:00Z' }),
        review('b', { oneLine: '한줄평' }),
        review('c', { body: '새 독후감', bodyWrittenAt: '2026-11-10T00:00:00Z' }),
        review('d', { body: '같은 시각', bodyWrittenAt: '2026-11-10T00:00:00Z' }),
    ]).id).toBe('c');
    expect(boxRepresentative([review('a', { oneLine: ' ' }), review('b', { oneLine: '한줄평' }), review('c', { oneLine: '다음' })]).id).toBe('b');
    expect(boxRepresentative([review('a', { body: '시각 없는 독후감' }), review('b', { oneLine: '한줄평' })]).id).toBe('a');
});

test('#113 S-71 감상을 userBookId별 박스로 묶고 userBookId가 없는 감상은 하나씩 박스가 돼요', () => {
    const boxes = groupReviewBoxes([
        review('a', { userBookId: 'u1' }), review('b', { userBookId: 'u2' }), review('c'), review('d', { userBookId: 'u1' }),
    ]);
    expect(boxes.map(box => [box.key, box.userBookId, box.reviews.map(item => item.id)])).toEqual([
        ['user-book:u1', 'u1', ['a', 'd']], ['user-book:u2', 'u2', ['b']], ['review:c', null, ['c']],
    ]);
});

test('#113 S-71 최신순은 가장 늦은 공개 시각, 시각이 없으면 마지막, 같으면 userBookId 순이에요', () => {
    const boxes = groupReviewBoxes([
        review('a', { userBookId: 'u-b', publishedAt: '2026-11-01T00:00:00Z' }),
        review('b', { userBookId: 'u-none' }),
        review('c', { userBookId: 'u-c', publishedAt: '2026-10-01T00:00:00Z' }),
        review('d', { userBookId: 'u-c', publishedAt: '2026-11-05T00:00:00Z' }),
        review('e', { userBookId: 'u-a', publishedAt: '2026-11-01T00:00:00Z' }),
    ]);
    expect(sortReviewBoxes(boxes, 'latest').map(box => box.userBookId)).toEqual(['u-c', 'u-a', 'u-b', 'u-none']);
    // 원본 순서는 바꾸지 않는다.
    expect(boxes.map(box => box.userBookId)).toEqual(['u-b', 'u-none', 'u-c', 'u-a']);
});

test('#113 S-71 좋아요 많은 순은 박스 안 좋아요 합계이고 같으면 최신순이에요', () => {
    const boxes = groupReviewBoxes([
        review('a', { userBookId: 'u1', likeCount: 3, publishedAt: '2026-11-01T00:00:00Z' }),
        review('b', { userBookId: 'u1', likeCount: 2, publishedAt: '2026-10-01T00:00:00Z' }),
        review('c', { userBookId: 'u2', likeCount: 5, publishedAt: '2026-11-10T00:00:00Z' }),
        review('d', { userBookId: 'u3', likeCount: 9, publishedAt: '2026-09-01T00:00:00Z' }),
    ]);
    // u3 9개 > u1·u2 5개 동점은 최신순(u2 11월 10일 > u1 11월 1일)이다.
    expect(sortReviewBoxes(boxes, 'likes').map(box => box.userBookId)).toEqual(['u3', 'u2', 'u1']);
});

test('#113 S-76 독후감 번호는 쓴 시각이 이른 순, 같으면 ID 순, 시각이 없으면 마지막이고 날짜는 KST예요', () => {
    const headings = userBookReportHeadings([
        { id: 'new', bodyWrittenAt: '2026-11-15T03:00:00Z' },
        { id: 'none', bodyWrittenAt: null },
        { id: 'b-same', bodyWrittenAt: '2026-11-14T15:00:00Z' },
        { id: 'a-same', bodyWrittenAt: '2026-11-14T15:00:00Z' },
    ]);
    expect(Object.fromEntries(headings)).toEqual({
        'a-same': { text: '독후감 1 · 2026. 11. 15.', label: '독후감 1, 2026년 11월 15일' },
        'b-same': { text: '독후감 2 · 2026. 11. 15.', label: '독후감 2, 2026년 11월 15일' },
        new: { text: '독후감 3 · 2026. 11. 15.', label: '독후감 3, 2026년 11월 15일' },
        none: { text: '독후감 4', label: '독후감 4' },
    });
});

test('#113 S-70 S-71 스크린리더용 감상 앞부분은 공백을 한 칸으로 줄이고 80자를 넘으면 줄임표를 붙여요', () => {
    expect(previewText('  첫 줄\n\n둘째   줄 ')).toBe('첫 줄 둘째 줄');
    expect(previewText('가'.repeat(80))).toBe('가'.repeat(80));
    expect(previewText('가'.repeat(81))).toBe(`${'가'.repeat(80)}…`);
    // 자른 자리 끝의 공백은 지우고 줄임표를 붙인다.
    expect(previewText(`${'가'.repeat(79)} 나다`)).toBe(`${'가'.repeat(79)}…`);
    // 이모지처럼 두 코드 단위인 글자를 반으로 자르지 않는다.
    expect(previewText('📚'.repeat(81))).toBe(`${'📚'.repeat(80)}…`);
});

test('#113 S-70 박스는 『제목』 → 닉네임 → 감상 → 날짜 순서로 읽고, 내 박스면 제목 뒤에 "(내 감상)"을 붙여요', () => {
    expect(loungeBoxLabel({ nickname: '독자', bookTitle: '데미안', mine: false, text: '오래 남았어요.', date: { label: '2026년 11월 25일' } }))
        .toBe('『데미안』, 독자, 오래 남았어요., 2026년 11월 25일에 쓴 독후감');
    expect(loungeBoxLabel({ nickname: '독자', bookTitle: '데미안', mine: true, text: '한줄평', date: null }))
        .toBe('『데미안』 (내 감상), 독자, 한줄평');
    expect(loungeBoxLabel({ nickname: '독자', bookTitle: '데미안', mine: false, text: ' ', date: null })).toBe('『데미안』, 독자');
});

test('#113 S-71 박스는 책 제목 없이 닉네임 → 감상 → 날짜 순서로 읽고, 내 박스면 닉네임 뒤에 "(내 감상)"을 붙여요', () => {
    expect(withMine('독자', false)).toBe('독자');
    expect(withMine('독자', true)).toBe('독자 (내 감상)');
    expect(loungeBoxLabel({ nickname: '독자', mine: true, text: '오래 남았어요.', date: { label: '2026년 11월 25일' } }))
        .toBe('독자 (내 감상), 오래 남았어요., 2026년 11월 25일에 쓴 독후감');
    expect(loungeBoxLabel({ nickname: '독자', mine: false, text: '한줄평', date: null })).toBe('독자, 한줄평');
});

test('#113 S-71 묶음 표지는 coverUrl이 있는 첫 감상의 것이고, 없으면 첫 감상 장르의 기본 표지예요', () => {
    expect(groupCover([
        { coverUrl: null, genre: '소설' }, { coverUrl: ' ', genre: '시' },
        { coverUrl: 'https://a.example/1.jpg', genre: '에세이' }, { coverUrl: 'https://a.example/2.jpg', genre: '과학' },
    ])).toEqual({ uri: 'https://a.example/1.jpg', genre: '에세이' });
    expect(groupCover([{ genre: '소설' }, { coverUrl: null, genre: '시' }])).toEqual({ uri: null, genre: '소설' });
    expect(groupCover([])).toEqual({ uri: null, genre: '기타' });
});

test.each([[16, 1, 9.1], [18, 1, 10.3], [16, 2, 18.2], [18, 1.3, 13.3]])(
    '#113 S-70 S-76 『 왼쪽 빈 공간 0.57em만큼 첫 줄을 당겨요: %ssp, 글씨 배율 %s → %sdp', (fontSize, fontScale, indent) => {
        expect(OPENING_BRACKET_INDENT_EM).toBe(0.57);
        expect(openingBracketIndent(fontSize, fontScale)).toBe(indent);
    },
);
