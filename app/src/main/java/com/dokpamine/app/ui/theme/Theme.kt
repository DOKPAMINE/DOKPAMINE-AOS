package com.dokpamine.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

// Figma "독파민 · 75 화면" 의 색상 변수
object Dok {
    val Paper = Color(0xFFF7F6F0)      // 배경
    val Surface = Color(0xFFFFFFFF)    // 카드
    val Ink = Color(0xFF20291F)        // 본문, 주 버튼
    val Muted = Color(0xFF6A7166)      // 보조 텍스트
    val Moss = Color(0xFF526932)       // 상태 라벨(읽는 중)
    val Lime = Color(0xFFD5F477)       // 주 버튼 글자, 선택된 탭
    val Sage = Color(0xFFE9EFDD)       // 통계 카드
    val Stone = Color(0xFFDEE2D5)      // 테두리
    val Chip = Color(0xFFEAECE0)       // 보조 버튼
    val Cover = Color(0xFF2C463A)      // 기본 표지
    val Leaf = Color(0xFFBCD692)       // 진행 막대 배경 등
    val Error = Color(0xFFB3261E)
}

private val Colors = lightColorScheme(
    primary = Dok.Ink,
    onPrimary = Dok.Lime,
    secondary = Dok.Moss,
    onSecondary = Color.White,
    secondaryContainer = Dok.Lime,
    onSecondaryContainer = Dok.Ink,
    background = Dok.Paper,
    onBackground = Dok.Ink,
    surface = Dok.Paper,
    onSurface = Dok.Ink,
    surfaceVariant = Dok.Chip,
    onSurfaceVariant = Dok.Muted,
    surfaceContainer = Dok.Surface,
    surfaceContainerHigh = Dok.Surface,
    surfaceContainerLow = Dok.Surface,
    outline = Dok.Stone,
    outlineVariant = Dok.Stone,
    error = Dok.Error,
)

// Figma 텍스트 스타일(Noto Sans KR). 안드로이드 기본 한글 글꼴이 Noto Sans CJK 라 별도 폰트 없이 맞춘다.
private val Type = Typography(
    headlineSmall = TextStyle(fontSize = 21.sp, lineHeight = 27.sp, fontWeight = FontWeight.Bold),
    titleLarge = TextStyle(fontSize = 20.sp, lineHeight = 25.sp, fontWeight = FontWeight.Normal),
    titleMedium = TextStyle(fontSize = 18.sp, lineHeight = 23.sp, fontWeight = FontWeight.Medium),
    titleSmall = TextStyle(fontSize = 16.sp, lineHeight = 21.sp, fontWeight = FontWeight.Medium),
    bodyLarge = TextStyle(fontSize = 16.sp, lineHeight = 22.sp),
    bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 20.sp),
    bodySmall = TextStyle(fontSize = 13.sp, lineHeight = 17.sp),
    labelLarge = TextStyle(fontSize = 14.sp, lineHeight = 18.sp, fontWeight = FontWeight.Medium),
    labelMedium = TextStyle(fontSize = 12.sp, lineHeight = 15.sp, fontWeight = FontWeight.Medium),
    labelSmall = TextStyle(fontSize = 11.sp, lineHeight = 14.sp),
)

@Composable
fun DokpamineTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = Colors, typography = Type, content = content)
}
