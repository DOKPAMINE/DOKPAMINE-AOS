import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Screen, SecondaryButton, StateView } from '../components';
import {
    booksReadByDate, calendarDate, calendarDuration, calendarWeeks, dayCovers, monthlyStats,
    moveCalendarMonth,
} from '../domain/calendarRules';
import { BookCover } from '../shelf/BookCover';
import { colors, fontFamilies, radii, sizes, spacing, typography } from '../theme';
import { DayCovers } from './DayCovers';
import { MonthlyStatistics } from './MonthlyStatistics';
import { useCalendarRecords } from './useCalendarRecords';

/** S-61 줄 표지 폭. 홈(S-10) 읽는 중 책 표지와 같은 66(최소 터치 44 × 1.5, 높이 99)으로 둔다. */
const DAY_BOOK_COVER_WIDTH = sizes.minTouch * 1.5;

const weekdays = ['일', '월', '화', '수', '목', '금', '토'];

/** S-60 독서 캘린더 · S-61 날짜별 기록 · S-62 월간 통계 / FR-05·FR-06 */
export function CalendarScreen() {
    const { date } = useLocalSearchParams<{ date?: string | string[] }>();
    const routeDate = typeof date === 'string' ? date : undefined;
    const { records, retry } = useCalendarRecords();

    if (records.kind !== 'ready') return (
        <Screen title="캘린더"><StateView kind={records.kind}
            message={records.kind === 'loading' ? '독서 기록을 불러오고 있어요.' : '독서 기록을 불러오지 못했어요.'}
            onRetry={records.kind === 'error' ? retry : undefined} /></Screen>
    );

    // 같은 탭으로 새 date가 전달되면 선택만 초기화하고 저장소 구독은 유지한다.
    return <CalendarContent key={routeDate ?? ''} initialDate={routeDate} records={records} />;
}

