# DOKPAMINE-AOS: 에이전트 작업 규칙

독파민 Android 앱이다(iOS는 만들지 않는다). 서버는 `DOKPAMINE-BE`이고, API 계약은 `DOKPAMINE-BE/docs/API.md`가 기준이다.
요구사항 ID(FR-xx, NFR-xx, UC-xx)는 팀의 요구사항 분석서를, 화면 ID(H01, S01, A03, T04 …)는 Figma "독파민 · 75 화면"의 프레임 이름을 따른다.

**브랜치, 커밋, Issue, PR 규칙은 `CONTRIBUTING.md`를 따른다.** 특히 커밋은 Conventional Commits 형식(`feat(timer): …`)에 `Refs #이슈번호`를 붙이고, 커밋 하나에는 논리적으로 하나의 변경만 담는다. 리뷰 워커는 리뷰에서 고친 내용을 별도 커밋으로 남긴다.

## 스택
- Kotlin 2.3 · AGP 9.5(내장 Kotlin, `kotlin-android` 플러그인 없음) · Gradle 9.8 · compileSdk 37 / targetSdk 36 / minSdk 26
- Jetpack Compose + Material 3, Navigation Compose(type-safe `@Serializable` 라우트)
- Room(KSP), DataStore, WorkManager: **오프라인 우선**
- Retrofit 3 + OkHttp 5 + kotlinx.serialization
- CameraX + ML Kit 바코드(EAN-13), Coil 3(표지)
- DI: Hilt 없이 수동 DI(`AppContainer`) + `appViewModel { container -> … }`
- 의존성 버전은 `gradle/libs.versions.toml` 한 곳에서만 관리한다.

## 명령
```bash
./gradlew :app:assembleDebug        # APK 빌드
./gradlew :app:testDebugUnitTest    # 단위 테스트 (도메인 규칙)
./gradlew :app:installDebug         # 연결된 기기·에뮬레이터에 설치
```
에뮬레이터는 `http://10.0.2.2:8080/`(PC의 BE)에 붙는다. 실기기는 `-Pdokpamine.apiBaseUrl=http://<PC IP>:8080/`로 바꾸고, 같은 IP를 `res/xml/network_security_config.xml`에도 추가한다.

## 구조
```
app/src/main/java/com/dokpamine/app/
  AppContainer.kt          수동 DI. 새 의존성은 여기서 만든다
  data/local/              Room 엔티티·DAO (syncPending, localVersion, deleted tombstone)
  data/remote/             Retrofit API + DTO(ApiModels.kt). BE docs/API.md 와 1:1
  data/sync/               SyncScheduler(WorkManager) · SyncService(push/snapshot) · SyncWorker
  data/RecordRepository    모든 개인 기록 쓰기의 단일 진입점 (로컬 저장 → 동기화 예약)
  data/TimerManager        독서 타이머(시각 기반, DataStore 저장, 알림)
  domain/ReadingRules.kt   페이지 검증·통계·연속일 등 순수 규칙 (단위 테스트 대상)
  ui/<feature>/            화면 + ViewModel (home, shelf, book, timer, notes, calendar, lounge, my, auth)
  ui/components/           공통 컴포넌트 (DokScreen, PrimaryButton, BookCard …)
  ui/theme/Theme.kt        Figma 색상 토큰(Dok.*)
  ui/Routes.kt             라우트 정의 (화면 ID 주석)
```

## 반드시 지킬 규칙
1. **오프라인 우선.** 개인 기록(책, 세션, 감상, 문장)은 `RecordRepository`를 통해 Room에 먼저 저장하고 `sync.request()`로 동기화를 예약한다. 화면에서 API로 직접 쓰지 않는다. 서버가 필요한 기능(ISBN 조회, 피드, 좋아요, 랭킹)은 `Connectivity.isOnline()`을 먼저 확인하고, 오프라인이면 즉시 `OFFLINE_MESSAGE`를 보여 준다(NFR-06).
2. **ID는 클라이언트 UUID다.** 세션 ID는 타이머 시작 때 만든 값을 저장까지 그대로 쓴다. 그래야 중복 저장이 생기지 않는다.
3. **타이머 시간은 시각으로 계산한다.** 화면 카운터로 누적하지 않는다. `TimerState`의 JSON은 null을 생략하지 않는 설정으로 저장한다. 일시정지 상태가 `runningSinceMs = null`로 표현되기 때문이다.
4. **API를 바꿀 때는** BE `docs/API.md`와 `data/remote/ApiModels.kt`를 함께 맞춘다. 필드를 추가할 때는 기본값을 두어 구버전 서버와도 호환되게 한다.
5. **Room 스키마를 바꿀 때는** `AppDatabase.version`을 올리고 Migration을 추가한다. `app/schemas/`의 JSON도 커밋한다.
6. **UI는 Figma 토큰을 쓴다.** 색은 `Dok.*`, 컴포넌트는 `ui/components`에서 가져온다. 하드코딩 색상은 쓰지 않는다. 문구는 한국어 존댓말이다.
7. **접근성:** 터치 영역은 44dp 이상으로 하고, 상태를 색만으로 구분하지 않는다(텍스트나 ✓를 함께 쓴다).
8. 권한은 필요한 순간에 처음 한 번만 요청한다. 카메라는 바코드 스캔 진입 시, 알림은 첫 독서 시작 시다. 거절해도 대체 경로가 동작해야 한다(NFR-07, NFR-08).
9. 새 규칙이나 계산은 `domain/`에 순수 함수로 두고 `src/test`에 분석서의 Given/When/Then을 그대로 옮긴 테스트를 추가한다.

## 이번 학기 범위 밖 (구현하지 않음)
캐릭터 성장, 독서 지도, AI 추천, 댓글·대댓글, 신고·차단, 칭호, 책 사진 직접 촬영(표지는 API 또는 기본 표지)
