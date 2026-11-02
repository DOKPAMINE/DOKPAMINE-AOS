import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Screen, SecondaryButton, StateView } from '../components';
import {
    calendarClock, calendarDate, calendarDuration, calendarWeeks, monthlyStats,
    moveCalendarMonth, readingDays, sessionsOn, type GroupStat,
} from '../domain/calendarRules';
import { pagesRead } from '../domain/readingTypes';
import { colors, fontFamilies, radii, sizes, spacing, typography } from '../theme';
import { useCalendarRecords } from './useCalendarRecords';

const weekdays = ['일', '월', '화', '수', '목', '금', '토'];

function GroupStats({ title, groups }: { title: string; groups: readonly GroupStat[] }) {
    return (
        <View style={styles.section}>
            <Text accessibilityRole="header" style={styles.subheading}>{title}</Text>
            {groups.length === 0 ? <Text style={styles.muted}>집계할 독서 기록이 없어요.</Text> : groups.map(group => (
                <View key={group.label} style={styles.statRow}>
                    <Text style={styles.groupLabel}>{group.label}</Text>
                    <Text style={styles.statValue}>{calendarDuration(group.seconds)} · {group.pages}쪽</Text>
                </View>
            ))}
        </View>
    );
}

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
    const monthLabel = `${Number(month.slice(0, 4))}년 ${Number(month.slice(5))}월`;
    const dateLabel = `${Number(month.slice(5))}월 ${Number(selectedDate.slice(8))}일`;
    const days = readingDays(records.sessions, month);
    const daySessions = sessionsOn(records.sessions, selectedDate).sort((a, b) => a.startedAt - b.startedAt);
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
            <ScrollView horizontal accessibilityLabel={`${monthLabel} 독서 달력`}>
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
                                const read = days.has(day);
                                return (
                                    <Pressable key={weekday} accessibilityRole="button"
                                        accessibilityLabel={`${Number(month.slice(5))}월 ${day}일, ${read ? '독서함' : '독서 기록 없음'}`}
                                        accessibilityState={{ selected }} onPress={() => setSelectedDate(value)}
                                        style={({ pressed }) => [styles.day, selected && styles.selectedDay, pressed && styles.pressed]}>
                                        <Text style={[styles.dayNumber, selected && styles.selectedText]}>{day}</Text>
                                        <Text accessible={false} style={[styles.dayMark, selected && styles.selectedText]}>{read ? '●' : ' '}</Text>
                                    </Pressable>
                                );
                            })}
                        </View>
                    ))}
                </View>
            </ScrollView>
            <Text style={styles.muted}>● 독서한 날 · 테두리로 선택한 날짜를 표시해요.</Text>
            {days.size === 0 && <StateView kind="empty" message="이 달에는 독서 기록이 없어요." />}

            <View style={styles.section}>
                <Text accessibilityRole="header" style={styles.heading}>{dateLabel} 기록</Text>
                {daySessions.length === 0 ? <StateView kind="empty" message="이 날짜에는 독서 기록이 없어요." /> : daySessions.map(session => {
                    const book = bookById.get(session.bookId);
                    const title = book?.title ?? '찾을 수 없는 책';
                    const description = `${calendarClock(session.startedAt)} · ${calendarDuration(session.activeSeconds)} · ${pagesRead(session)}쪽`;
                    return (
                        <Pressable key={session.id} accessibilityRole="button" accessibilityLabel={`${title}, ${description}, 책 상세 보기`}
                            accessibilityState={{ disabled: !book }} disabled={!book}
                            onPress={() => router.push({ pathname: '/book/[id]', params: { id: session.bookId } })}
                            style={({ pressed }) => [styles.session, pressed && styles.pressed]}>
                            <Text style={styles.subheading}>{title}</Text>
                            <Text style={styles.muted}>{description}</Text>
                            <Text style={styles.muted}>{session.source === 'MANUAL' ? '직접 입력한 기록' : '타이머 기록'}</Text>
                        </Pressable>
                    );
                })}
            </View>

            <View style={styles.statistics}>
                <Text accessibilityRole="header" style={styles.heading}>{monthLabel} 월간 통계</Text>
                <View style={styles.statRow}><Text style={styles.body}>총 독서 시간</Text><Text style={styles.statValue}>{calendarDuration(stats.totalSeconds)}</Text></View>
                <View style={styles.statRow}><Text style={styles.body}>총 읽은 쪽수</Text><Text style={styles.statValue}>{stats.totalPages}쪽</Text></View>
                <View style={styles.statRow}><Text style={styles.body}>완독한 책</Text><Text style={styles.statValue}>{stats.completedBooks}권</Text></View>
                <GroupStats title="장르별" groups={stats.byGenre} />
                <GroupStats title="작가별" groups={stats.byAuthor} />
            </View>
        </Screen>
    );
}

const styles = StyleSheet.create({
    monthNavigation: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    heading: { ...typography.title, color: colors.brand.espresso, flexShrink: 1 },
    subheading: { ...typography.titleSmall, color: colors.brand.espresso },
    body: { ...typography.body, color: colors.brand.espresso, flexShrink: 1 },
    muted: { ...typography.bodySmall, color: colors.text.muted },
    calendar: { minWidth: sizes.minTouch * 7, flexGrow: 1 },
    week: { flexDirection: 'row' },
    weekday: { ...typography.label, color: colors.text.muted, textAlign: 'center', flex: 1, minWidth: sizes.minTouch, paddingVertical: spacing.sm },
    day: { flex: 1, minWidth: sizes.minTouch, minHeight: sizes.button, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.surface.paper, borderRadius: radii.small },
    selectedDay: { backgroundColor: colors.surface.sandSoft, borderColor: colors.brand.espresso },
    selectedText: { fontFamily: fontFamilies.bold },
    dayNumber: { ...typography.label, color: colors.brand.espresso },
    dayMark: { ...typography.footnote, color: colors.text.muted },
    section: { gap: spacing.md },
    session: { minHeight: sizes.minTouch, gap: spacing.sm, paddingVertical: spacing.md, borderBottomWidth: 1, borderColor: colors.line.border },
    statistics: { gap: spacing.lg, padding: spacing.lg, backgroundColor: colors.surface.sandSoft, borderRadius: radii.card },
    statRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm },
    groupLabel: { ...typography.bodySmall, color: colors.brand.espresso, flexShrink: 1 },
    statValue: { ...typography.label, color: colors.brand.espresso, textAlign: 'right' },
    pressed: { opacity: 0.6 },
});
