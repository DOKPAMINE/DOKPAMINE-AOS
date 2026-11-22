import { useEffect } from 'react';
import { create } from 'zustand';

/** S-46: 90분 확인창이 떠 있는지 앱 전체에 알린다. 다른 전역 알림은 이 창이 닫힌 뒤에 띄운다. */
export const useReadingCheckDialog = create<{ open: boolean }>(() => ({ open: false }));

/** S-46 확인창과 같은 값으로 렌더링해 열림 상태를 알린다. 화면을 떠나면 닫힌 것으로 되돌린다. */
export function ReadingCheckSignal({ open }: { open: boolean }) {
    useEffect(() => {
        useReadingCheckDialog.setState({ open });
        return () => useReadingCheckDialog.setState({ open: false });
    }, [open]);
    return null;
}
