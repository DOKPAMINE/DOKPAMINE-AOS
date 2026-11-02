import { Card, Screen, StateView } from '../../src/components';

// S-80 마이 · FR-10
export default function MyScreen() {
    return <Screen title="마이"><Card><StateView kind="empty" message="나의 독서 생활을 돌아볼 공간을 준비하고 있어요." /></Card></Screen>;
}
