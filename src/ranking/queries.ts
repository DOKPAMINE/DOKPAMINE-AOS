import { useRef } from 'react';
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isOnline } from '../api/connectivity';
import { patchMe, weeklyRanking } from '../api/endpoints';
import { ApiError, offlineError } from '../api/errors';

export const rankingKeys = { all: ['ranking'] as const, weekly: ['ranking', 'weekly'] as const };
const mutationKey = ['ranking', 'participation'];

async function connected<T>(request: () => Promise<T>): Promise<T> {
    if (!await isOnline()) throw offlineError();
    return request();
}

export function useWeeklyRanking() {
    return useQuery({ queryKey: rankingKeys.weekly, networkMode: 'always', retry: false, staleTime: 0,
        queryFn: ({ signal }) => connected(() => weeklyRanking(undefined, signal)) });
}

export function useParticipation(onSuccess: () => void) {
    const client = useQueryClient();
    const lock = useRef(false);
    const pending = useIsMutating({ mutationKey }) > 0;
    const mutation = useMutation({
        mutationKey, networkMode: 'always', retry: false,
        mutationFn: ({ optIn, isCurrent }: { optIn: boolean; isCurrent: () => boolean }) => connected(() => {
            if (!isCurrent()) throw new ApiError('cancelled', 'CANCELLED', '요청을 취소했어요.');
            return patchMe({ rankingOptIn: optIn });
        }),
        onSuccess: async (_user, { isCurrent }) => {
            if (!isCurrent()) return;
            // 서버에서 순위를 다시 계산한다. 중단 사용자를 제외한 순위를 클라이언트에서 추측하지 않는다.
            await client.resetQueries({ queryKey: rankingKeys.all });
            if (isCurrent()) onSuccess();
        },
        onSettled: () => { lock.current = false; },
    });
    return { ...mutation, pending: pending || mutation.isPending,
        submit: (optIn: boolean) => {
            if (lock.current || client.isMutating({ mutationKey }) > 0) return;
            lock.current = true;
            // 직접 진입해도 쿼리의 정체성을 확보한다. 로그아웃으로 캐시가 비워지면 늦은 결과를 무시한다.
            client.getQueryCache().build(client, { queryKey: rankingKeys.weekly });
            const entry = client.getQueryCache().find({ queryKey: rankingKeys.weekly, exact: true });
            mutation.mutate({ optIn, isCurrent: () => client.getQueryCache().find({ queryKey: rankingKeys.weekly, exact: true }) === entry });
        },
    };
}
