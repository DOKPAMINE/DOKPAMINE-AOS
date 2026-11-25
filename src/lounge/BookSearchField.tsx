import { TextInput } from 'react-native';
import { PrimaryButton } from '../components';
import { colors } from '../theme';
import { styles } from './styles';

/**
 * FR-16 S-70·S-71 책 감상 검색창. 라운지와 책별 감상이 같은 모양을 쓴다.
 * 빈 칸(공백만 포함)이면 검색 버튼을 막고 키보드 검색도 무시한다. 검색어는 앞뒤 공백을 잘라 넘긴다.
 */
export function BookSearchField({ value, onChangeText, onSearch }: {
    value: string; onChangeText: (value: string) => void; onSearch: (query: string) => void;
}) {
    const query = value.trim();
    const submit = () => { if (query) onSearch(query); };
    return <>
        <TextInput accessibilityRole="search" accessibilityLabel="책 이름" placeholder="책 이름을 입력해 주세요" placeholderTextColor={colors.text.muted}
            value={value} onChangeText={onChangeText} onSubmitEditing={submit} returnKeyType="search" style={styles.input} />
        <PrimaryButton label="책 감상 검색" disabled={!query} onPress={submit} />
    </>;
}
