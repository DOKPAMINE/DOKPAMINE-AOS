import { ParticipationScreen } from '../../src/ranking/ParticipationScreen';

// S-75 · FR-15: 랭킹 참여 중단 확인
export default function Withdraw() {
    return <ParticipationScreen optIn={false} />;
}
