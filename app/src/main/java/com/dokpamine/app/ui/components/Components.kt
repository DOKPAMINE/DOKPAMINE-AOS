package com.dokpamine.app.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.dokpamine.app.data.local.BookEntity
import com.dokpamine.app.data.local.BookStatus
import com.dokpamine.app.ui.theme.Dok

val CardShape = RoundedCornerShape(18.dp)
val ButtonShape = RoundedCornerShape(14.dp)

/** 상단 제목 + 뒤로가기 + 스크롤되는 본문. Figma 의 하위 화면 공통 레이아웃. */
@Composable
fun DokScreen(
    title: String,
    onBack: (() -> Unit)? = null,
    subtitle: String? = null,
    scrollable: Boolean = true,
    actions: @Composable RowScope.() -> Unit = {},
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(Modifier.fillMaxSize().background(Dok.Paper).statusBarsPadding()) {
        Row(
            Modifier.fillMaxWidth().padding(start = if (onBack != null) 4.dp else 24.dp, end = 12.dp, top = 20.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (onBack != null) {
                IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "뒤로") }
            }
            Text(title, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.weight(1f))
            actions()
        }
        if (subtitle != null) {
            Text(
                subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = Dok.Muted,
                modifier = Modifier.padding(horizontal = 24.dp, vertical = 4.dp),
            )
        }
        val body = Modifier.fillMaxWidth().padding(horizontal = 24.dp).padding(top = 12.dp, bottom = 24.dp)
        Column(
            if (scrollable) Modifier.weight(1f).verticalScroll(rememberScrollState()).then(body) else Modifier.weight(1f).then(body),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            content = content,
        )
    }
}

@Composable
fun PrimaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, loading: Boolean = false) {
    Button(
        onClick = onClick,
        enabled = enabled && !loading,
        shape = ButtonShape,
        colors = ButtonDefaults.buttonColors(containerColor = Dok.Ink, contentColor = Dok.Lime),
        contentPadding = PaddingValues(horizontal = 18.dp),
        modifier = modifier.fillMaxWidth().heightIn(min = 52.dp),
    ) {
        if (loading) {
            CircularProgressIndicator(Modifier.size(18.dp), color = Dok.Lime, strokeWidth = 2.dp)
        } else {
            Text(text, style = MaterialTheme.typography.labelLarge, modifier = Modifier.weight(1f))
        }
    }
}

@Composable
fun SecondaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    Button(
        onClick = onClick,
        enabled = enabled,
        shape = ButtonShape,
        colors = ButtonDefaults.buttonColors(containerColor = Dok.Chip, contentColor = Dok.Ink),
        modifier = modifier.heightIn(min = 52.dp),
    ) { Text(text, style = MaterialTheme.typography.labelMedium, textAlign = TextAlign.Center) }
}

@Composable
fun OutlineButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, color: Color = Dok.Ink) {
    Surface(
        onClick = onClick,
        shape = ButtonShape,
        color = Dok.Surface,
        border = BorderStroke(1.dp, Dok.Stone),
        modifier = modifier.fillMaxWidth().heightIn(min = 52.dp),
    ) {
        Box(Modifier.padding(horizontal = 18.dp), contentAlignment = Alignment.CenterStart) {
            Text(text, style = MaterialTheme.typography.labelLarge, color = color)
        }
    }
}

@Composable
fun DokCard(modifier: Modifier = Modifier, onClick: (() -> Unit)? = null, content: @Composable ColumnScope.() -> Unit) {
    val inner = @Composable { Column(Modifier.padding(16.dp), content = content) }
    if (onClick != null) {
        Surface(onClick = onClick, shape = CardShape, color = Dok.Surface, border = BorderStroke(1.dp, Dok.Stone), modifier = modifier.fillMaxWidth()) { inner() }
    } else {
        Surface(shape = CardShape, color = Dok.Surface, border = BorderStroke(1.dp, Dok.Stone), modifier = modifier.fillMaxWidth()) { inner() }
    }
}

@Composable
fun StatTile(value: String, label: String, modifier: Modifier = Modifier) {
    Surface(shape = RoundedCornerShape(14.dp), color = Dok.Sage, modifier = modifier) {
        Column(Modifier.padding(horizontal = 14.dp, vertical = 12.dp)) {
            Text(value, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(label, style = MaterialTheme.typography.labelSmall, color = Dok.Muted)
        }
    }
}

@Composable
fun StatRow(vararg tiles: Pair<String, String>) {
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        tiles.forEach { (value, label) -> StatTile(value, label, Modifier.weight(1f)) }
    }
}

