import { Card, Screen, StateView } from '../../src/components';

// S-30 책장 · FR-04
export default function ShelfScreen() {
    return <Screen title="책장"><Card><StateView kind="empty" message="읽은 책을 모아 볼 책장을 준비하고 있어요." /></Card></Screen>;
}
