import { useState } from 'react';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { Alert, Image, Text, View } from 'react-native';
import { Card, PrimaryButton, ProgressBar, Screen, SecondaryButton, StateView } from '../components';
import { beginReading, completeReading, readingTimeLabel } from '../domain/shelfRules';
import type { BookRecord } from '../db/schema';
import type { RecordRepository } from '../db/repository';
import { BookStatus } from './BookStatus';
import { useShelfRepository } from './useShelfRepository';
import { shelfStyles as styles } from './styles';
import { sizes } from '../theme';

export function BookDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { repository, error, retry } = useShelfRepository();
    if (error || !repository) return <Screen title="책 상세"><StateView kind={error ? 'error' : 'loading'} onRetry={error ? retry : undefined} /></Screen>;
    const book = repository.books.get(id);
    if (!book) return <Screen title="책 상세"><StateView kind="empty" message="책을 찾을 수 없어요. 삭제된 책인지 확인해 주세요." /><SecondaryButton label="책장으로" onPress={() => router.replace('/shelf')} /></Screen>;
    return <BookDetail book={book} repository={repository} />;
}

function BookDetail({ book, repository }: { book: BookRecord; repository: RecordRepository }) {
    const [notice, setNotice] = useState<string | null>(null);
    const [coverFailed, setCoverFailed] = useState(false);
    const sessions = repository.sessions.list({ bookId: book.id });
    const review = repository.reviews.list({ bookId: book.id }).filter(row => row.oneLine?.trim())
        .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    // 타이머 화면은 후속 단계 소유이며 bookId 계약만 연결한다.
    const read = () => router.push({ pathname: '/reading-start', params: { bookId: book.id } } as Href);
    const changeStatus = (complete: boolean) => {
        try {
            const latest = repository.books.get(book.id);
            if (!latest) throw new Error('책을 찾을 수 없어요.');
            repository.books.save(complete ? completeReading(latest, Date.now()) : beginReading(latest));
            setNotice(null);
            if (!complete) read();
        } catch {
            setNotice('변경하지 못했어요. 기기 저장 공간을 확인하고 다시 시도해 주세요.');
        }
    };
    const confirmDelete = () => Alert.alert('책을 삭제할까요?', `「${book.title}」과 이 책의 독서 기록·감상·문장이 함께 삭제돼요.`, [
        { text: '취소', style: 'cancel' },
        { text: '삭제', style: 'destructive', onPress: () => {
            try {
                repository.books.softDelete(book.id);
                router.replace('/shelf');
            } catch { setNotice('삭제하지 못했어요. 기기 저장 공간을 확인하고 다시 시도해 주세요.'); }
        } },
    ]);
    return <Screen title={book.title}>
        <SecondaryButton label="책장으로" onPress={() => router.replace('/shelf')} />
        <Card>
            <BookStatus status={book.status} />
            {book.coverUrl && !coverFailed ? <Image source={{ uri: book.coverUrl }} accessibilityLabel={`${book.title} 표지`} accessible
                onError={() => setCoverFailed(true)} style={{ width: sizes.minTouch * 2, height: sizes.minTouch * 3 }} resizeMode="contain" /> :
                <Text style={styles.muted}>기본 표지 · {book.genre}</Text>}
            <Text style={styles.body}>{book.author}</Text>
            <Text style={styles.muted}>{book.publisher ?? '출판사 정보가 없어요'} · {book.genre} · {book.totalPages}쪽</Text>
        </Card>
        {book.status !== 'WANT' && <Card>
            <Text accessibilityRole="header" style={styles.title}>독서 현황</Text>
            <ProgressBar currentPage={book.currentPage} totalPages={book.totalPages} />
            <Text style={styles.body}>누적 독서 시간 · {readingTimeLabel(sessions)}</Text>
            <Text accessibilityRole="header" style={styles.title}>한줄평</Text>
            <Text style={styles.body}>{review?.oneLine ?? '아직 남긴 한줄평이 없어요.'}</Text>
        </Card>}
        {notice && <Text accessibilityRole="alert" style={styles.error}>{notice}</Text>}
        {book.status === 'WANT' && <PrimaryButton label="읽기 시작" onPress={() => changeStatus(false)} />}
        {book.status === 'DONE' && <PrimaryButton label="다시 읽기" onPress={() => changeStatus(false)} />}
        {book.status === 'READING' && <>
            <PrimaryButton label="이어서 읽기" onPress={read} />
            <SecondaryButton label="완독 표시" onPress={() => changeStatus(true)} />
        </>}
        <View style={styles.section}>
            <SecondaryButton label="정보 편집" onPress={() => router.push({ pathname: '/book/[id]/edit', params: { id: book.id } })} />
            <SecondaryButton label="책 삭제" accessibilityLabel={`${book.title} 책 삭제`} onPress={confirmDelete} />
        </View>
    </Screen>;
}
