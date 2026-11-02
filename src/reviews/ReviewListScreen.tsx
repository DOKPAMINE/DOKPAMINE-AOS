import { router, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { Card, PrimaryButton, Screen, SecondaryButton, StateView } from '../components';
import { useReviewRecords } from './useReviewRecords';
import { reviewStyles as styles } from './styles';

export function ReviewListScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { records, retry } = useReviewRecords(id);
    return <Screen title="감상과 문장">
        {records.kind !== 'ready' ? <StateView kind={records.kind} onRetry={records.kind === 'error' ? retry : undefined} /> : !records.book ? (
            <StateView kind="empty" message="책을 찾을 수 없어요. 삭제된 책인지 확인해 주세요." />
        ) : <>
            <Text style={styles.heading}>{records.book.title}</Text>
            <PrimaryButton label="감상 쓰기" onPress={() => router.push({ pathname: '/book/[id]/review/write', params: { id } })} />
            <View style={styles.section}>
                <Text accessibilityRole="header" style={styles.heading}>한줄평과 독후감</Text>
                {records.reviews.length === 0 ? <StateView kind="empty" message="아직 감상이 없어요. 책을 읽고 느낀 점을 남겨 주세요." /> : records.reviews.map(review => <Card key={review.id}>
                    <Text style={styles.meta}>{review.visibility === 'PUBLIC' ? '공개' : '비공개 · 나만 보기'}</Text>
                    {review.oneLine ? <Text style={styles.heading}>{review.oneLine}</Text> : null}
                    {review.body ? <Text style={styles.body}>{review.body}</Text> : null}
                    {review.syncPending && <Text style={styles.meta}>기기에 저장됨 · 동기화 대기</Text>}
                </Card>)}
            </View>
            <View style={styles.section}>
                <Text accessibilityRole="header" style={styles.heading}>좋아하는 문장</Text>
                <SecondaryButton label="문장 추가" onPress={() => router.push({ pathname: '/book/[id]/review/quote', params: { id } })} />
                {records.quotes.length === 0 ? <StateView kind="empty" message="아직 남긴 문장이 없어요. 간직하고 싶은 문장을 적어 주세요." /> : records.quotes.map(quote => <Card key={quote.id}>
                    <Text style={styles.body}>{quote.text}</Text>
                    {quote.page !== null && <Text style={styles.meta}>{quote.page}쪽</Text>}
                    {quote.memo ? <Text style={styles.body}>{quote.memo}</Text> : null}
                    {quote.syncPending && <Text style={styles.meta}>기기에 저장됨 · 동기화 대기</Text>}
                </Card>)}
            </View>
        </>}
        <SecondaryButton label="책 상세로" onPress={() => router.dismissTo({ pathname: '/book/[id]', params: { id } })} />
    </Screen>;
}
