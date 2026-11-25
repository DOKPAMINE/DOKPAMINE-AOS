import { useEffect, useState } from 'react';

/** #124: value가 delayMs 동안 바뀌지 않으면 그 값을 돌려준다. 그 전에 바뀌면 기다림을 처음부터 다시 센다. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
    const [settled, setSettled] = useState(value);
    useEffect(() => {
        const timer = setTimeout(() => setSettled(value), delayMs);
        return () => clearTimeout(timer);
    }, [value, delayMs]);
    return settled;
}
