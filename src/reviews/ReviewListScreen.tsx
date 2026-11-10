import { uuid } from 'expo';
import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { Card, PrimaryButton, Screen, SecondaryButton, StateView } from '../components';
import type { RecordRepository } from '../db/repository';
import type { ReviewRecord } from '../db/schema';
import { useReviewRecords } from './useReviewRecords';
import { reviewStyles as styles } from './styles';

export function ReviewListScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { records, retry } = useReviewRecords(id);
    return <Screen title="감상과 문장">
        {records.kind !== 'ready' ? <StateView kind={records.kind} onRetry={records.kind === 'error' ? retry : undefined} /> : !records.book && records.conflicts.length === 0 ? (
            <StateView kind="empty" message="책을 찾을 수 없어요. 삭제된 책인지 확인해 주세요." />
        ) : <>
            <Text style={styles.heading}>{records.book?.title ?? '삭제된 책'}</Text>
            {records.book && <PrimaryButton label="감상 쓰기" onPress={() => router.push({ pathname: '/book/[id]/review/write', params: { id } })} />}
            <View style={styles.section}>
                <Text accessibilityRole="header" style={styles.heading}>한줄평과 독후감</Text>
                {records.conflicts.map(review => <ReviewConflictCard key={review.id} review={review} repository={records.repository} />)}
                {records.reviews.length === 0 && records.conflicts.length === 0 ? <StateView kind="empty" message="아직 감상이 없어요. 책을 읽고 느낀 점을 남겨 주세요." /> : records.reviews.filter(review => !review.conflict).map(review => <Card key={review.id}>
                    <Text style={styles.meta}>{review.visibility === 'PUBLIC' ? '공개' : '비공개 · 나만 보기'}</Text>
                    {review.oneLine ? <Text style={styles.heading}>{review.oneLine}</Text> : null}
                    {review.body ? <Text style={styles.body}>{review.body}</Text> : null}
                    {review.syncPending && <Text style={styles.meta}>기기에 저장됨 · 동기화 대기</Text>}
                </Card>)}
            </View>
            {records.book && <View style={styles.section}>
                <Text accessibilityRole="header" style={styles.heading}>좋아하는 문장</Text>
                <SecondaryButton label="문장 추가" onPress={() => router.push({ pathname: '/book/[id]/review/quote', params: { id } })} />
                {records.quotes.length === 0 ? <StateView kind="empty" message="아직 남긴 문장이 없어요. 간직하고 싶은 문장을 적어 주세요." /> : records.quotes.map(quote => <Card key={quote.id}>
                    <Text style={styles.body}>{quote.text}</Text>
                    {quote.page !== null && <Text style={styles.meta}>{quote.page}쪽</Text>}
                    {quote.memo ? <Text style={styles.body}>{quote.memo}</Text> : null}
                    {quote.syncPending && <Text style={styles.meta}>기기에 저장됨 · 동기화 대기</Text>}
                </Card>)}
            </View>}
        </>}
        {records.kind === 'ready' && !records.book
            ? <SecondaryButton label="마이로" onPress={() => router.dismissTo('/(tabs)/my')} />
            : <SecondaryButton label="책 상세로" onPress={() => router.dismissTo({ pathname: '/book/[id]', params: { id } })} />}
    </Screen>;
}

function ReviewConflictCard({ review, repository }: { review: ReviewRecord; repository: RecordRepository }) {
    const [error, setError] = useState(false);
    const latest = review.conflict?.latest;
    const visibilityLabel = (visibility: ReviewRecord['visibility']) => visibility === 'PUBLIC' ? '공개' : '비공개';
    const resolve = (visibility: ReviewRecord['visibility']) => {
        try { repository.reviews.resolveConflict(review.id, latest?.version ?? null, visibility, uuid.v4()); }
        catch { setError(true); }
    };
    return <Card>
        <Text accessibilityRole="header" style={styles.heading}>감상 동기화 충돌</Text>
        <Text style={styles.meta}>{review.deleted ? '기기에 저장된 삭제 요청' : `기기에 보관한 초안 · ${visibilityLabel(review.visibility)}`}</Text>
        {review.oneLine ? <Text style={styles.body}>{review.oneLine}</Text> : null}
        {review.body ? <Text style={styles.body}>{review.body}</Text> : null}
        {latest === undefined ? <Text style={styles.meta}>인터넷에 연결되면 최신 감상을 확인해요.</Text> : <>
            {latest === null ? <Text style={styles.meta}>서버에서 삭제된 감상이에요.</Text> : <>
                <Text style={styles.label}>서버의 최신 감상 · {visibilityLabel(latest.visibility)}</Text>
                {latest.oneLine ? <Text style={styles.body}>{latest.oneLine}</Text> : null}
                {latest.body ? <Text style={styles.body}>{latest.body}</Text> : null}
            </>}
            {review.deleted
                ? <SecondaryButton label={latest === null ? '삭제 확인' : '최신 감상 삭제'} onPress={() => resolve(review.visibility)} />
                : <>
                    <SecondaryButton label="초안을 비공개로 저장" onPress={() => resolve('PRIVATE')} />
                    <SecondaryButton label="초안을 공개로 저장" onPress={() => resolve('PUBLIC')} />
                </>}
        </>}
        {error && <Text accessibilityRole="alert" style={styles.error}>저장하지 못했어요. 최신 감상을 확인하고 다시 시도해 주세요.</Text>}
    </Card>;
}