function CalendarContent({ initialDate, records }: {
    initialDate: string | undefined;
    records: Extract<ReturnType<typeof useCalendarRecords>['records'], { kind: 'ready' }>;
}) {
    const router = useRouter();
    const [selectedDate, setSelectedDate] = useState(() => calendarDate(initialDate, Date.now()));

    const month = selectedDate.slice(0, 7);
    // 날짜를 눌러도 다시 계산하지 않고, 저장소 변경으로 기록 배열이 바뀌거나 달이 바뀔 때만 한 달 치를 묶는다.
    const booksByDate = useMemo(() => booksReadByDate(records.sessions, records.books, month),
        [records.sessions, records.books, month]);
    const monthLabel = `${Number(month.slice(0, 4))}년 ${Number(month.slice(5))}월`;
    const dateLabel = `${Number(month.slice(5))}월 ${Number(selectedDate.slice(8))}일`;
    // S-61은 달력 날짜 칸과 같은 계산 결과를 써서 책 순서·합계·삭제 처리가 어긋나지 않게 한다.
    const selectedBooks = booksByDate.get(selectedDate) ?? [];
    const stats = monthlyStats(records.sessions, records.books, month);
    const bookById = new Map(records.books.filter(book => !book.deleted).map(book => [book.id, book]));

    return (
        <Screen title="캘린더">
            <View style={styles.monthNavigation}>
                <SecondaryButton label="‹" accessibilityLabel="이전 달" onPress={() => setSelectedDate(value => moveCalendarMonth(value, -1))}
                    disabled={month === '0000-01'} />
                <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.heading}>{monthLabel}</Text>
                <SecondaryButton label="›" accessibilityLabel="다음 달" onPress={() => setSelectedDate(value => moveCalendarMonth(value, 1))}
                    disabled={month === '9999-12'} />
            </View>
            <ScrollView horizontal accessibilityLabel={`${monthLabel} 독서 달력`} contentContainerStyle={styles.calendarScroll}>
                <View style={styles.calendar}>
                    <View style={styles.week}>
                        {weekdays.map(day => <Text key={day} style={styles.weekday}>{day}</Text>)}
                    </View>
                    {calendarWeeks(month).map((week, index) => (
                        <View key={index} style={styles.week}>
                            {week.map((day, weekday) => {
                                if (day === null) return <View key={weekday} style={styles.day} />;
                                const value = `${month}-${String(day).padStart(2, '0')}`;
                                const selected = value === selectedDate;
                                const dayBooks = booksByDate.get(value) ?? [];
                                const titles = dayBooks.map(item => bookById.get(item.bookId)?.title ?? '찾을 수 없는 책');
                                const { shown, remaining } = dayCovers(dayBooks);
                                return (
                                    <Pressable key={weekday} accessibilityRole="button"
                                        accessibilityLabel={`${Number(month.slice(5))}월 ${day}일, ${dayBooks.length > 0
                                            ? `${dayBooks.length}권 읽음: ${titles.join(', ')}` : '독서 기록 없음'}`}
                                        accessibilityState={{ selected }} onPress={() => setSelectedDate(value)}
                                        style={({ pressed }) => [styles.day, selected && styles.selectedDay, pressed && styles.pressed]}>
                                        <Text style={[styles.dayNumber, selected && styles.selectedText]}>{day}</Text>
                                        <DayCovers remaining={remaining} covers={shown.map((item, index) => ({
                                            uri: bookById.get(item.bookId)?.coverUrl ?? null, title: titles[index],
                                        }))} />
                                    </Pressable>
                                );
                            })}
                        </View>
                    ))}
                </View>
            </ScrollView>

            <View style={styles.section}>
                <Text accessibilityRole="header" style={styles.heading}>{dateLabel} 기록</Text>
                {selectedBooks.length === 0 ? <StateView kind="empty" message="이 날짜에는 독서 기록이 없어요." /> : selectedBooks.map(item => {
                    const book = bookById.get(item.bookId);
                    const title = book?.title ?? '찾을 수 없는 책';
                    const duration = calendarDuration(item.seconds);
                    return (
                        <Pressable key={item.bookId} accessibilityRole="button" accessibilityLabel={`${title}, ${duration}, 책 상세 보기`}
                            accessibilityState={{ disabled: !book }} disabled={!book}
                            onPress={() => router.push({ pathname: '/book/[id]', params: { id: item.bookId } })}
                            style={({ pressed }) => [styles.dayBook, pressed && styles.pressed]}>
                            {/* 표지는 장식이므로 보조 기술에서 건너뛰고 책 정보는 줄 라벨로 전달한다. 찾을 수 없는 책은 기본 표지와 '기타'를 쓴다. */}
                            <View testID="day-book-cover" accessible={false} importantForAccessibility="no-hide-descendants">
                                <BookCover key={book?.coverUrl ?? 'none'} uri={book?.coverUrl ?? null} genre={book?.genre ?? '기타'}
                                    width={DAY_BOOK_COVER_WIDTH} />
                            </View>
                            <View style={styles.dayBookText}>
                                <Text style={styles.subheading}>{title}</Text>
                                <Text style={styles.muted}>{duration}</Text>
                            </View>
                        </Pressable>
                    );
                })}
            </View>

            <MonthlyStatistics title={`${monthLabel} 월간 통계`} stats={stats} />
        </Screen>
    );
}

const styles = StyleSheet.create({
    monthNavigation: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    heading: { ...typography.title, color: colors.brand.espresso, flexShrink: 1 },
    subheading: { ...typography.titleSmall, color: colors.brand.espresso },
    muted: { ...typography.bodySmall, color: colors.text.muted },
    // 가로 ScrollView의 내용 컨테이너가 화면 폭 이상이 되어야 달력이 화면 폭을 채운다.
    calendarScroll: { flexGrow: 1 },
    calendar: { minWidth: sizes.minTouch * 7, flexGrow: 1 },
    week: { flexDirection: 'row' },
    weekday: { ...typography.label, color: colors.text.muted, textAlign: 'center', flex: 1, minWidth: sizes.minTouch, paddingVertical: spacing.sm },
    // S-60: 위쪽 날짜 숫자, 그 아래 2:3 표지 영역. 위에서부터 쌓아 같은 줄 칸의 표지 위치를 맞춘다.
    day: { flex: 1, flexBasis: 0, minWidth: sizes.minTouch, minHeight: sizes.button, alignItems: 'stretch', justifyContent: 'flex-start', gap: spacing.xs, padding: spacing.xs, borderWidth: 1, borderColor: colors.surface.paper, borderRadius: radii.small },
    selectedDay: { backgroundColor: colors.surface.sandSoft, borderColor: colors.brand.espresso },
    selectedText: { fontFamily: fontFamilies.bold },
    dayNumber: { ...typography.label, color: colors.brand.espresso, textAlign: 'center' },
    section: { gap: spacing.md },
    dayBook: { minHeight: sizes.minTouch, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderColor: colors.line.border },
    dayBookText: { flex: 1, gap: spacing.xs },
    pressed: { opacity: 0.6 },
});
