import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import type { BookReviewGroup } from '../api/types';
import { Screen, SecondaryButton, StateView } from '../components';
import { groupCover, groupReviewBoxes, sortReviewBoxes, type ReviewBoxOrder } from '../domain/loungeRules';
import { BookCover } from '../shelf/BookCover';
import { sizes } from '../theme';
import { BookSearchField } from './BookSearchField';
import { LoungeBox } from './LoungeBox';
import { useBookReviews } from './queries';
import { QueryError } from './QueryState';
import { ReviewRow } from './ReviewRow';
import { styles } from './styles';

const orders: { value: ReviewBoxOrder; label: string }[] = [
    { value: 'latest', label: '최신순' },
    { value: 'likes', label: '좋아요 많은 순' },
];

/**
 * S-71 · FR-16 책별 감상: 서버의 책 묶음(제목·저자·ISBN)과 묶음 순서는 그대로 두고, #113 묶음 안 감상을
 * 사람의 책 박스로 묶는다. 묶음마다 위에 책 정보(왼쪽 표지: coverUrl이 있는 첫 감상의 표지, 없으면 책장의 기본 표지 /
 * 오른쪽 제목·저자·ISBN)를 두고, 구분선 아래에 "N명의 감상"(N은 박스 수)과 그 옆 정렬 버튼(좁으면 아래 줄), 그 아래 카드 모양의 박스를 둔다.
 * 박스에는 표지와 책 제목 없이 닉네임, 대표 감상 앞부분, 날짜만 둔다. 박스는 S-76, userBookId가 없는 예전 응답의 감상은 S-72로 간다.
 * [최신순]·[좋아요 많은 순]은 묶음마다 보이지만 정렬은 하나를 공유한다. 어느 묶음에서 바꿔도 모든 묶음의 정렬과 선택 표시가 같이 바뀐다. 묶음 순서는 바꾸지 않고
 * 각 묶음 안 박스 순서에만 적용한다. 기본은 최신순이고, 검색어가 바뀌면 최신순으로 되돌린다.
 * 맨 위에 라운지와 같은 검색창을 두고, 들어올 때 검색한 단어를 채워 보여 준다. 고쳐서 검색하면 새 화면을 쌓지 않고
 * 이 화면의 검색어(query 파라미터)만 바꿔 결과를 다시 받는다. 그래서 뒤로 가기는 언제나 라운지로 간다.
 * 같은 검색어로 다시 검색하면 파라미터가 그대로이므로 결과를 직접 다시 받는다(refetch).
 */
export function BookReviewsScreen({ query }: { query: string }) {
    const result = useBookReviews(query);
    // 정렬은 그 검색어에 묶어 둔다. 검색어가 바뀌면 저장된 정렬이 다른 검색어의 것이므로 최신순으로 본다.
    const [sort, setSort] = useState<{ query: string; order: ReviewBoxOrder }>({ query, order: 'latest' });
    const order = sort.query === query ? sort.order : 'latest';
    const setOrder = (next: ReviewBoxOrder) => setSort({ query, order: next });
    const search = (next: string) => {
        if (next === query) void result.refetch();
        else router.setParams({ query: next });
    };
    return (
        <Screen title="책별 감상">
            <View style={styles.section}>
                {/* 검색어 파라미터가 바뀌면(이 화면에서 다시 검색) key로 검색창을 새로 만들어 그 단어로 채운다. */}
                <SearchAgain key={query} query={query} onSearch={search} />
            </View>
            <SecondaryButton label="라운지로 돌아가기" onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/lounge')} />
            <Text style={styles.body}>{query.trim() ? `“${query}” 검색 결과` : '책 이름을 입력해 주세요.'}</Text>
            {!query.trim() ? null : result.isError ? <QueryError error={result.error} retry={() => { void result.refetch(); }} />
                : result.isPending ? <StateView kind="loading" />
                    : result.data.length === 0 ? <StateView kind="empty" message="아직 공개된 감상이 없어요" />
                        // 책 묶음이 여러 개면 묶음 사이를 넓게 띄운다.
                        : <View style={styles.groups}>
                            {result.data.map(group => <BookGroup key={group.bookKey} group={group} order={order} onOrderChange={setOrder} />)}
                        </View>}
        </Screen>
    );
}

function BookGroup({ group, order, onOrderChange }: {
    group: BookReviewGroup; order: ReviewBoxOrder; onOrderChange: (order: ReviewBoxOrder) => void;
}) {
    const cover = groupCover(group.reviews);
    // 사람의 책 하나가 박스 하나이므로 박스 수가 감상을 남긴 사람 수다.
    const boxes = sortReviewBoxes(groupReviewBoxes(group.reviews), order);
    return (
        <View testID="book-group" style={styles.section}>
            <View testID="book-group-header" style={styles.row}>
                <BookCover key={cover.uri ?? 'none'} uri={cover.uri} genre={cover.genre} width={sizes.minTouch * 1.5} />
                <View testID="book-group-header-text" style={styles.rowText}>
                    {/* 책 제목은 1줄까지 보이고 넘치면 …으로 줄인다. 스크린리더는 전체 제목을 읽는다. */}
                    <Text accessibilityRole="header" accessibilityLabel={group.bookTitle} numberOfLines={1} ellipsizeMode="tail" style={styles.heading}>{group.bookTitle}</Text>
                    <Text style={styles.muted}>{group.bookAuthor}{group.isbn ? ` · ISBN ${group.isbn}` : ''}</Text>
                </View>
            </View>
            <View testID="book-group-divider" accessible={false} importantForAccessibility="no" style={styles.divider} />
            <View testID="book-group-count-row" style={styles.countRow}>
                <Text accessibilityRole="header" style={styles.titleSmall}>{boxes.length}명의 감상</Text>
                {/* 정렬은 화면 전체가 하나를 공유한다. 여러 묶음의 버튼을 스크린리더가 구분하도록 책 제목을 붙인다. */}
                <View accessibilityRole="radiogroup" accessibilityLabel={`${group.bookTitle} 감상 정렬`} style={styles.chips}>
                    {orders.map(option => {
                        const selected = option.value === order;
                        return (
                            <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={option.label}
                                accessibilityState={{ selected, checked: selected }} onPress={() => onOrderChange(option.value)}
                                style={[styles.chip, selected && styles.chipSelected]}>
                                <Text style={[styles.likeText, selected && styles.likeSelectedText]}>{option.label}</Text>
                            </Pressable>
                        );
                    })}
                </View>
            </View>
            {boxes.map(box => box.userBookId
                ? <LoungeBox key={box.key} item={box.representative} showBook={false} />
                : <ReviewRow key={box.key} item={box.representative} />)}
        </View>
    );
}

/** S-71 맨 위 검색창. 들어올 때(또는 검색어가 바뀔 때) 그 검색어로 채운다. */
function SearchAgain({ query, onSearch }: { query: string; onSearch: (query: string) => void }) {
    const [input, setInput] = useState(query);
    return <BookSearchField value={input} onChangeText={setInput} onSearch={onSearch} />;
}
