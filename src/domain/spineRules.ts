/**
 * S-30: 책장 책등 배치 규칙.
 * 실제 책장처럼 책마다 높이·두께·간격을 조금씩 다르게 하고, 일부 책은 옆 책이나 왼쪽 벽에 기대게 한다.
 * 모든 값은 책 id로 정해서, 같은 책 목록이면 다시 그리거나 화면에 다시 들어와도 배치가 바뀌지 않는다.
 */
export const SPINE_HEIGHT_MIN_SCALE = 0.85;
export const SPINE_THICKNESS_MIN_SCALE = 0.8;
export const LEAN_MIN_DEGREES = 3;
export const LEAN_MAX_DEGREES = 7;
/** 똑바로 선 책 사이 간격(dp) 후보. 0이 많아서 대부분 붙어 있고, 가끔 조금 떨어진다. */
export const SPINE_GAPS = [0, 0, 0, 1, 2, 3] as const;
const STEPS = 1000;
/** 대략 몇 권 중 한 권에서 기대기를 시작할지 */
const LEAN_EVERY = 4;

/** 같은 문자열이면 언제나 같은 값이 나오는 해시 */
function hashOf(value: string) {
    let hash = 0;
    for (const char of value) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
    return Math.imul(hash ^ (hash >>> 16), 0x45d9f3b) >>> 0;
}

function unit(value: string) {
    return (hashOf(value) % STEPS) / (STEPS - 1);
}

/** 책 높이 비율(0.85~1) */
export function spineHeightScale(id: string): number {
    return SPINE_HEIGHT_MIN_SCALE + unit(id) * (1 - SPINE_HEIGHT_MIN_SCALE);
}

/** 책등 이미지가 없는 기본 책등의 두께 비율(0.8~1) */
export function spineThicknessScale(id: string): number {
    return SPINE_THICKNESS_MIN_SCALE + unit(`${id}:thickness`) * (1 - SPINE_THICKNESS_MIN_SCALE);
}

export type ShelfItem = { id: string; width: number; height: number };
/**
 * angle: 오른쪽으로 기울면 +, 왼쪽이면 - (도)
 * origin: 회전 축이 되는 아래 모서리. 오른쪽으로 기우는 책은 오른쪽 아래, 왼쪽으로 기우는 책은 왼쪽 아래 모서리가 바닥에 닿아 있다.
 * marginLeft: 바로 앞 책(첫 책은 왼쪽 벽)과의 간격(dp)
 */
export type ShelfPlacement = { id: string; angle: number; origin: 'left' | 'right'; marginLeft: number };

const radians = (degrees: number) => (degrees * Math.PI) / 180;
const round = (value: number) => Math.ceil(value * 2) / 2;

/** 기운 책(height, degrees)이 받침(supportHeight)에 닿으려면 바닥에서 떨어져 있어야 하는 거리. 받침이 벽이면 Infinity */
export function leanGap(height: number, degrees: number, supportHeight: number): number {
    const angle = radians(degrees);
    return round(Math.min(height * Math.sin(angle), supportHeight * Math.tan(angle)));
}

/** 같은 방향으로 나란히 기운 책 두 권이 맞닿으려면 필요한 추가 간격. 받침 쪽에 가까운 책의 두께로 정해진다. */
export function chainGap(nearWidth: number, degrees: number): number {
    return round(nearWidth * (1 / Math.cos(radians(degrees)) - 1));
}

/**
 * S-30: 책장 한 칸의 책 배치를 계산한다.
 * - 오른쪽으로 기우는 책(1~2권 연속)은 반드시 오른쪽에 똑바로 선 받침 책이 있어야 한다.
 * - 왼쪽으로 기우는 책(1~2권 연속)은 왼쪽에 똑바로 선 받침 책이나 왼쪽 벽이 있어야 한다.
 * - 받침이 없는 쪽(빈 공간)으로는 기울지 않는다.
 * - 특정 위치(예: 마지막 책)를 억지로 기울이지 않는다. 책이 적으면 모두 똑바로 서 있을 수도 있다.
 */
export function layoutShelfRow(items: readonly ShelfItem[]): ShelfPlacement[] {
    const n = items.length;
    const direction: (-1 | 0 | 1)[] = items.map(() => 0);
    const degrees: number[] = items.map(() => 0);
    const support: boolean[] = items.map(() => false);
    const angleOf = (id: string) => Math.round(LEAN_MIN_DEGREES + unit(`${id}:angle`) * (LEAN_MAX_DEGREES - LEAN_MIN_DEGREES));

    let i = 0;
    while (i < n) {
        const { id } = items[i];
        if (support[i] || hashOf(`${id}:lean`) % LEAN_EVERY !== 0) { i += 1; continue; }
        const wanted = hashOf(`${id}:chain`) % 3 === 0 ? 2 : 1;
        const angle = angleOf(id);
        const leftSupported = i === 0 || direction[i - 1] === 0;
        const preferRight = hashOf(`${id}:direction`) % 2 === 0;

        // 오른쪽: i..i+len-1이 기울고 i+len이 받침
        const rightLength = [wanted, 1].find(length => i + length < n) ?? 0;
        if ((preferRight || !leftSupported) && rightLength > 0) {
            for (let k = i; k < i + rightLength; k += 1) { direction[k] = 1; degrees[k] = angle; }
            support[i + rightLength] = true;
            i += rightLength + 1;
            continue;
        }
        // 왼쪽: i-1(또는 벽)이 받침이고 i..i+len-1이 기움
        if (leftSupported) {
            const leftLength = Math.min(wanted, n - i);
            for (let k = i; k < i + leftLength; k += 1) { direction[k] = -1; degrees[k] = angle; }
            if (i > 0) support[i - 1] = true;
            i += leftLength;
            continue;
        }
        i += 1;
    }

    return items.map((item, k) => {
        const previous = k > 0 ? items[k - 1] : null;
        let marginLeft: number;
        if (previous === null) {
            marginLeft = direction[k] === -1 ? leanGap(item.height, degrees[k], Infinity) : 0;
        } else if (direction[k - 1] === 1 && direction[k] === 1) {
            marginLeft = chainGap(item.width, degrees[k]);
        } else if (direction[k - 1] === 1 && direction[k] === 0) {
            marginLeft = leanGap(previous.height, degrees[k - 1], item.height);
        } else if (direction[k - 1] === 0 && direction[k] === -1) {
            marginLeft = leanGap(item.height, degrees[k], previous.height);
        } else if (direction[k - 1] === -1 && direction[k] === -1) {
            marginLeft = chainGap(previous.width, degrees[k]);
        } else {
            marginLeft = SPINE_GAPS[hashOf(`${item.id}:gap`) % SPINE_GAPS.length];
        }
        return {
            id: item.id,
            angle: direction[k] * degrees[k],
            origin: direction[k] === -1 ? 'left' : 'right',
            marginLeft,
        };
    });
}

/** 책등 사진으로 볼 수 있는 최대 가로/세로 비율. 실제 책등은 아주 두꺼운 책도 0.25 안팎이다. */
export const MAX_SPINE_IMAGE_RATIO = 0.35;

/** S-30: 이보다 넓은 사진은 YES24 '이미지 준비중' 같은 대체 그림으로 보고 기본 책등을 쓴다. */
export function isSpineImageRatio(ratio: number): boolean {
    return Number.isFinite(ratio) && ratio > 0 && ratio <= MAX_SPINE_IMAGE_RATIO;
}
