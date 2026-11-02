import { Card, Screen, StateView } from '../../src/components';

// S-10 홈 · FR-04, FR-02
export default function HomeScreen() {
    return <Screen title="홈"><Card><StateView kind="empty" message="독파민에 오신 것을 환영해요. 독서의 일상을 함께 준비하고 있어요." /></Card></Screen>;
}
