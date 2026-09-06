# typhoon-map

기상청 API 허브의 태풍 정보를 MapLibre GL JS 지도 위에 재현하는 뷰어.
분석경로 · 예측경로 · 70% 확률반경(예보원) · 강풍/폭풍반경을 시간축과 함께 표시한다.

## 무엇을 만드는가

기상청 「태풍정보 상세정보」 화면이 기준 레퍼런스다. 그 화면이 보여주는 것을 같은 데이터로 다시 그리되,
불확실성을 숨기지 않는 방향으로 표현을 조정한다.

- 과거 분석 위치(실선 + 강도별 심볼)와 예측 위치(점선)를 시각적으로 분리
- 예보 시각별 70% 확률반경 원과 그 포락선(예보원 콘)
- 강풍반경(15 m/s) · 폭풍반경(25 m/s) — 예외방향/예외반경이 있는 비대칭 원
- 발표 시각 타임라인, 발표번호(seq) 간 경로 비교
- 우측 정보 패널: 중심위치 / 중심기압 / 최대풍속 / 강도 / 진행방향 / 이동속도

## 데이터 출처

| 용도 | 엔드포인트 | 비고 |
|---|---|---|
| 연도별 태풍 목록 | `typ01/url/typ_lst.php` | 태풍번호, 이름, 발생·소멸시각, 한반도영향 |
| 태풍 상세 + 예측 | `typ01/url/typ_data.php` | 발표번호(seq) 지정 조회 |
| 시점 기준 조회 | `typ01/url/typ_now.php` | 기준시각 과거 12시간 내 발표분 |
| 영향 태풍 통계 | `typ02/openApi/SfcYearlyInfoService/getTyphoonList` | XML/JSON, 과거 연도용 |

`typ01`은 **진행 중인 태풍만** 제공한다. 종료된 태풍 재생은 베스트트랙 또는 `typ02`를 써야 한다.

## 기술 구성

- 프론트: Vite + TypeScript + MapLibre GL JS
- 프록시: Cloudflare Workers (`authKey` 서버 보관, 응답 정규화 + 캐시)
- 타일: PMTiles 베이스맵
- 타이포: JetBrains Mono(수치) / IBM Plex Sans KR(본문)

인증키는 절대 브라우저 번들에 들어가지 않는다. 프론트는 Worker의 정규화된 JSON만 소비한다.

## 빠른 시작

```bash
pnpm install
cp .dev.vars.example .dev.vars   # KMA_AUTH_KEY 입력
pnpm dev:worker                  # 프록시 :8787
pnpm dev                         # 프론트 :5173
```

## 문서

- `ROADMAP.md` — 단계별 구현 계획과 완료 기준
- `PROGRESS.md` — 현재 상태, 결정 기록, 미해결 질문
- `CLAUDE.md` — Claude Code 작업 규약
- `.claude/skills/` — API 파싱 · 기하 계산 · 렌더링 규약

## 면책

기상청 발표 자료를 재가공한 비공식 뷰어다. 방재 의사결정에는 기상청 공식 발표를 사용할 것.
