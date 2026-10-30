package com.dokpamine.app.ui.auth

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dokpamine.app.data.AccountRepository
import com.dokpamine.app.data.remote.userMessage
import com.dokpamine.app.ui.appViewModel
import com.dokpamine.app.ui.components.DokScreen
import com.dokpamine.app.ui.components.LabeledField
import com.dokpamine.app.ui.components.PrimaryButton
import com.dokpamine.app.ui.components.StatRow
import com.dokpamine.app.ui.theme.Dok
import kotlinx.coroutines.launch

class AuthViewModel(private val accounts: AccountRepository) : ViewModel() {
    var signupMode by mutableStateOf(false)
    var email by mutableStateOf("")
    var password by mutableStateOf("")
    var nickname by mutableStateOf("")
    var loading by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)
        private set

    fun submit() {
        error = when {
            !email.contains("@") -> "이메일을 확인해 주세요."
            password.length < 8 -> "비밀번호는 8자 이상이에요."
            signupMode && nickname.isBlank() -> "닉네임을 입력해 주세요."
            else -> null
        }
        if (error != null) return
        loading = true
        viewModelScope.launch {
            runCatching {
                if (signupMode) accounts.signup(email, password, nickname) else accounts.login(email, password)
            }.onFailure { error = it.userMessage() }
            loading = false
        }
    }
}

/** O01 · 독파민 — 시작 화면 겸 로그인/회원가입(FR-10). */
@Composable
fun AuthScreen() {
    val vm = appViewModel { AuthViewModel(it.accounts) }
    DokScreen(title = "독파민", subtitle = "책과 조금 더 가까워진 하루") {
        StatRow("바코드" to "찍으면 책 등록", "타이머" to "실제로 읽은 시간")
        Spacer(Modifier.height(8.dp))
        Text(if (vm.signupMode) "처음 오셨군요" else "다시 만나서 반가워요", style = MaterialTheme.typography.titleMedium)
        LabeledField("이메일", vm.email, { vm.email = it }, placeholder = "reader@dokpamine.com")
        LabeledField("비밀번호", vm.password, { vm.password = it }, placeholder = "8자 이상", password = true)
        if (vm.signupMode) LabeledField("닉네임", vm.nickname, { vm.nickname = it }, maxLength = 30, placeholder = "라운지에 보이는 이름")
        vm.error?.let { Text(it, color = Dok.Error, style = MaterialTheme.typography.bodySmall) }
        PrimaryButton(if (vm.signupMode) "가입하고 시작하기" else "로그인", onClick = vm::submit, loading = vm.loading)
        TextButton(onClick = { vm.signupMode = !vm.signupMode }) {
            Text(if (vm.signupMode) "이미 계정이 있어요" else "처음이에요 · 회원가입", color = Dok.Moss)
        }
    }
}
