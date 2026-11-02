# 감상과 문장

- S-50: `/book/[id]/review`에서 책별 감상·문장을 최신 작성 순으로 읽는다.
- S-51: `/book/[id]/review/write`에서 한줄평·독후감과 공개 범위를 저장한다. 기본값은 비공개다.
- S-52: `/book/[id]/review/quote`에서 문장과 선택 쪽수·메모를 저장한다.
- D-03: 입력 변경 후 닫기·Android 뒤로 가기 시 확인한다. Expo Router의 `usePreventRemove`를 사용한다.

입력 검증은 `src/domain/reviewRules.ts`의 Zod 스키마가 담당한다. 한줄평 100자,
독후감 5,000자, 문장 1,000자, 선택 메모 500자까지 허용한다.
쪽수는 빈 값이면 null, 값이 있으면 0 이상의 안전한 정수다.

모든 저장은 공통 기록 저장소를 이용하며 서버를 직접 호출하지 않는다.
저장소가 UUID와 `syncPending`·버전을 관리하고 화면은 변경을 구독한다.
새 UUID는 작성 화면에서 한 번 생성해 저장 재시도에도 유지한다.
저장 실패 시 입력을 유지하고, 저장 성공 후 기존 목록으로 돌아간다.

경계값 테스트는 `src/domain/__tests__/reviewRules.test.ts`, 실제 SQLite를 사용하는
라우트 통합 테스트는 `src/reviews/__tests__/reviews.test.tsx`에 있다.
