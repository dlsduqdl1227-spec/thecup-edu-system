# 더컵에듀 시스템

더컵에듀의 재고, 수업별 사용량, 영수증, 월별 매출, 로스팅 프로파일을 한곳에서 관리하는 운영 웹앱입니다.

## 핵심 기능

- 이름 + 등록된 휴대폰 번호 로그인
- 관리자 / 정규직원 / 시간강사(남부) 구분과 직원별 메뉴 권한
- 생두, 로스팅(원두), 구스토 원두, 우유 재고를 작업별 탭으로 관리하고 g 단위 대용량은 kg으로 자동 표시
- 목록에 없는 품목을 LOT·가공 방식·소비기한·입고 수량과 함께 직접 등록
- 기존 더컵인벤토리 `entries` 기록을 품목·LOT별 현재 잔량과 재고 장부로 자동 연결
- 시간강사(남부)의 수업별 우유·원두 사용량 기록
- 우유 영수증 이미지 최적화 보관 및 구매 비용 자동 반영
- 2022–2026년 CSV 매출·순익 이관, 연도별 1–12월 상세 탭 및 월/분기/연도 그래프
- 매출·지출 장부와 월별 순익 실시간 합산, CSV 기준 금액과 추가 등록 내역 구분
- 투입부터 종료까지 시간순으로 입력하는 안정적인 로스팅 프로파일, 기존 프로파일 복사 작성, 디벨롭 비율 및 구간별 평균 ROR 자동 계산
- 로스팅 화면 첫 탭의 피커 매뉴얼: 주문 확인 → 14:00 전 로스팅 → 포장 → 발송 전달 순서와 원두별 프로파일 연결
- 자가품질검사(9개월)·위생교육(매년)·보건증(매년) 다음 예정일과 D-day 자동 계산, 검사·교육·보건증·로스팅·포장 자료 이미지 보관
- 상담 승인 회원용 커피 스테이션 예약 포털과 월별 캘린더, 관리자 승인형 예약 운영
- 관리자 월간 달력에서 여러 날짜·시간대·스테이션을 선택하는 예약 일정 일괄 생성
- 관리자 설정의 카카오톡 채널 링크로 공개 상담 버튼 즉시 연결
- 관리자와 공개 캘린더 30초 자동 동기화, 가장 가까운 운영 월 자동 선택
- 운영자·수강생·수업 예정자 진입 분리, 예정자용 공개 빈자리 조회와 수강생 ID 로그인
- 에스프레소·브루잉·로스팅 스테이션, 1회·월 이용권, 현장결제와 실습 기록·내부평가 관리
- 관리자 전용 직원 등록·권한 수정·비활성화·안전 삭제와 변경 감사 기록
- Pretendard 글꼴과 모바일 우선 반응형 화면

## 권한

- 관리자: 모든 메뉴와 직원 권한 관리
- 모든 직원: 우유 구매, 영수증, 수업별 우유·원두 사용량 기록
- 선택 권한: `매출`, `재고`, `로스팅`을 직원마다 각각 허용
- 로스팅 프로파일 작성·수정·삭제: 관리자만 가능
- 정기 의무 완료일 갱신과 매뉴얼 자료 등록·삭제: 관리자만 가능
- 피커 매뉴얼, 정기 일정, 자료 이미지 열람: 로스팅 권한이 있는 직원
- 상담·회원·스테이션·예약·이용권·결제·평가 운영: 관리자만 가능

선택하지 않은 메뉴는 화면에 표시되지 않으며, 직접 API를 호출해도 서버에서 차단됩니다.

## 데이터 보관

- 구조화 데이터와 로그인 세션: Cloudflare D1
- 최적화된 우유 영수증: Cloudflare D1에 약 350KB 이하로 압축 보관
- 검사·교육·보건증·로스팅·포장 자료 이미지: Cloudflare D1에 약 350KB 이하로 최적화해 최대 50개·총 20MB 보관
- 영수증 저장공간: 250MB 상한, 상한 도달 시 200MB까지 오래된 이미지부터 자동 정리
- 자동 정리 후에도 구매일·금액·수량·작성자와 매출 비용 반영 기록은 계속 보관
- 휴대폰 번호: 원문을 저장하지 않고 서버 비밀키가 적용된 해시와 끝 4자리만 저장
- CSV: 학생 이름과 연락처는 이관하지 않고 월별 총매출·순익·비개인 메모만 이관

## 환경 변수

`.env.example`을 참고해 로컬 환경에 아래 값을 설정합니다.

- `SESSION_SECRET`: 24자 이상의 무작위 세션/휴대폰 해시 비밀키
- `BOOTSTRAP_CODE`: 최초 관리자 1명 등록에만 사용하는 일회성 코드

운영 값은 소스나 `.openai/hosting.json`에 넣지 않고 호스팅 환경 변수로 설정합니다.

## 로컬 실행 및 검증

