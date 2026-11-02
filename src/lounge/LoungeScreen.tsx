import { useState } from 'react';
import { router } from 'expo-router';
import { Text, TextInput, View } from 'react-native';
import { PrimaryButton, Screen, SecondaryButton, StateView } from '../components';
import { colors } from '../theme';
import { useFeed } from './queries';
import { QueryError } from './QueryState';
import { ReviewRow } from './ReviewRow';
import { styles } from './styles';

export function LoungeScreen() {
    const [query, setQuery] = useState('');
    const feed = useFeed();
    const search = () => {
        if (query.trim()) router.push({ pathname: '/lounge/search', params: { query: query.trim() } });
    };
    return (
        <Screen title="라운지">
            <View style={styles.section}>
                <Text style={styles.body}>같은 책을 읽은 사람들의 감상을 찾아보세요.</Text>
                <TextInput accessibilityRole="search" accessibilityLabel="책 이름" placeholder="책 이름을 입력해 주세요" placeholderTextColor={colors.text.muted}
                    value={query} onChangeText={setQuery} onSubmitEditing={search} returnKeyType="search" style={styles.input} />
                <PrimaryButton label="책 감상 검색" disabled={!query.trim()} onPress={search} />
            </View>
            <SecondaryButton label="독서왕 랭킹" onPress={() => router.push('/ranking')} />
            <Text accessibilityRole="header" style={styles.heading}>최근 공개 감상</Text>
            {feed.isError ? <QueryError error={feed.error} retry={() => { void feed.refetch(); }} />
                : feed.isPending ? <StateView kind="loading" />
                    : feed.data.length === 0 ? <StateView kind="empty" message="아직 공개된 감상이 없어요" />
                        : feed.data.map(item => <ReviewRow key={item.id} item={item} />)}
        </Screen>
    );
}
