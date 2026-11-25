import { useRef, useState, type Ref } from 'react';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import type { BookReviewGroup } from '../api/types';
import { Screen, SecondaryButton, StateView } from '../components';
import { findBookGroup, groupCover, groupReviewBoxes, sortReviewBoxes, type ReviewBoxOrder } from '../domain/loungeRules';
import { BookCover } from '../shelf/BookCover';
import { sizes } from '../theme';
import { BookSearchField, SearchDismissArea, pickBookHint, type BookSearchFieldHandle, type SelectedBook } from './BookSearchField';
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
 * S-71 · FR-16 책별 감상. #124 라운지나 이 화면 위쪽 검색창의 자동완성에서 고른 책 묶음 하나를 보여 준다.
 * query는 그 목록을 만든 검색어, bookKey는 고른 책 묶음이다. 그 검색어의 서버 결과에서 bookKey 묶음을 찾고,
 * 그 사이 감상이 지워지는 등으로 묶음이 없어졌으면 빈 안내를, 고른 책 없이 들어왔으면 책을 골라 달라는 안내를 보여 준다.
 * 위에 책 정보(왼쪽 표지: coverUrl이 있는 첫 감상의 표지, 없으면 책장의 기본 표지 / 오른쪽 제목·저자·ISBN)를 두고,
 * 구분선 아래에 #113 "N명의 감상"(N은 사람의 책 박스 수)과 그 옆 정렬 버튼(좁으면 아래 줄), 그 아래 카드 모양의 박스를 둔다.
 * 박스에는 표지와 책 제목 없이 닉네임, 대표 감상 앞부분, 날짜만 둔다. 박스는 S-76, userBookId가 없는 예전 응답의 감상은 S-72로 간다.
 * [최신순]·[좋아요 많은 순]은 박스 순서에만 적용한다. 기본은 최신순이고, 다른 책을 고르면 최신순으로 되돌린다.
 * 맨 위에 라운지와 같은 검색창을 두고 고른 책의 제목으로 채운다. 여기서 다른 책을 고르면 새 화면을 쌓지 않고
 * 이 화면의 파라미터만 바꿔 결과를 다시 받는다. 그래서 뒤로 가기는 언제나 라운지로 간다.
 * 같은 책을 다시 고르면 파라미터가 그대로이므로 결과를 직접 다시 받는다(refetch).
 */
export function BookReviewsScreen({ query, bookKey, title }: { query: string; bookKey: string; title: string }) {
    // 고른 책(bookKey) 없이 열리면 보여 줄 책이 없으므로 요청하지 않는다.
    const result = useBookReviews(bookKey ? query : '');
    // 정렬은 고른 책에 묶어 둔다. 다른 책을 고르면 저장된 정렬이 다른 책의 것이므로 최신순으로 본다.
    const selection = `${query}
${bookKey}`;
    const [sort, setSort] = useState<{ selection: string; order: ReviewBoxOrder }>({ selection, order: 'latest' });
    const order = sort.selection === selection ? sort.order : 'latest';
    const setOrder = (next: ReviewBoxOrder) => setSort({ selection, order: next });
    const selectBook = (book: SelectedBook) => {
        if (book.query === query && book.bookKey === bookKey) void result.refetch();
        else router.setParams({ query: book.query, bookKey: book.bookKey, title: book.bookTitle });
    };
    const group = result.data ? findBookGroup(result.data, bookKey) : undefined;
    const search = useRef<BookSearchFieldHandle>(null);
    return (
        <Screen title="책별 감상" keyboardShouldPersistTaps="handled">
            <View style={styles.section}>
                {/* 다른 책을 고르면 key로 검색창을 새로 만들어 그 책의 제목으로 채운다. */}
                <SearchAgain key={selection} ref={search} title={title} onSelectBook={selectBook} />
            </View>
            {/* #124 검색창 밖(뒤로 가기·정렬 버튼·감상 박스 등)을 누르면 키보드와 자동완성을 닫는다. */}
            <SearchDismissArea search={search}>
                <SecondaryButton label="라운지로 돌아가기" onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/lounge')} />
                {!query.trim() || !bookKey ? <StateView kind="empty" message={pickBookHint} />
                    : result.isError ? <QueryError error={result.error} retry={() => { void result.refetch(); }} />
                        : result.isPending ? <StateView kind="loading" />
                            : !group ? <StateView kind="empty" message="아직 공개된 감상이 없어요" />
                                : <BookGroup group={group} order={order} onOrderChange={setOrder} />}
            </SearchDismissArea>
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
                    {/* 책 제목은 2줄까지 보이고 넘치면 …으로 줄인다. 스크린리더는 전체 제목을 읽는다. */}
                    <Text accessibilityRole="header" accessibilityLabel={group.bookTitle} numberOfLines={2} ellipsizeMode="tail" style={styles.heading}>{group.bookTitle}</Text>
                    <Text style={styles.muted}>{group.bookAuthor}{group.isbn ? ` · ISBN ${group.isbn}` : ''}</Text>
                </View>
            </View>
            <View testID="book-group-divider" accessible={false} importantForAccessibility="no" style={styles.divider} />
            <View testID="book-group-count-row" style={styles.countRow}>
                <Text accessibilityRole="header" style={styles.titleSmall}>{boxes.length}명의 감상</Text>
                <View accessibilityRole="radiogroup" accessibilityLabel="감상 정렬" style={styles.chips}>
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

/** S-71 맨 위 검색창. 들어올 때(또는 다른 책을 고를 때) 고른 책의 제목으로 채운다. */
function SearchAgain({ title, onSelectBook, ref }: { title: string; onSelectBook: (book: SelectedBook) => void; ref?: Ref<BookSearchFieldHandle> }) {
    const [input, setInput] = useState(title);
    return <BookSearchField ref={ref} value={input} onChangeText={setInput} onSelectBook={onSelectBook} />;
}
