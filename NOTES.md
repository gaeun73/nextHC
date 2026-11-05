# 작업 노트 (다른 PC·새 세션에서 이어서 할 때 읽기)

마지막 업데이트: 2026-11-05

## 프로젝트
악플각도기 — 악플을 붙여넣으면 고소각(0~180°)을 판독하고 증거 체크리스트와 고소장 초안을 만들어주는 정적 웹 (HTML/CSS/JS, 빌드 없음).
해커톤 마감: 2026-11-05 기준 "오늘~내일". 작업자는 해커톤이 처음인 학생 → 한 단계씩 쉬운 말로 안내.

## 배포
- 사이트: https://gaeun73.github.io/nextHC/ (GitHub Pages, `main` 브랜치 root. push하면 1~2분 뒤 자동 반영)
- 저장소: https://github.com/gaeun73/nextHC (About Website, README 맨 위에 링크 있음)
- 강제 push 금지. 코드 변경 후 push는 사용자 확인 뒤에.

## Supabase
- 프로젝트 URL: https://rpwniabqaszrjllgjxiq.supabase.co
- 코드(`app.js`의 `CONFIG`)에는 **공개용 publishable 키만** 있음. DB 비밀번호·secret·service_role 키는 어디에도 넣지 말 것.
- 테이블
  - `precedents`: 판례. 누구나 읽기만 가능 (RLS)
  - `judgments`: 판독 결과의 **익명 통계만** (각도·레벨·죄목·Q1~Q4). insert만 가능, 읽기 불가. 대화 원문·닉네임은 저장하지 않음
  - 함수 `judgment_stats()`: 집계 숫자만 공개 → 화면의 통계 카드에서 사용
- SQL: `supabase/schema.sql`(테이블·RLS·판례 시드), `supabase/stats.sql`(집계 함수). Supabase 대시보드 → SQL Editor에서 실행.
- 발표 전 통계 초기화: SQL Editor에서 `delete from public.judgments;`

## 구현된 것
- Q1~Q4 입력 + 추가 상황(성적·협박·명예훼손) → 죄목별 각도·모욕죄 3요건 판단
- 사전(`data.js`의 `dict`) + 우회 표기 처리(`DATA.loose`: 글자 사이 공백/기호 허용)
- Supabase 연동: 판례 읽기, 익명 통계 저장, 통계 카드
- 상단 게이지 배너 이미지(`assets/akpeul_gauge.png`)와 공유 미리보기(og 메타 태그)

## 다음 할 일 후보
1. 발표·시연 준비: README에 시연 순서·기능 설명 정리
2. 정확도 추가 보강: 실제 입력해 볼 악플 문장으로 점검
3. 모바일 화면 점검
4. 발표 전 `judgments` 테스트 데이터 초기화

## 환경 메모
- 노트북(Windows)에는 node, gh, supabase CLI 없음. git만 사용. GitHub·Supabase 설정은 웹에서 직접.
- 로컬 확인: `index.html`을 브라우저로 열기 (F12 → Console에서 `Supabase: ...` 로그 확인)
