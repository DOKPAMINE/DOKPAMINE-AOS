import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AccessibilityInfo, Pressable, Text, TextInput, View, useWindowDimensions, type TextInputInstance } from 'react-native';
import { ApiError } from '../api/errors';
import { useSignedInUserId } from '../auth/AuthProvider';
import { bookSuggestionLabel, bookSuggestions, type BookSuggestion } from '../domain/loungeRules';
import { recentBookLabel, type RecentBook } from '../domain/recentBooks';
import { BookCover } from '../shelf/BookCover';
import { colors, sizes, spacing } from '../theme';
import { bookSuggestionDelayMs, primeBookReviews, useBookSuggestions } from './queries';
import { useRecentBooks } from './recentBooks';
import { styles } from './styles';
import { useDebouncedValue } from './useDebouncedValue';

/**
 * #124: 자동완성에서 고른 책. query는 그 목록을 만든 검색어(S-71이 이 검색어 결과에서 bookKey 묶음을 찾는다),
 * bookKey는 고른 책 묶음, bookTitle은 검색창에 채울 그 책의 제목이다.
 */
export interface SelectedBook { query: string; bookKey: string; bookTitle: string }

/** #124: 키보드 검색 키를 누르면 검색하지 않고 검색창 아래에 보여 주는 안내. */
export const pickBookHint = '목록에서 책을 골라 주세요';

/** #124: 자동완성 결과가 없거나 불러오지 못했을 때 목록 자리에 보여 주는 안내. */
export const suggestionMessages = {
    empty: '아직 감상이 있는 책이 없어요',
    error: '책을 불러오지 못했어요',
    offline: '인터넷에 연결되면 찾을 수 있어요',
} as const;

/**
 * FR-16 S-70·S-71 책 감상 검색창. 라운지와 책별 감상이 같은 모양을 쓴다.
 *
 * #124 검색은 자동완성 선택으로만 한다. 검색창에 포커스가 있는 동안 글자를 멈추고 0.3초 뒤 책별 감상 검색으로 책을 찾아,
 * 검색창 바로 아래에 표지·제목·저자·"N명의 감상"을 최대 5권 보여 준다. 책을 누르면 검색창을 그 책의 제목으로 채우고 onSelectBook을 부른다.
 * 그 검색어의 결과가 0권이면 "아직 감상이 있는 책이 없어요", 오류면 "책을 불러오지 못했어요", 오프라인이면(요청하지 않음)
 * "인터넷에 연결되면 찾을 수 있어요"를 목록 자리에 보여 준다. 다음 검색어를 기다리는 동안에는 직전 목록을 그대로 둔다.
 * 검색 버튼은 없고, 키보드 검색 키는 검색하지 않고 키보드를 연 채로 "목록에서 책을 골라 주세요"를 검색창 아래에 보여 준다.
 * 안내는 글자를 고치거나 책을 고르면 사라진다.
 * 검색창이 비어 있으면(공백만 포함) 자동완성 대신 로그인한 계정의 "최근 고른 책"(최대 5권)을 보여 준다. 누르면 자동완성에서 고른 것과 같고,
 * 책마다 지우기와 전체 지우기가 있다. 자동완성이나 최근 고른 책에서 고른 책은 최근 고른 책 맨 위로 올라간다.
 * 포커스가 빠지면(검색창 밖을 누름) 목록과 안내를 닫는다. 책을 고르면 포커스를 빼서 키보드와 목록을 함께 닫는다.
 * 목록이 화면 스크롤 안에 있으므로, 키보드가 떠 있어도 한 번에 눌리도록 화면은 keyboardShouldPersistTaps="handled"로 둔다.
 * #124 입력칸 왼쪽 안쪽에 안내 문구 색의 돋보기를 둔다. 꾸밈이므로 스크린리더는 건너뛰고, 눌러도 입력칸이 눌린다.
 * 큰 글씨 설정(fontScale)만큼 아이콘을 키우고, 글자가 겹치지 않게 입력칸 왼쪽 여백도 그만큼 늘린다.
 */
