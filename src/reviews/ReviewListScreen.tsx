import { uuid } from 'expo';
import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { Card, Screen, SecondaryButton, StateView } from '../components';
import type { RecordRepository } from '../db/repository';
import type { QuoteRecord, ReviewRecord } from '../db/schema';
import { requestMixedVisibilityCheck } from './mixedVisibilityCheck';
import { useReviewRecords } from './useReviewRecords';
import { reviewStyles as styles } from './styles';
import { bookOneLine, bookReports, conflictLockMessage, hasOneLineConflict } from '../domain/reviewRules';
import { CardActions, confirmDelete } from './CardActions';

const preview = (text: string) => text.length > 20 ? `${text.slice(0, 20)}…` : text;

export function ReviewListScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { records, retry } = useReviewRecords(id);
    const [deleteError, setDeleteError] = useState(false);
    // #91: 삭제는 저장소의 tombstone(softDelete)으로 남겨 동기화한다. 실패하면 목록을 그대로 두고 알린다.
    const remove = (work: () => void) => confirmDelete(() => {
        try { work(); setDeleteError(false); } catch { setDeleteError(true); }
    });
    return <Screen title="감상과 문장">
        {records.kind !== 'ready' ? <StateView kind={records.kind} onRetry={records.kind === 'error' ? retry : undefined} /> : !records.book && records.conflicts.length === 0 ? (
            <StateView kind="empty" message="책을 찾을 수 없어요. 삭제된 책인지 확인해 주세요." />
        ) : <>
            <Text style={styles.heading}>{records.book?.title ?? '삭제된 책'}</Text>
            {deleteError && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>
                삭제하지 못했어요. 동기화 충돌이 있는지 확인하고 다시 시도해 주세요.
            </Text>}
            {records.conflicts.length > 0 && <View style={styles.section}>
                {records.conflicts.map(review => <ReviewConflictCard key={review.id} review={review} repository={records.repository} />)}
            </View>}
            <ReviewSections bookId={id} canWrite={Boolean(records.book)} reviews={records.reviews.filter(review => !review.conflict)}
                oneLineLocked={hasOneLineConflict(records.conflicts)} repository={records.repository} remove={remove} />
            {records.book && <View style={styles.section}>
                <Text accessibilityRole="header" style={styles.heading}>좋아하는 문장</Text>
                <SecondaryButton label="문장 추가" onPress={() => router.push({ pathname: '/book/[id]/review/quote', params: { id } })} />
                {records.quotes.length === 0 ? <StateView kind="empty" message="아직 남긴 문장이 없어요. 간직하고 싶은 문장을 적어 주세요." /> : records.quotes.map(quote =>
                    <QuoteCard key={quote.id} bookId={id} quote={quote} onDelete={() => remove(() => records.repository.quotes.softDelete(quote.id))} />)}
            </View>}
        </>}
        {records.kind === 'ready' && !records.book
            ? <SecondaryButton label="마이로" onPress={() => router.dismissTo('/(tabs)/my')} />
            : <SecondaryButton label="책 상세로" onPress={() => router.dismissTo({ pathname: '/book/[id]', params: { id } })} />}
    </Screen>;
}

/** S-50: 맨 위에 책의 한줄평 하나, 그 아래에 독서마다 쌓인 독후감을 보여 주고 각각 쓰기 화면으로 보낸다. */
function ReviewSections({ bookId, canWrite, reviews, oneLineLocked, repository, remove }: {
    bookId: string; canWrite: boolean; reviews: ReviewRecord[]; oneLineLocked: boolean; repository: RecordRepository; remove: (work: () => void) => void;
}) {
    const oneLine = bookOneLine(reviews);
    const reports = bookReports(reviews);
    const editOneLine = () => router.push({ pathname: '/book/[id]/review/one-line', params: { id: bookId } });
    return <>
        <View style={styles.section}>
            <Text accessibilityRole="header" style={styles.heading}>한줄평</Text>
            {canWrite && !oneLine && <SecondaryButton label="한줄평 쓰기" disabled={oneLineLocked} onPress={editOneLine} />}
            {canWrite && !oneLine && oneLineLocked && <Text style={styles.meta}>동기화 충돌을 먼저 해결하면 한줄평을 쓸 수 있어요.</Text>}
            {oneLine ? <Card>
                <Text style={styles.meta}>{visibilityText(oneLine.visibility)}</Text>
                <Text style={styles.heading}>{oneLine.oneLine}</Text>
                {oneLine.syncPending && <Text style={styles.meta}>기기에 저장됨 · 동기화 대기</Text>}
                {canWrite && <CardActions subject="한줄평" lockedReason={oneLineLocked ? conflictLockMessage : undefined}
                    onEdit={editOneLine} onDelete={() => remove(() => repository.reviews.deleteOneLine(bookId))} />}
            </Card> : <StateView kind="empty" message="아직 한줄평이 없어요. 이 책을 한마디로 남겨 주세요." />}
        </View>
        <View style={styles.section}>
            <Text accessibilityRole="header" style={styles.heading}>독후감</Text>
            {canWrite && <SecondaryButton label="독후감 쓰기" onPress={() => router.push({ pathname: '/book/[id]/review/report', params: { id: bookId } })} />}
            {reports.length === 0 ? <StateView kind="empty" message="아직 독후감이 없어요. 책을 읽고 느낀 점을 남겨 주세요." /> : reports.map(report => <Card key={report.id}>
                <Text style={styles.meta}>{visibilityText(report.visibility)}</Text>
                <Text style={styles.body}>{report.body}</Text>
                {report.syncPending && <Text style={styles.meta}>기기에 저장됨 · 동기화 대기</Text>}
                {canWrite && <CardActions subject={`독후감 ${preview(report.body ?? '')}`}
                    lockedReason={report.conflict ? conflictLockMessage : undefined}
                    onEdit={() => router.push({ pathname: '/book/[id]/review/report', params: { id: bookId, reviewId: report.id } })}
                    onDelete={() => remove(() => repository.reviews.deleteReport(report.id))} />}
            </Card>)}
        </View>
    </>;
}

