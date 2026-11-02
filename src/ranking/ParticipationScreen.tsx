import { router } from 'expo-router';
import { Text } from 'react-native';
import { PrimaryButton, Screen, SecondaryButton } from '../components';
import { useParticipation } from './queries';
import { RankingError } from './RankingError';
import { styles } from './styles';

export function ParticipationScreen({ optIn }: { optIn: boolean }) {
    const mutation = useParticipation(() => router.dismissTo('/ranking'));
    const confirmLabel = optIn ? '동의하고 참여하기' : '참여 중단하기';
    return <Screen title={optIn ? '랭킹 참여 동의' : '랭킹 참여를 중단할까요?'}>
        <Text style={styles.body}>{optIn
            ? '참여하시면 닉네임·순위·독서 시간이 다른 사용자에게 공개돼요. 동의하실 때만 참여하며, 언제든 참여를 중단할 수 있어요.'
            : '참여를 중단하면 순위에서 즉시 빠지고 독서 시간이 랭킹에 공개되지 않아요. 저장한 개인 독서 기록은 유지돼요.'}</Text>
        {mutation.isError && <RankingError error={mutation.error} />}
        <PrimaryButton label={mutation.pending ? '반영 중이에요' : confirmLabel} disabled={mutation.pending} onPress={() => mutation.submit(optIn)} />
        <SecondaryButton label="랭킹으로 돌아가기" disabled={mutation.pending} onPress={() => router.dismissTo('/ranking')} />
    </Screen>;
}
