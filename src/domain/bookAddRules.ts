import { GENRES, parseInteger, type Genre } from './pageRules';

/** FR-01 / S-20·S-25: ISBN-10도 ISBN-13으로 통일하여 같은 책을 판별한다. */
export function normalizeIsbn(input: string): string | null {
    const value = input.replace(/[\s-]/g, '').toUpperCase();
    if (/^\d{9}[\dX]$/.test(value)) {
        const sum = [...value].reduce((total, digit, index) => total + (digit === 'X' ? 10 : Number(digit)) * (10 - index), 0);
        if (sum % 11 !== 0) return null;
        const prefix = `978${value.slice(0, 9)}`;
        const check = (10 - [...prefix].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0) % 10) % 10;
        return `${prefix}${check}`;
    }
    if (!/^97[89]\d{10}$/.test(value)) return null;
    return [...value].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0) % 10 === 0 ? value : null;
}

/** FR-01 / S-23: 자유 입력 대신 PRD 장르 목록만 허용한다. */
export function isBookGenre(value: string): value is Genre {
    return GENRES.some(genre => genre === value);
}

/** FR-01 / S-23: 서버의 Int 범위 안에서 1쪽 이상을 입력한다. */
export function parseTotalPages(value: string): number | null {
    const pages = parseInteger(value);
    return pages !== null && pages >= 1 ? pages : null;
}
