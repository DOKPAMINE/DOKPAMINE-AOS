import { useCallback, useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { Card, PrimaryButton, SecondaryButton } from '../components';
import { initializeDatabase } from '../db/client';
import type { RecordRepository } from '../db/repository';
import type { BookRecord } from '../db/schema';
import { mixedVisibilityBooks } from '../domain/reviewRules';
import type { ReviewVisibility } from '../my/preferences';
import { useReadingCheckDialog } from '../reading/readingCheckDialog';
import { getSyncState, subscribeSyncState } from '../sync';
import { colors, spacing, typography } from '../theme';
import { subscribeMixedVisibilityCheck } from './mixedVisibilityCheck';

/**
 * FR-08 / S-31: 감상(충돌·삭제 제외)의 공개 범위가 섞인 책이 있으면 어느 화면에서든 한 권씩 하나로 맞추게 한다.
 * 책 단위 공개 범위 이전의 예전 데이터, 서버 snapshot 복원, S-50 충돌 해결로 다시 섞인 경우 모두 같은 규칙으로 처리한다.
 * 앱 시작(로그인 후 마운트), 동기화가 끝났을 때, 충돌을 해결했을 때 확인한다.
 * 루트 레이아웃에서 로그인한 동안에만 마운트하고, S-46 90분 확인창이 떠 있으면 닫힌 뒤에 보여 준다.
 * 뒤로 가기·바깥 누르기로 닫히지 않으며 두 버튼 중 하나를 골라야 닫힌다.
 */
export function MixedVisibilityPrompt() {
    const [repository, setRepository] = useState<RecordRepository | null>(null);
    const [books, setBooks] = useState<BookRecord[]>([]);
    const [error, setError] = useState(false);
    const readingCheckOpen = useReadingCheckDialog(state => state.open);

    const check = useCallback((records: RecordRepository) => {
        try {
            const reviews = records.reviews.list().filter(review => !review.conflict);
            // 감상이 있는 책만 읽는다. 삭제한 책은 get이 null을 돌려줘 제외된다.
            const books = [...new Set(reviews.map(review => review.bookId))]
                .map(bookId => records.books.get(bookId)).filter((book): book is BookRecord => book !== null);
            setBooks(mixedVisibilityBooks(books, reviews));
        } catch { /* 다음 확인 시점에 다시 찾는다. */ }
    }, []);

    useEffect(() => {
        let active = true;
        const stops: (() => void)[] = [];
        void initializeDatabase().then(({ repository: records }) => {
            if (!active || !records) return;
            setRepository(records);
            check(records);
            let syncing = getSyncState().status === 'syncing';
            stops.push(subscribeSyncState(() => {
                const now = getSyncState().status === 'syncing';
                if (syncing && !now) check(records);
                syncing = now;
            }));
            stops.push(subscribeMixedVisibilityCheck(() => check(records)));
        }).catch(() => undefined);
        return () => { active = false; stops.forEach(stop => stop()); };
    }, [check]);

    const book = books[0];
    // 알림에서 고른 값 자체가 사용자의 확인이므로 [모두 공개]도 공개 확인창을 다시 띄우지 않는다.
    const choose = (visibility: ReviewVisibility) => {
        if (!repository || !book) return;
        try {
            repository.reviews.setBookVisibility(book.id, visibility);
            setError(false);
            check(repository);
        } catch { setError(true); }
    };

    return <Modal testID="mixed-visibility-prompt" visible={Boolean(repository && book) && !readingCheckOpen} transparent animationType="none"
        onRequestClose={() => { /* 뒤로 가기로 닫지 않는다. */ }}>
        <View style={local.container} accessibilityViewIsModal>
            <View style={local.scrim} accessible={false} />
            {book && <Card>
                <Text accessibilityRole="header" style={local.title}>감상 공개 범위</Text>
                <Text style={local.body}>『{book.title}』의 감상 중 일부만 공개돼 있어요. 이 책의 감상을 어떻게 할까요?</Text>
                <Text style={local.meta}>고른 값으로 이 책의 한줄평과 독후감 전체를 맞춰요. 공개하면 동기화 후 라운지에서 다른 독자가 볼 수 있어요.</Text>
                {error && <Text accessibilityRole="alert" style={local.error}>바꾸지 못했어요. 기기 저장 공간을 확인하고 다시 골라 주세요.</Text>}
                <SecondaryButton label="모두 비공개" onPress={() => choose('PRIVATE')} />
                <PrimaryButton label="모두 공개" onPress={() => choose('PUBLIC')} />
            </Card>}
        </View>
    </Modal>;
}

const local = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', padding: spacing.lg },
    scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.brand.espresso, opacity: 0.5 },
    title: { ...typography.title, color: colors.brand.espresso },
    body: { ...typography.body, color: colors.brand.espresso },
    meta: { ...typography.bodySmall, color: colors.text.muted },
    error: { ...typography.bodySmall, color: colors.state.error },
});
