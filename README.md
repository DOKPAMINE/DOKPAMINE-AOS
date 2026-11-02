# DOKPAMINE-AOS

독파민 Android 앱의 React Native + Expo(TypeScript) 뼈대입니다. Expo Router 하단 탭은 **책장 / 캘린더 / 홈 / 라운지 / 마이** 순서이며 처음에는 가운데 홈이 선택됩니다.

현재 v0.2.0에는 Figma v1.0 테마, Noto Sans KR, 공통 컴포넌트, 5개 자리표시 화면과 테스트·CI가 들어 있습니다. 로그인·바코드·타이머·DB·서버 연결은 4단계에서 구현합니다. Android에서 검증하며 iOS 빌드는 하지 않습니다.

## 실행

Node.js LTS와 npm을 설치한 뒤 실행합니다.

```bash
npm ci
npx expo start
```

Android의 Expo Go로 QR 코드를 스캔합니다. PC와 휴대전화를 같은 네트워크에 연결하고 프로젝트의 Expo SDK 58을 지원하는 Expo Go를 사용해 주세요. SDK가 맞지 않으면 호환 Expo Go 또는 Development Build가 필요합니다. Android 에뮬레이터에서는 개발 서버의 `a` 키 또는 `npm run android`를 사용합니다. 현재 뼈대 실행에는 백엔드와 비밀값이 필요하지 않습니다.

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
