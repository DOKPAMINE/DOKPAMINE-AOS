import { normalizeIsbn } from './bookAddRules';

/**
 * FR-01 / S-21: 직접 입력 중 ISBN 자동 조회 여부를 정한다.
 * - 13자리를 다 입력하면 바로 조회한다.
 * - 10자리 ISBN은 13자리를 입력하는 도중일 수도 있으므로, 입력을 마쳤을 때(칸을 벗어날 때)만 조회한다.
 * - 이미 조회한 ISBN(last)은 다시 조회하지 않는다.
 * 조회할 ISBN(정규화 값)을 돌려주고, 조회하지 않으면 null을 돌려준다.
 */
export function isbnToLookup(text: string, last: string | null, finished: boolean): string | null {
    const normalized = normalizeIsbn(text);
    if (normalized === null || normalized === last) return null;
    const digits = text.replace(/[^0-9Xx]/g, '');
    return digits.length === 13 || finished ? normalized : null;
}
