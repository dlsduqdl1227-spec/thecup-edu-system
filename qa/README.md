# 배포 전 검수

변경·삭제 테스트는 운영 DB와 연결하지 않는 로컬 전용 환경에서 수행합니다. `qa/vite.config.mjs`의 테스트 비밀키와 초기 관리자 코드는 운영에서 사용하지 않습니다. DB는 메모리에 있으며 서버를 재시작하면 초기화됩니다.

## 재현

Node 22.13 이상과 의존성 설치 후 실행합니다.

```sh
npx vite --config qa/vite.config.mjs
```

별도 터미널에서 Playwright와 Chrome 실행 경로를 `QA_PLAYWRIGHT`, `QA_BROWSER`로 지정할 수 있습니다. Playwright가 패키지로 설치돼 있으면 첫 변수는 생략합니다.

```sh
node qa/browser-audit.mjs
node qa/release-check.mjs
node qa/management-check.mjs
node qa/live-smoke.mjs
npx tsc --noEmit
npx eslint app lib worker qa tests
npm test
```

- `browser-audit`: 주요 화면과 반응형 상태 18개
- `release-check`: 로그인, 상담 승인, 예약·취소·월 전환, 선택형 입력, 영수증 등 12개 흐름
- `management-check`: 재고, 다운로드, 프로파일, 모집 공개·삭제, 강사 권한 등 6개 흐름
- `live-smoke`: 운영 공개 화면·API·휴강 시간·카카오톡·외부 출처 iframe 검증. 쓰기 요청은 하지 않습니다.
- `tests/booking-integrity.test.mjs`: 실제 API 코드를 격리 SQLite에서 실행하여 예약 중복·시간 겹침·승인·결제·회원 회수·삭제를 검증합니다.

스크린샷과 상세 결과는 Git에서 제외된 `outputs/qa`에 생성됩니다. 브라우저 검수 파일의 운영 주소를 로컬 변경 테스트에 사용하지 마세요.

## 배포 주의

운영 배포는 루트 `wrangler.jsonc`를 사용합니다. `qa/vite.config.mjs`는 배포용이 아닙니다. 운영 DB 바인딩과 `SESSION_SECRET`을 유지하며, 이번 검수 수정에는 스키마 마이그레이션이 없습니다.

현재 테스트는 Chromium 기반입니다. iOS Safari·Android 실기기의 카메라/앨범 선택 UI, HEIC 변환과 대규모 동시 접속은 별도 확인이 필요합니다. Creatorlink 테스트는 해당 출처를 로컬에서 재현해 실제 운영 iframe을 여는 방식이며 외부 홈페이지 자체를 수정하지 않습니다.