export function BookSearchField({ value, onChangeText, onSelectBook }: {
    value: string; onChangeText: (value: string) => void; onSelectBook: (book: SelectedBook) => void;
}) {
    const query = value.trim();
    const input = useRef<TextInputInstance>(null);
    const [focused, setFocused] = useState(false);
    const [hint, setHint] = useState(false);
    const { fontScale } = useWindowDimensions();
    const iconSize = Math.round(sizes.icon * 0.85 * fontScale);
    const client = useQueryClient();
    const recent = useRecentBooks(useSignedInUserId());
    // 포커스가 없으면 조회하지 않는다. S-71처럼 검색어를 채워 들어와도 검색창을 누르기 전에는 요청하지 않는다.
    const term = useDebouncedValue(focused ? query : '', bookSuggestionDelayMs);
    const suggestion = useBookSuggestions(term);
    const result = suggestion.isError ? undefined : suggestion.data;
    const items = result ? bookSuggestions(result.groups) : [];
    // 안내는 지금 검색창의 검색어에 대한 결과일 때만 보여 준다. 글자를 고쳐 다음 조회를 기다리는 동안에는 띄우지 않는다.
    const settled = term.length > 0 && term === query;
    const message = !settled ? null
        : suggestion.isError ? (suggestion.error instanceof ApiError && suggestion.error.kind === 'offline' ? suggestionMessages.offline : suggestionMessages.error)
            : suggestion.isSuccess && !suggestion.isPlaceholderData && items.length === 0 ? suggestionMessages.empty : null;
    const panel = !focused ? null
        : !query ? (recent.books.length > 0 ? 'recent' : null)
            : message ? 'message' : items.length > 0 ? 'suggestions' : null;

    const showHint = () => {
        setHint(true);
        // 안내가 이미 보이는 중에 검색 키를 다시 눌러도 스크린리더가 읽도록 매번 직접 알린다.
        AccessibilityInfo.announceForAccessibility(pickBookHint);
    };
    const change = (next: string) => {
        setHint(false);
        onChangeText(next);
    };
    const pick = (book: RecentBook) => {
        input.current?.blur();
        setHint(false);
        onChangeText(book.bookTitle);
        recent.add(book);
        onSelectBook({ query: book.query, bookKey: book.bookKey, bookTitle: book.bookTitle });
    };
    const select = (item: BookSuggestion) => {
        if (!result) return;
        primeBookReviews(client, result);
        pick({ query: result.term, bookKey: item.bookKey, bookTitle: item.bookTitle, bookAuthor: item.bookAuthor, cover: item.cover });
    };
    const remove = (book: RecentBook) => {
        recent.remove(book.bookKey);
        AccessibilityInfo.announceForAccessibility(`${book.bookTitle}, 최근 고른 책에서 지웠어요`);
    };
    const clear = () => {
        recent.clear();
        AccessibilityInfo.announceForAccessibility('최근 고른 책을 모두 지웠어요');
    };

    return (
        <View style={styles.searchBox}>
            <View>
                <TextInput ref={input} accessibilityRole="search" accessibilityLabel="책 이름" placeholder="책 이름을 입력해 주세요" placeholderTextColor={colors.text.muted}
                    value={value} onChangeText={change} onSubmitEditing={showHint} submitBehavior="submit" returnKeyType="search"
                    style={[styles.input, { paddingLeft: spacing.md + iconSize + spacing.sm }]}
                    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} />
                {/* 입력칸 위에 겹쳐 두되 터치는 입력칸으로 넘기고, 높이가 커져도 세로 가운데에 둔다. */}
                <View testID="book-search-icon" pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={styles.searchIcon}>
                    <MaterialCommunityIcons name="magnify" size={iconSize} color={colors.text.muted} accessible={false} />
                </View>
            </View>
            {hint ? <Text testID="book-search-hint" style={styles.muted}>{pickBookHint}</Text> : null}
            {panel === 'recent' ? <RecentBookList books={recent.books} onSelect={pick} onRemove={remove} onClear={clear} iconSize={iconSize} />
                : panel === 'message' && message ? <SuggestionMessage message={message} />
                    : panel === 'suggestions' ? <BookSuggestionList items={items} onSelect={select} /> : null}
        </View>
    );
}

