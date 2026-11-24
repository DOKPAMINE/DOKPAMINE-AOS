import { normalizeIsbn } from '../bookAddRules';
import { isbnToLookup } from '../isbnLookupRules';

const ISBN13 = '9780306406157';
const ISBN10 = '0306406152';

describe('FR-01 S-21 ISBN 직접 입력 자동 조회', () => {
    it('FR-01 S-21 13자리를 다 입력하면 바로 조회해요', () => {
        expect(isbnToLookup(ISBN13, null, false)).toBe(normalizeIsbn(ISBN13));
        expect(isbnToLookup('978-0-306-40615-7', null, false)).toBe(normalizeIsbn(ISBN13));
    });

    it('FR-01 S-21 입력 중인 짧은 번호는 조회하지 않아요', () => {
        expect(isbnToLookup('978030640', null, false)).toBeNull();
        expect(isbnToLookup('', null, true)).toBeNull();
    });

    it('FR-01 S-21 10자리는 입력을 마쳤을 때만 조회해요', () => {
        expect(isbnToLookup(ISBN10, null, false)).toBeNull();
        expect(isbnToLookup(ISBN10, null, true)).toBe(normalizeIsbn(ISBN10));
    });

    it('FR-01 S-21 이미 조회한 ISBN은 다시 조회하지 않아요', () => {
        expect(isbnToLookup(ISBN13, normalizeIsbn(ISBN13), false)).toBeNull();
        expect(isbnToLookup(ISBN13, normalizeIsbn(ISBN13), true)).toBeNull();
    });
});
