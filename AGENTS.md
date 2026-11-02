# DOKPAMINE-AOS: 에이전트 작업 규칙

독파민 Android 앱이다. React Native + Expo(TypeScript)로 개발하며 Android에서 검증한다. iOS는 구현·빌드·검증하지 않는다.
제품 범위와 화면 ID는 `DOKPAMINE-DOCS/PRD.md` v1.0의 **S-xx**를 따른다. 요구사항 ID는 FR-xx, NFR-xx, UC-xx를 사용한다.
서버는 `DOKPAMINE-BE`이며 **API 계약은 `DOKPAMINE-BE/docs/API.md`가 기준**이다.

브랜치·커밋·Issue·PR 규칙은 `CONTRIBUTING.md`를 따른다. Conventional Commits 형식과 한국어 요약 50자 이내, `Refs #이슈번호` 꼬리말을 사용하고 논리 단위로 커밋한다. 리뷰 워커의 수정은 별도 커밋으로 남긴다. `CONTRIBUTING.md`는 세 저장소 공용 사본이므로 단독으로 변경하지 않는다.

## 스택
- Expo SDK 58, React Native 0.88, React 19, TypeScript strict
- Expo Router: 파일 기반 라우트와 하단 탭
- Noto Sans KR: `@expo-google-fonts/noto-sans-kr` + `expo-font`, 로딩 전 스플래시 유지
- `@expo/vector-icons`, `react-native-safe-area-context`
- Jest + `jest-expo` + React Native Testing Library, ESLint flat config(`eslint-config-expo`)
- npm만 사용하고 `package.json`·`package-lock.json`을 함께 커밋한다. Expo 의존성은 `npx expo install`로 SDK 호환 버전을 설치한다.
- ADR-0001의 TanStack Query, expo-sqlite + Drizzle, Zustand, React Hook Form + Zod, `@react-native-community/netinfo`, `expo-secure-store`, `expo-camera`, `expo-notifications` 의존성은 도입되었다. 실제 기능은 이후 Issue에서 구현한다.

## 명령
```bash
npm ci
npx expo start                 # Expo Go로 Android에서 개발
npm run android               # 연결된 Android 기기·에뮬레이터 열기
npm run typecheck
npm run lint
npm test -- --ci
npx expo-doctor
npx expo export --platform android --output-dir dist
```
Expo Go는 설치된 앱과 SDK가 호환되어야 한다. 버전이 맞지 않으면 호환 Expo Go 또는 Development Build를 사용한다. `dist/` 등 생성물과 비밀값은 커밋하지 않는다.
`drizzle-kit generate` 뒤에는 `npx expo start --clear`, Jest는 `npx jest --clearCache`를 실행한다.
Babel의 `api.cache(true)`와 `inline-import`는 `.sql` 변경으로 캐시를 무효화하지 않으므로 캐시를 직접 초기화해야 한다.

## 구조
```text
app/                          Expo Router 라우트만 둔다(테스트는 밖에 둔다)
  _layout.tsx                 폰트·스플래시·테마·루트 스택
  (tabs)/_layout.tsx           책장 / 캘린더 / 홈(가운데·초기) / 라운지 / 마이
  (tabs)/shelf.tsx             S-30 책장
  (tabs)/calendar.tsx          S-60 독서 캘린더
  (tabs)/index.tsx             S-10 홈
  (tabs)/lounge.tsx            S-70 라운지
  (tabs)/my.tsx                S-80 마이
src/theme/                    Figma v1.0 색상·글꼴·간격·반경·터치 크기, 내비게이션 테마
src/components/               Screen, PrimaryButton, SecondaryButton, Card, ProgressBar, StateView
src/domain/                   플랫폼·IO에 의존하지 않는 순수 규칙과 __tests__
__tests__/                    라우트 통합 테스트
babel.config.js / metro.config.js: Drizzle .sql 인라인
.github/workflows/ci.yml       PR(main 대상)·main push 시 타입 검사·린트·테스트
```
`src/api/`·`src/db/`·`src/sync/`는 이후 Issue에서 구현한다. 라우트마다 PRD 화면 ID를 주석으로 남긴다.