@Composable
fun BookCover(book: BookEntity?, width: Dp = 56.dp) {
    val height = width * 1.3f
    Box(
        Modifier.width(width).height(height).clip(RoundedCornerShape(4.dp)).background(Dok.Cover),
    ) {
        if (book?.coverUrl != null) {
            AsyncImage(model = book.coverUrl, contentDescription = "${book.title} 표지", contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        } else {
            Box(Modifier.width(width / 8).fillMaxHeight().background(Dok.Leaf))
            Column(Modifier.padding(start = width / 5, top = height / 5)) {
                Text("BOOK", color = Dok.Lime, fontSize = 8.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(4.dp))
                Text("독파민", color = Color.White, fontSize = 9.sp)
            }
        }
    }
}

fun BookStatus.label() = when (this) {
    BookStatus.WANT -> "읽고 싶음"
    BookStatus.READING -> "읽는 중"
    BookStatus.DONE -> "완독"
}

@Composable
fun BookCard(book: BookEntity, onClick: () -> Unit, trailing: String? = null) {
    DokCard(onClick = onClick) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            BookCover(book)
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(book.status.label(), style = MaterialTheme.typography.labelSmall, color = Dok.Moss)
                Spacer(Modifier.height(4.dp))
                Text(book.title, style = MaterialTheme.typography.titleSmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Spacer(Modifier.height(2.dp))
                Text(
                    trailing ?: "${book.author} · ${book.currentPage} / ${book.totalPages}쪽",
                    style = MaterialTheme.typography.labelSmall,
                    color = Dok.Muted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
fun ProgressBar(percent: Int) {
    LinearProgressIndicator(
        progress = { percent / 100f },
        color = Dok.Moss,
        trackColor = Dok.Stone,
        drawStopIndicator = {},
        gapSize = 0.dp,
        modifier = Modifier.fillMaxWidth().height(10.dp).clip(RoundedCornerShape(5.dp)),
    )
}

@Composable
fun LabeledField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String? = null,
    error: String? = null,
    number: Boolean = false,
    singleLine: Boolean = true,
    minLines: Int = 1,
    enabled: Boolean = true,
    maxLength: Int? = null,
    password: Boolean = false,
) {
    Column(modifier) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = Dok.Muted)
        Spacer(Modifier.height(6.dp))
        OutlinedTextField(
            value = value,
            onValueChange = { if (maxLength == null || it.length <= maxLength) onValueChange(it) },
            placeholder = placeholder?.let { { Text(it, color = Dok.Muted) } },
            isError = error != null,
            supportingText = when {
                error != null -> ({ Text(error) })
                maxLength != null && !singleLine -> ({ Text("${value.length} / $maxLength", modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.End) })
                else -> null
            },
            singleLine = singleLine,
            minLines = minLines,
            enabled = enabled,
            keyboardOptions = when {
                number -> KeyboardOptions(keyboardType = KeyboardType.Number)
                password -> KeyboardOptions(keyboardType = KeyboardType.Password)
                else -> KeyboardOptions.Default
            },
            visualTransformation = if (password) PasswordVisualTransformation() else VisualTransformation.None,
            shape = ButtonShape,
            colors = OutlinedTextFieldDefaults.colors(
                focusedContainerColor = Dok.Surface,
                unfocusedContainerColor = Dok.Surface,
                disabledContainerColor = Dok.Chip,
                unfocusedBorderColor = Dok.Stone,
                focusedBorderColor = Dok.Moss,
            ),
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

/** 칩 형태 선택지. 색만으로 구분하지 않도록 선택 시 ✓ 를 붙인다(PRD 7. 접근성). */
@Composable
fun ChoiceChip(text: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(12.dp),
        color = if (selected) Dok.Ink else Dok.Chip,
        contentColor = if (selected) Dok.Lime else Dok.Ink,
        modifier = modifier.heightIn(min = 44.dp),
    ) {
        Box(Modifier.padding(horizontal = 14.dp), contentAlignment = Alignment.Center) {
            Text(if (selected) "✓ $text" else text, style = MaterialTheme.typography.labelMedium)
        }
    }
}

@Composable
fun EmptyState(title: String, message: String, modifier: Modifier = Modifier) {
    DokCard(modifier) {
        Text(title, style = MaterialTheme.typography.titleSmall)
        Spacer(Modifier.height(6.dp))
        Text(message, style = MaterialTheme.typography.bodySmall, color = Dok.Muted)
    }
}

@Composable
fun SectionTitle(text: String, action: String? = null, onAction: () -> Unit = {}) {
    Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(text, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
        if (action != null) TextButton(onClick = onAction) { Text(action, color = Dok.Moss) }
    }
}

@Composable
fun InfoBanner(text: String, modifier: Modifier = Modifier, onClick: (() -> Unit)? = null) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = Dok.Lime,
        contentColor = Dok.Ink,
        modifier = modifier.fillMaxWidth().then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier),
    ) {
        Text(text, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp))
    }
}
