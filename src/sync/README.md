# 개인 기록 동기화 (NFR-04~06)

`initializeDatabase()`가 마이그레이션을 완료한 뒤 런타임 구독을 연결합니다.
화면은 `repository.books/sessions/reviews/quotes.save()` 또는 `softDelete()`로 먼저 로컬에 저장합니다.
저장 이벤트, 앱 활성화, 네트워크 연결 복구가 전송을 예약합니다.

인증 기능은 토큰을 저장한 뒤 `await syncAfterLogin()`을 호출합니다.
복원은 책 → 세션 → 감상 → 문장 순서의 단일 DB 트랜잭션이며, 로컬 수정 대기와 tombstone을 덮어쓰지 않습니다.
오프라인 로그인 복원은 다음 연결 이벤트까지 대기합니다.
명시적 로그아웃에서는 토큰을 삭제하기 전에 `stopRecordSync()`를 호출합니다.
앱에서 다시 로그인하면 `syncAfterLogin()`이 구독을 다시 연결합니다.

`getSyncState()`와 `subscribeSyncState()`로 상태를 구독할 수 있습니다.
`reauthentication-required`는 재로그인 안내에 사용하고 토큰이나 기기 기록을 삭제하지 않습니다.
전송은 책 → 세션 → 감상 → 문장 순서이며 `BOOK_NOT_SYNCED`는 부모 책을 다시 올린 뒤 한 번 재시도합니다.
409가 반복되거나 다른 요청이 실패하면 해당 기록은 다음 이벤트에서 다시 시도합니다.
성공 응답은 전송한 `localVersion`과 일치하는 행에만 적용합니다.

동기화 API 계약은 `DOKPAMINE-BE/docs/API.md`이며, 공개 클라이언트 타입에 아직 없는 문장·snapshot 계약은 `serialization.ts`에 정의합니다.
로컬 숫자 시각은 HTTP 경계에서 ISO-8601 UTC 문자열로 변환하고, 로컬 동기화 메타데이터는 전송하지 않습니다.
snapshot은 서버가 돌려준 기록을 병합하며 응답에 없는 기기 기록을 지우지 않습니다.