```bash
npm ci
npm run dev
npm run db:generate
npx tsc --noEmit
npm run lint
npm test
```

## 가장 쉬운 배포 방법

운영 Worker는 GitHub `main` 브랜치와 Cloudflare Workers Builds를 연결해 자동 배포합니다.

1. 검증된 소스를 GitHub `main`에 푸시합니다.
2. Cloudflare Worker의 `Settings` → `Builds`에서 아래 값을 사용합니다.
   - Build command: `npm run build`
   - Deploy command: `npm run deploy:cloudflare`
   - Root directory: `/`
   - Production branch: `main`
3. 루트의 `wrangler.jsonc`가 vinext의 `dist/server`와 `dist/client` 결과물을 배포합니다.
4. D1 `DB`와 정적 파일 `ASSETS` 바인딩이 연결된 뒤 운영 주소를 검증합니다.

직접 확인할 때는 아래 명령이 모두 성공해야 합니다.

```bash
npm ci
npx tsc --noEmit
npm run lint
npm test
```

`SESSION_SECRET`은 휴대폰 번호 해시와 로그인 세션에 사용되므로 운영 중 임의로 바꾸지 않습니다.
바꾸면 기존 직원의 휴대폰 해시와 더 이상 일치하지 않아 로그인이 불가능해질 수 있습니다.

## GitHub·Cloudflare 이름 변경 순서

기존 운영 주소를 먼저 지우거나 끄지 말고 아래 순서대로 진행합니다.

### 0. 변경 전 기록

1. Cloudflare의 기존 Worker 이름, D1 바인딩, 환경 변수 목록을 기록합니다.
2. `SESSION_SECRET` 값은 변경하지 않습니다.
3. 새 배포 확인이 끝날 때까지 기존 `thecup-inventory` 주소를 유지합니다.

### 1. GitHub에서 할 작업

1. 기존 저장소에서 `Settings` → `General`로 이동합니다.
2. `Repository name`을 `thecup-edu-system`으로 바꾸고 `Rename`을 누릅니다.
3. 로컬 폴더의 GitHub 원격 주소를 확인합니다.

```bash
git remote -v
```

4. `origin`이 이미 있다면 새 주소로 변경합니다.

```bash
git remote set-url origin https://github.com/계정명/thecup-edu-system.git
```

5. `origin`이 없다면 새로 연결합니다.

```bash
git remote add origin https://github.com/계정명/thecup-edu-system.git
```

6. 검증된 `main` 브랜치를 올리고 GitHub Actions가 있다면 성공 여부를 확인합니다.

```bash
git push -u origin main
```

GitHub는 이전 저장소 주소를 새 주소로 전달하지만, Cloudflare의 Git 연동과 로컬 원격 주소는 새 저장소 이름으로 다시 확인합니다.

### 2. Cloudflare에서 할 작업

`thecup-inventory.<계정>.workers.dev`와 이 저장소의 Sites 배포 주소는 서로 다른 서비스입니다.

1. Cloudflare `Workers & Pages`에서 기존 `thecup-inventory` Worker를 엽니다.
2. `Settings`에서 Worker 이름을 `thecup-edu-system`으로 변경합니다.
3. 연결된 저장소가 `dlsduqdl1227-spec/thecup-edu-system`, 운영 브랜치가 `main`인지 확인합니다.
4. Build command를 `npm run build`, Deploy command를 `npm run deploy:cloudflare`로 설정합니다.
5. 루트의 `wrangler.jsonc`에서 Worker 이름이 `thecup-edu-system`인지 확인합니다.
6. D1 바인딩은 `DB`, 정적 파일 바인딩은 `ASSETS`인지 확인합니다. R2는 사용하지 않습니다.
7. 런타임 Secret으로 `SESSION_SECRET`과 `BOOTSTRAP_CODE`를 등록한 뒤 새 버전을 배포합니다.
8. 새 주소에서 로그인, 직원별 권한, 매출, 재고, 영수증, 로스팅 화면을 차례로 확인합니다.
9. 기존 주소를 사용하던 직원이 있다면 이전 주소에서 새 주소로 전달하는 리디렉션을 별도로 유지합니다.

운영용 서비스는 `workers.dev`보다 소유한 맞춤 도메인 연결을 권장합니다. 새 주소 검증이 끝나기 전에는 기존 Worker나 D1 데이터를 삭제하지 않습니다.

## 최초 운영 시작

1. 배포된 주소에 접속합니다.
2. 배포 담당자가 전달한 초기 관리자 코드와 관리자 이름·휴대폰 번호를 입력합니다.
3. `직원 · 권한`에서 정규직원과 시간강사(남부)를 등록합니다.
4. `재고 관리`에서 현재 구스토 원두, 생두, 우유 수량을 실사 조정합니다.
5. 구스토 원두 소진 뒤 수업 사용 원두를 `로스팅(원두)`로 선택합니다.

초기 관리자 등록은 직원이 한 명이라도 생성된 이후 자동으로 닫힙니다.