## 반드시 지킬 규칙
1. **오프라인 우선(NFR-04~06).** 개인 기록(책, 세션, 감상, 문장)은 공통 기록 저장소를 통해 기기 DB에 먼저 저장하고 동기화를 예약한다. 화면에서 서버로 직접 쓰지 않는다. 4단계 도입 시 `syncPending`, `localVersion`, `deleted` tombstone을 유지하고 책 → 세션 → 감상 → 문장 순서로 전송한다. 전송 중 수정된 기록의 대기를 해제하지 않고 401이면 기록을 보존한다. 서버가 필요한 ISBN 조회·책별 공개 감상 검색·좋아요·랭킹은 연결 상태를 먼저 확인하며 오프라인이면 요청하지 않고 1초 안에 `StateView`의 오프라인 안내를 보여 준다(ADR-0003).
2. **ID는 클라이언트 UUID다.** 세션 ID는 타이머 시작 시 만든 값을 저장·재전송까지 그대로 사용해 중복 저장을 막는다.
3. **타이머는 시각 기반이다.** 시작 시각·누적 시간·일시정지 상태를 저장하고 화면 카운터로 시간을 누적하지 않는다. 일시정지의 `runningSinceMs: null`을 직렬화에서 생략하지 않는다.
4. **API 계약을 함께 맞춘다.** 계약 변경 시 BE `docs/API.md`와 이후 도입할 TypeScript API 타입을 함께 검토·갱신한다. 다른 저장소 변경은 별도 Issue·PR로 조율한다. 새 필드는 기본값·선택 값으로 구버전 서버와 호환되게 한다.
5. **DB 스키마 변경에는 마이그레이션을 추가한다.** 4단계에서 expo-sqlite + Drizzle을 도입할 때 스키마와 마이그레이션을 함께 관리하고 기존 개인 기록을 보존한다.
6. **UI는 토큰만 쓴다.** 색상·글자·간격·반경은 `src/theme/`, 공통 UI는 `src/components/`에서 가져온다. 색상은 Figma v1.0 `독파민 / 색상 v1.0 (브라운 밝은안)`의 11개 역할 토큰(`colors.brand`, `colors.surface`, `colors.line`, `colors.text`, `colors.state`)을 쓴다. 화면·컴포넌트에 hex 색상을 하드코딩하지 않는다. 기본 문구는 한국어 존댓말이다. PRD D6에 따라 진행 막대 안에는 `84 / 240쪽`을 표시하고 퍼센트를 표시하지 않는다.
7. **접근성.** 모든 터치 영역은 최소 44dp이며 `accessibilityRole`·`accessibilityLabel`을 지정한다. 상태와 선택은 색뿐 아니라 텍스트·아이콘 형태·굵기 등으로 구분하고 선택·비활성 상태도 보조 기술에 전달한다.
8. **권한은 필요한 순간에 처음 한 번만 요청한다.** 카메라는 바코드 스캔 진입 시, 알림은 첫 독서 시작 시 요청한다. 거절해도 직접 입력·앱 안 안내 등 대체 경로가 동작해야 한다(NFR-07, NFR-08).
9. **새 규칙·계산은 `src/domain/` 순수 함수로 둔다.** PRD·분석서의 Given/When/Then과 경계값을 Jest 테스트로 옮기며 테스트 이름에 요구사항·화면 ID와 한국어 문장을 쓴다.
10. 이번 단계는 앱 뼈대다. 로그인·바코드·타이머·로컬 DB·서버 통신 등 실제 기능은 4단계 Issue에서 구현한다.

## 이번 학기 범위 밖(구현하지 않음)
캐릭터 성장, 독서 지도, AI 추천, 댓글·대댓글, 신고·차단, 공유 카드·완독 카드, 칭호, 회차, 보관 위치, 별도 소장본, 책 사진 직접 촬영(표지는 API 또는 기본 표지), 제목·저자 외부 검색, 가로 화면, 푸시 알림(타이머 진행 알림만 제공).

Kotlin 참고 구현은 `legacy/kotlin` 브랜치와 `v0.1.0` 태그에 보존되어 있다.
