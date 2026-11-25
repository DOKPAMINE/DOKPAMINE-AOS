import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import type { FeedItem } from '../api/types';
import { loungeBoxLabel, withMine, writtenDate } from '../domain/loungeRules';
import { BookCover } from '../shelf/BookCover';
import { BracketTitle } from './BracketTitle';
import { styles } from './styles';

/** #113 S-70 박스 표지 너비. 높이는 책장 표지(BookCover)와 같은 2:3 비율이다. */
export const BOX_COVER_WIDTH = 44;

/**
 * #113 S-70·S-71: 사람의 책 하나를 박스 하나로 보여 준다. 내용은 대표 감상이다.
 * S-70(showBook)은 왼쪽에 작은 책 앞표지(없거나 불러오지 못하면 책장의 기본 표지), 오른쪽 칸에
 * "『제목』"(내가 쓴 박스면 "(내 감상)"), 닉네임, 감상 앞부분, 날짜를 세로로 둔다.
 * S-71은 표지와 책 제목을 책 묶음 제목에서 한 번만 보여 주므로, 박스에는 닉네임(내가 쓴 박스면 "(내 감상)"), 감상 앞부분, 날짜만 둔다.
 * 글 칸은 남은 너비만 쓰고(flex 1, minWidth 0) 그 안에서 줄바꿈한다. 글자 크기 설정을 막지 않는다.
 * 스크린리더도 화면과 같은 순서로 읽고, 누르면 무엇이 열리는지는 힌트로 알린다.
 * 누르면 그 사람이 그 책에 쓴 공개 감상 모음(S-76)을 연다. userBookId를 주지 않는 구버전 서버면 대표 감상의 상세(S-72)를 연다.
 */
export function LoungeBox({ item, showBook = true }: { item: FeedItem; showBook?: boolean }) {
    // S-71 박스(showBook=false)는 책 정보와 구분되도록 카드 모양으로 둔다.
    const text = item.body || item.oneLine || '';
    const date = writtenDate(item.bodyWrittenAt);
    const open = () => item.userBookId
        ? router.push({ pathname: '/lounge/user-books/[userBookId]', params: { userBookId: item.userBookId } })
        : router.push({ pathname: '/lounge/[id]', params: { id: item.id } });
    return (
        <Pressable accessibilityRole="button" onPress={open} style={[showBook ? styles.review : styles.reviewCard, styles.row]}
            accessibilityLabel={loungeBoxLabel({ nickname: item.nickname, bookTitle: showBook ? item.bookTitle : undefined, mine: item.mine, text, date })}
            accessibilityHint={item.userBookId ? '감상 모음을 열어요' : '감상 상세를 열어요'}>
            {showBook ? <BookCover key={item.coverUrl ?? 'none'} uri={item.coverUrl ?? null} genre={item.genre} width={BOX_COVER_WIDTH} /> : null}
            <View testID="lounge-box-text" style={styles.rowText}>
                {showBook ? <>
                    {/* 제목은 1줄까지 보이고 넘치면 …으로 줄인다. 』와 (내 감상)은 항상 보인다. */}
                    <BracketTitle title={item.bookTitle} mine={item.mine} style={styles.titleSmall} maxLines={1} />
                    <Text style={styles.muted}>{item.nickname}</Text>
                </> : <Text style={styles.titleSmall}>{withMine(item.nickname, item.mine)}</Text>}
                <Text style={styles.body} numberOfLines={3}>{text}</Text>
                {date ? <Text style={styles.muted}>{date.text}</Text> : null}
            </View>
        </Pressable>
    );
}