/** #91 S-50·S-52: 문장 카드. 문장은 서버가 버전을 비교하지 않아 충돌 상태가 없으므로 늘 고치고 지울 수 있다. */
function QuoteCard({ bookId, quote, onDelete }: { bookId: string; quote: QuoteRecord; onDelete: () => void }) {
    return <Card>
        <Text style={styles.body}>{quote.text}</Text>
        {quote.page !== null && <Text style={styles.meta}>{quote.page}쪽</Text>}
        {quote.syncPending && <Text style={styles.meta}>기기에 저장됨 · 동기화 대기</Text>}
        <CardActions subject={`문장 ${preview(quote.text)}`} onDelete={onDelete}
            onEdit={() => router.push({ pathname: '/book/[id]/review/quote', params: { id: bookId, quoteId: quote.id } })} />
    </Card>;
}

const visibilityText = (visibility: ReviewRecord['visibility']) => visibility === 'PUBLIC' ? '공개' : '비공개 · 나만 보기';

function ReviewConflictCard({ review, repository }: { review: ReviewRecord; repository: RecordRepository }) {
    const [error, setError] = useState(false);
    const latest = review.conflict?.latest;
    const visibilityLabel = (visibility: ReviewRecord['visibility']) => visibility === 'PUBLIC' ? '공개' : '비공개';
    const resolve = (visibility: ReviewRecord['visibility']) => {
        try { repository.reviews.resolveConflict(review.id, latest?.version ?? null, visibility, uuid.v4()); }
        catch { setError(true); return; }
        // 감상마다 공개 범위를 고르므로 책의 다른 감상과 섞였을 수 있다. 섞였으면 앱 전체 알림이 하나로 맞추게 한다.
        requestMixedVisibilityCheck();
    };
    return <Card>
        <Text accessibilityRole="header" style={styles.heading}>감상 동기화 충돌</Text>
        <Text style={styles.meta}>{review.deleted ? '기기에 저장된 삭제 요청' : `기기에 보관한 초안 · ${visibilityLabel(review.visibility)}`}</Text>
        {review.oneLine ? <Text style={styles.body}>{review.oneLine}</Text> : null}
        {review.body ? <Text style={styles.body}>{review.body}</Text> : null}
        <Text accessibilityLiveRegion="polite" style={latest ? styles.label : styles.meta}>
            {latest === undefined ? '인터넷에 연결되면 최신 감상을 확인해요.'
                : latest === null ? '서버에서 삭제된 감상이에요.'
                    : `서버의 최신 감상 · ${visibilityLabel(latest.visibility)}`}
        </Text>
        {latest !== undefined && <>
            {latest?.oneLine ? <Text style={styles.body}>{latest.oneLine}</Text> : null}
            {latest?.body ? <Text style={styles.body}>{latest.body}</Text> : null}
            {review.deleted
                ? <SecondaryButton label={latest === null ? '삭제 확인' : '최신 감상 삭제'} onPress={() => resolve(review.visibility)} />
                : <>
                    <SecondaryButton label="초안을 비공개로 저장" onPress={() => resolve('PRIVATE')} />
                    <SecondaryButton label="초안을 공개로 저장" onPress={() => resolve('PUBLIC')} />
                </>}
        </>}
        <Text style={styles.meta}>충돌을 해결하면 이 감상을 수정·삭제할 수 있어요.</Text>
        {error && <Text accessibilityRole="alert" style={styles.error}>저장하지 못했어요. 최신 감상을 확인하고 다시 시도해 주세요.</Text>}
    </Card>;
}
