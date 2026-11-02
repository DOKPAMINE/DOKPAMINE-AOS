import { Card, Screen, StateView } from '../../src/components';

// S-60 독서 캘린더 · FR-05
export default function CalendarScreen() {
    return <Screen title="캘린더"><Card><StateView kind="empty" message="독서한 날을 돌아볼 캘린더를 준비하고 있어요." /></Card></Screen>;
}
