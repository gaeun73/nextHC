🌐 **배포 링크: https://gaeun73.github.io/nextHC/**

# 악플각도기 🔺

게임·커뮤니티에서 악플이나 욕설을 받은 피해자가 대화 내용을 붙여넣으면 **고소각(0~180°)** 을 판독하고, 증거 정리 방법과 **고소장 초안**을 만들어주는 해커톤용 MVP 웹 서비스입니다.

- 빌드 과정 없는 정적 웹 (HTML / CSS / JS)
- 대화 내용·닉네임은 서버로 전송·저장되지 않습니다 (기본: 브라우저 안 규칙 기반 판독)
- Supabase 연동: 판례는 `precedents` 테이블에서 읽고, 판독이 끝나면 익명 통계(각도·레벨·죄목·Q1~Q4 선택값)만 `judgments` 테이블에 저장합니다. 테이블 생성 SQL은 `supabase/schema.sql`, 공개용 publishable 키만 사용합니다.
- 같은 입력이면 항상 같은 결과가 나오는 결정적 분석

## 파일 구성

| 파일 | 역할 |
|---|---|
| `index.html` | 화면 |
| `style.css` | 사이버펑크 다크 테마 |
| `app.js` | 로직 (`analyze(input)` 규칙 기반 판독, 렌더링) |
| `data.js` | 표현 사전 · 팩트폭격 문구 · 고소장 템플릿 (교체용 데이터) |

## 실행 방법

`index.html`을 더블클릭해 브라우저로 열면 됩니다 (`file://` 에서도 동작).
화면의 **[예시 불러오기] → [판독하기]** 로 바로 시연할 수 있어요.

## 데이터 교체

`data.js`의 `dict`(표현 사전), `summaries`(총평), `elements`(요건 근거), `complaintTemplate`(고소장)만 수정하면 됩니다.

## 외부 API 연결 (선택)

`app.js` 상단의 `CONFIG.API_URL`에 주소를 넣으면 입력 JSON을 POST로 보내고, 실패하거나 10초 넘게 응답이 없으면 자동으로 규칙 기반 판독으로 전환합니다. 응답 형식:

```json
{
  "score": 147, "level": "danger", "summary": "...", "highlights": ["..."],
  "elements": { "공연성": {"status": "ok|warn|no", "reason": "..."}, "특정성": {}, "모욕성": {} },
  "crimes": ["모욕죄"], "warnings": ["..."], "evidence_checklist": ["..."], "complaint_draft": "..."
}
```

## GitHub Pages 배포

1. 이 폴더를 GitHub 저장소에 push 합니다.
2. 저장소 **Settings → Pages** 에서 Source를 `Deploy from a branch`, Branch를 `main` / `(root)` 로 선택하고 Save.
3. 잠시 후 `https://<계정>.github.io/<저장소>/` 에서 접속할 수 있습니다.

## ⚠️ 면책 문구

본 서비스는 AI·규칙 기반으로 작성된 참고용 판독 결과이며 **법률 자문이 아닙니다.** 실제 고소 가능성과 결과는 사건의 구체적 사정에 따라 달라지므로, 제출 전 반드시 전문가(변호사·경찰)와 확인하세요.
