import { useLocalSearchParams } from 'expo-router';
import { BookReviewsScreen } from '../../src/lounge/BookReviewsScreen';

// S-71 · FR-16 책별 공개 감상. #124 자동완성에서 고른 책 하나(query: 목록을 만든 검색어, bookKey: 책 묶음, title: 책 제목)를 보여 준다.
export default function BookReviewsRoute() {
    const { query, bookKey, title } = useLocalSearchParams<{ query?: string | string[]; bookKey?: string | string[]; title?: string | string[] }>();
    const text = (value: string | string[] | undefined) => typeof value === 'string' ? value : '';
    return <BookReviewsScreen query={text(query)} bookKey={text(bookKey)} title={text(title)} />;
}
