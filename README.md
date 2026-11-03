# DOKPAMINE-AOS

독파민 Android 앱입니다. React Native + Expo(TypeScript)로 만들었습니다. Expo Router 하단 탭은 **책장 / 캘린더 / 홈 / 라운지 / 마이** 순서이며 처음에는 가운데 홈이 선택됩니다.

PRD v1.0의 화면(계정, 책 등록, 홈, 책장, 독서 타이머·기록, 감상, 캘린더·통계, 라운지, 랭킹, 마이·설정)과 기기 DB·서버 동기화가 들어 있습니다. 주 대상은 Android이며, iPhone은 Expo Go로 실행해 확인합니다(정식 iOS 빌드는 하지 않습니다).

색상은 Figma `독파민 / 색상 v1.0 (브라운 밝은안)`의 11개 역할 토큰을 사용합니다. `src/theme/tokens.ts`의 `colors.brand`·`surface`·`line`·`text`·`state`로 관리하며, 진행 막대는 빈 부분과 채운 부분에 서로 다른 글자색을 적용해 페이지 문구의 대비를 유지합니다.

## 실행

Node.js LTS와 npm을 설치한 뒤 실행합니다.

앱은 서버(`DOKPAMINE-BE`, `./gradlew bootRun`)가 켜져 있어야 로그인·동기화가 됩니다. `EXPO_PUBLIC_API_BASE_URL`에 휴대전화에서 접속할 수 있는 PC 주소를 넣습니다(`ipconfig`의 Wi-Fi IPv4 주소, Android 에뮬레이터는 `http://10.0.2.2:8080`).

```powershell
npm ci
$env:EXPO_PUBLIC_API_BASE_URL="http://<PC IP>:8080"; npx expo start
```

PC와 휴대전화를 같은 네트워크에 연결하고 프로젝트의 Expo SDK 58을 지원하는 Expo Go를 사용해 주세요. 처음 서버를 켤 때 Windows 방화벽 창이 뜨면 허용합니다.

- **Android:** Expo Go의 "Scan QR code"로 QR 코드를 스캔합니다. 에뮬레이터에서는 개발 서버의 `a` 키 또는 `npm run android`를 사용합니다.
- **iPhone:** 기본 카메라 앱으로 QR 코드를 찍고 알림을 눌러 Expo Go로 엽니다. "로컬 네트워크" 권한을 허용해야 PC에 접속합니다. Mac이나 Apple 개발자 계정은 필요 없습니다.

SDK가 맞지 않으면 호환 Expo Go 또는 Development Build가 필요합니다.

## 검증

```bash
npm run typecheck
npm run lint
npm test -- --ci
npx expo-doctor
npx expo export --platform android --output-dir dist
```

`.github/workflows/ci.yml`의 `CI / app` 잡이 main 대상 PR과 main push마다 `npm ci`, 타입 검사, 린트, 테스트를 실행합니다. `dist/`는 검증용 번들이며 커밋하지 않습니다.

## Kotlin 코드 보존

이전 Kotlin/Jetpack Compose v0.1.0 앱은 **`legacy/kotlin` 브랜치**와 **`v0.1.0` 태그**에 보존되어 있습니다. 기존 화면 흐름·오프라인 동기화·시각 기반 타이머의 참고 구현입니다.

## 문서

- [에이전트 작업 규칙과 폴더 구조](AGENTS.md)
- [협업 컨벤션](CONTRIBUTING.md)
- 제품·화면 ID: `DOKPAMINE-DOCS/PRD.md` v1.0(S-xx)
- 기술 결정: `DOKPAMINE-DOCS/decisions/0001-app-stack-react-native-expo.md`
- 오프라인 규칙: `DOKPAMINE-DOCS/decisions/0003-offline-first-sync.md`
- API 계약: `DOKPAMINE-BE/docs/API.md`
