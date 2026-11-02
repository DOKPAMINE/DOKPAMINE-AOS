# API 호출 기반 (Issue #15)

계약은 `DOKPAMINE-BE/docs/API.md`를 따른다. 랭킹과 동기화 엔진은 포함하지 않는다.

- 실행 환경에 `EXPO_PUBLIC_API_BASE_URL`을 설정한다. Android 에뮬레이터의 로컬 BE는 `http://10.0.2.2:8080`이다. 주소 미설정 시 `ApiError.kind = configuration`으로 실패한다. 이 환경 변수는 공개 번들에 들어가므로 비밀값을 넣지 않는다.
- `signup`/`login`만 인증 헤더를 생략한다. 반환된 토큰의 저장은 호출자가 `tokenStorage.save()`로 명시적으로 수행한다. 실제 토큰은 `expo-secure-store`에만 보관한다.
- **401에서도 토큰을 지우지 않는다.** `ApiError.kind = unauthorized`와 HTTP `status`, 서버 `code`/한국어 `message`를 그대로 전달한다. 호출자는 재로그인을 안내한다. 명시적 로그아웃만 `tokenStorage.remove()`를 호출한다. 이후 동기화 엔진도 401에서 개인 기록과 전송 대기를 보존해야 한다(ADR-0003).
- 모든 요청 전에 NetInfo로 연결을 확인한다. 연결 끊김, 인터넷 도달 불가, 연결 여부 미확인, 상태 조회 실패/500ms 초과면 fetch와 토큰 조회 없이 `offline` 안내 오류를 반환한다(NFR-06). 연결되어 있고 인터넷 도달 여부만 아직 null이면 요청을 허용한다.
- 연결 확인 후 요청 제한 시간은 기본 10초이며 SecureStore 조회와 응답 본문 읽기를 포함한다. 시간이 지나면 fetch를 중단하고 `timeout` 오류를 반환한다. 연결 확인 중 소비한 시간은 최대 500ms다.
- HTTP 오류 응답의 `{code, message}`를 보존한다. 비 JSON 오류는 상태별 기본 안내, 전송 실패는 `network`, 성공 응답 JSON 파싱 실패는 `invalid-response`로 구분한다.
- `putBook`/`putSession`/`putReview`는 이후 동기화 계층의 전송 수단이다. 화면은 공통 기록 저장소를 통해 기기 DB에 먼저 저장해야 한다. 기존 UUID, `deleted` tombstone과 null을 그대로 전송한다. 로컬 전용 `syncPending`, `localVersion`은 DTO에 포함하지 않는다.
- 루트 레이아웃은 `queryClient.ts`의 단일 QueryClient를 사용하고 NetInfo → onlineManager, AppState → focusManager를 연결·해제한다. 초기 연결 확인 전과 오프라인에는 Query가 대기하고, 연결 복구 후 재개한다. 화면은 대기 상태에도 오프라인 안내를 표시해야 한다. 명령형 엔드포인트 호출은 즉시 `offline` 오류를 받는다. 자동 재시도는 꺼 두어 401과 사용자 오류를 반복하지 않는다. 테스트는 종료 시 `queryClient.clear()`로 캐시·대기 요청을 정리한다.
