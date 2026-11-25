import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { Screen, StateView } from '../components';
import { colors, sizes } from '../theme';
import { BookSearchField, SearchDismissArea, type BookSearchFieldHandle, type SelectedBook } from './BookSearchField';
import { refetchFeed, useFeed } from './queries';
import { QueryError } from './QueryState';
import { LoungeBox } from './LoungeBox';
import { styles } from './styles';

export function LoungeScreen() {
    const [query, setQuery] = useState('');
    const search = useRef<BookSearchFieldHandle>(null);
    const feed = useFeed();
    const client = useQueryClient();
    const [refreshing, setRefreshing] = useState(false);
    // #91: 탭으로 돌아올 때마다 최근 공개 감상을 서버에서 다시 받는다. 처음 열 때의 조회와는 겹치지 않는다.
    useFocusEffect(useCallback(() => { void refetchFeed(client); }, [client]));
    // #91: 아래로 당기면 새로고침한다. 진행 중인 조회가 있으면 취소하지 않고 그 결과를 기다린다.
    // 조회가 끝날 때까지 표시를 유지하고, 실패는 목록 자리에 안내한다.
    const refresh = () => {
        setRefreshing(true);
        void feed.refetch({ cancelRefetch: false }).finally(() => setRefreshing(false));
    };
    // #124: 검색은 자동완성에서 책을 골라서만 한다. 고른 책은 S-71에서 그 책 묶음만 보여 준다.
    const selectBook = ({ query: term, bookKey, bookTitle }: SelectedBook) => {
        router.push({ pathname: '/lounge/search', params: { query: term, bookKey, title: bookTitle } });
        // #113: 라운지 탭은 화면이 남아 있으므로, 결과 화면으로 넘어가면 다음 검색을 위해 검색창을 비운다.
        setQuery('');
    };
    // #124 S-73 독서왕 랭킹은 제목 오른쪽의 트로피 버튼으로 연다. 누르는 영역은 44dp 이상이다.
    const ranking = (
        <Pressable testID="lounge-ranking" accessibilityRole="button" accessibilityLabel="독서왕 랭킹" onPress={() => router.push('/ranking')}
            style={({ pressed }) => [styles.rankingButton, pressed && styles.suggestionPressed]}>
            <MaterialCommunityIcons name="trophy-outline" size={sizes.icon} color={colors.brand.espresso} accessible={false} />
        </Pressable>
    );
    return (
        <Screen title="라운지" action={ranking} refreshing={refreshing} onRefresh={refresh} keyboardShouldPersistTaps="handled">
            <View style={styles.section}>
                <Text style={styles.body}>같은 책을 읽은 사람들의 감상을 찾아보세요.</Text>
                <BookSearchField ref={search} value={query} onChangeText={setQuery} onSelectBook={selectBook} />
            </View>
            {/* #124 검색창 밖을 누르면 키보드와 자동완성을 닫는다. */}
            <SearchDismissArea search={search}>
                <Text accessibilityRole="header" style={styles.heading}>최근 공개 감상</Text>
                {feed.isError ? <QueryError error={feed.error} retry={() => { void feed.refetch(); }} />
                    : feed.isPending ? <StateView kind="loading" />
                        : feed.data.length === 0 ? <StateView kind="empty" message="아직 공개된 감상이 없어요" />
                            // #113: 박스는 사람의 책 하나다. 순서는 서버가 준 그대로 둔다.
                            : feed.data.map(item => <LoungeBox key={item.userBookId ?? item.id} item={item} />)}
            </SearchDismissArea>
        </Screen>
    );
}