/** #124 자동완성 목록. 스크린리더에는 목록(list)과 버튼 항목으로 알리고, 열리거나 책 수가 바뀌면 찾은 책 수를 읽어 준다. */
function BookSuggestionList({ items, onSelect }: { items: BookSuggestion[]; onSelect: (item: BookSuggestion) => void }) {
    const announcement = `책 ${items.length}권을 찾았어요`;
    useEffect(() => { AccessibilityInfo.announceForAccessibility(announcement); }, [announcement]);
    return (
        <View testID="book-suggestions" accessibilityRole="list" accessibilityLabel="책 이름 자동완성" style={styles.suggestions}>
            {items.map((item, index) => (
                <Pressable key={item.bookKey} testID="book-suggestion" accessibilityRole="button" accessibilityLabel={bookSuggestionLabel(item)}
                    accessibilityHint="이 책의 감상만 봐요" onPress={() => onSelect(item)}
                    style={({ pressed }) => [styles.suggestion, index > 0 && styles.suggestionDivider, pressed && styles.suggestionPressed]}>
                    <BookCover key={item.cover.uri ?? 'none'} uri={item.cover.uri} genre={item.cover.genre} width={spacing.xxl} />
                    <View style={styles.rowText}>
                        <Text numberOfLines={1} ellipsizeMode="tail" style={styles.titleSmall}>{item.bookTitle}</Text>
                        {item.bookAuthor.trim() ? <Text numberOfLines={1} ellipsizeMode="tail" style={styles.muted}>{item.bookAuthor}</Text> : null}
                        <Text style={styles.muted}>{item.readerCount}명의 감상</Text>
                    </View>
                </Pressable>
            ))}
        </View>
    );
}

/** #124 자동완성 결과 안내(0권·오류·오프라인). 목록과 같은 자리·테두리에 두고, 바뀔 때마다 스크린리더가 읽어 준다. */
function SuggestionMessage({ message }: { message: string }) {
    useEffect(() => { AccessibilityInfo.announceForAccessibility(message); }, [message]);
    return (
        <View testID="book-suggestion-message" style={[styles.suggestions, styles.suggestionMessage]}>
            <Text style={styles.muted}>{message}</Text>
        </View>
    );
}

/**
 * #124 최근 고른 책 목록. 머리에 "최근 고른 책"과 [전체 지우기]를 두고, 책마다 표지·제목·저자와 지우기 버튼을 둔다.
 * 스크린리더에는 목록(list)으로 알리고, 책은 "제목, 저자" 버튼, 지우기는 "제목 지우기" 버튼으로 읽는다.
 */
function RecentBookList({ books, onSelect, onRemove, onClear, iconSize }: {
    books: readonly RecentBook[]; onSelect: (book: RecentBook) => void; onRemove: (book: RecentBook) => void; onClear: () => void; iconSize: number;
}) {
    return (
        <View testID="recent-books" accessibilityRole="list" accessibilityLabel="최근 고른 책" style={styles.suggestions}>
            <View style={styles.recentHeader}>
                <Text accessibilityRole="header" style={styles.titleSmall}>최근 고른 책</Text>
                <Pressable testID="recent-books-clear" accessibilityRole="button" accessibilityLabel="최근 고른 책 전체 지우기" onPress={onClear}
                    style={({ pressed }) => [styles.recentAction, pressed && styles.suggestionPressed]}>
                    <Text style={styles.likeText}>전체 지우기</Text>
                </Pressable>
            </View>
            {books.map(book => (
                <View key={book.bookKey} style={[styles.recentRow, styles.suggestionDivider]}>
                    <Pressable testID="recent-book" accessibilityRole="button" accessibilityLabel={recentBookLabel(book)}
                        accessibilityHint="이 책의 감상만 봐요" onPress={() => onSelect(book)}
                        style={({ pressed }) => [styles.suggestion, styles.recentBook, pressed && styles.suggestionPressed]}>
                        <BookCover key={book.cover.uri ?? 'none'} uri={book.cover.uri} genre={book.cover.genre} width={spacing.xxl} />
                        <View style={styles.rowText}>
                            <Text numberOfLines={1} ellipsizeMode="tail" style={styles.titleSmall}>{book.bookTitle}</Text>
                            {book.bookAuthor.trim() ? <Text numberOfLines={1} ellipsizeMode="tail" style={styles.muted}>{book.bookAuthor}</Text> : null}
                        </View>
                    </Pressable>
                    <Pressable testID="recent-book-remove" accessibilityRole="button" accessibilityLabel={`${book.bookTitle} 지우기`}
                        onPress={() => onRemove(book)} hitSlop={spacing.xs}
                        style={({ pressed }) => [styles.recentRemove, pressed && styles.suggestionPressed]}>
                        <MaterialCommunityIcons name="close" size={iconSize} color={colors.text.muted} accessible={false} />
                    </Pressable>
                </View>
            ))}
        </View>
    );
}
