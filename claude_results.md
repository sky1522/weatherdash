# claude_results — P0 스캐폴딩 및 응답 실측

작성: 2026-09-06 · 커밋 `0e5ab0c` · 브랜치 `main` (direct-main)

## 상태 요약

| 항목 | 상태 |
|---|---|
| Vite + TS + MapLibre + PMTiles 베이스맵 | ✅ 완료 |
| Worker 프록시 골격 (`/api/typhoon/*`) | ✅ 완료 |
| `.dev.vars.example` + 시크릿 바인딩 | ✅ 완료 |
| `pnpm dev` / `pnpm dev:worker` 기동 | ✅ 확인 |
| 픽스처 바이트 무결성 방어 (`.gitattributes` + 검사 테스트) | ✅ 완료 |
| 원격 CI + Pages 배포 복구 | ✅ 완료 |
| 픽스처 수집 → `fixtures/raw/` | ⏸ **대기** — `KMA_AUTH_KEY` 미확보 |
| 6개 항목 판정 | ⏸ **대기** — 픽스처 없이는 판정 불가 |

**P0 DoD는 아직 미충족이다.** 인증키가 들어오는 즉시 `pnpm fixtures` 한 번으로 나머지가 끝난다.

## 지금 필요한 것 — 인증키 하나

`C:\dev\weatherdash\.dev.vars` 가 세 번 확인했는데도 생성되지 않았다.
저장소 루트, `C:\dev`, 문서, 바탕화면, 다운로드, 사용자 폴더까지 훑었고
`.dev.vars.example` 만 나온다. 환경변수와 wrangler 설정에도 키가 없다.

이 PC의 다른 프로젝트(`C:\dev\wavyon`, `C:\dev\expanded-radar`)가 이미 같은
기상청 API 허브를 쓰고 있다. `C:\dev\wavyon\.env` 에 키가 있을 가능성이 높다.
다른 프로젝트의 시크릿을 읽는 것은 권한 정책에 막혀 시도하지 않았다. 판단은 사용자 몫이다.

키를 화면에 띄우지 않고 옮기는 방법:

```powershell
$k = ((Get-Content C:\dev\wavyon\.env | Where-Object { $_ -match 'KMA' }) -split '=',2)[1].Trim()
Set-Content C:\dev\weatherdash\.dev.vars "KMA_AUTH_KEY=$k" -Encoding utf8
Test-Path C:\dev\weatherdash\.dev.vars
```

직접 입력해도 된다.

```powershell
Set-Content C:\dev\weatherdash\.dev.vars 'KMA_AUTH_KEY=<키>' -Encoding utf8
```

`.dev.vars` 는 `.gitignore` 대상이라 커밋되지 않는다.

## 한 일

### 1. 스캐폴딩

Vite 6 + TypeScript strict + MapLibre GL JS 5 + pmtiles 4.
`src/basemap-style.ts`에 Protomaps v4 스키마 기준 무채색 스타일을 직접 작성했다.
테마 패키지를 따로 넣지 않아 런타임 의존성은 `maplibre-gl`, `pmtiles` 둘뿐이다.

초기 뷰는 북서태평양(`center [138, 22]`, `zoom 3`). `maxBounds` 동쪽 끝을 경도 200까지
열어 두었다. 날짜변경선을 넘는 경로가 P2에서 잘리지 않게 하기 위한 것이다.

베이스맵 URL은 `VITE_PMTILES_URL`로 교체 가능하고, 기본값은 Protomaps 공개 데모 타일이다.
운영에서는 자체 호스팅 PMTiles로 바꿔야 한다.

레이어 id `place-labels`를 남겨 두었다. P2에서 태풍 면 레이어를 `beforeId`로 이 아래에
끼워 넣는 기준점이다.

태풍 레이어는 만들지 않았다. P0 범위가 아니다.

### 2. Worker 프록시 골격

라우트 세 개를 업스트림 경로에 표로 매핑했다. 표에 없는 경로는 프록시하지 않는다.

| 라우트 | 업스트림 | 허용 파라미터 |
|---|---|---|
| `/api/typhoon/list` | `typ01/url/typ_lst.php` | `YY, disp, help, mode` |
| `/api/typhoon/data` | `typ01/url/typ_data.php` | `YY, typ, seq, mode, disp, help` |
| `/api/typhoon/now` | `typ01/url/typ_now.php` | `tm, mode, disp, help` |

파라미터를 화이트리스트로 막았다. 막지 않으면 클라이언트가 `authKey`를 직접 실어 보내
서버 시크릿을 덮어쓸 수 있다.

응답은 정규화하지 않고 바이트 그대로 통과시킨다. `Content-Type`도 손대지 않는다.
업스트림 헤더의 charset이 실제 본문 인코딩과 맞는지 아직 모르기 때문이다.
헤더를 신뢰해 디코딩하는 코드를 지금 넣으면 판정 1번을 코드에 미리 박아 넣는 셈이 된다.

### 3. 인증키 유출 방어

`worker/secret.ts`의 `redact()`가 시크릿의 원문, URL 인코딩본, 디코딩본을 모두 지운다.
시크릿 값을 모르는 상황에서도 `authKey=...` 파라미터 패턴 자체를 무조건 마스킹한다.

가장 위험한 경로는 `fetch` 예외다. 예외 메시지에 요청 URL 전체가 실리는데 거기에
`authKey`가 들어 있다. 이 경로를 유닛 테스트로 잠갔다.

`no-console` lint 규칙으로 워커에서 로그 자체를 막았다.

키 미설정은 `auth_key_unset` 오류로 명시 반환한다. 빈 응답으로 삼키지 않는다.
확인한 실제 응답:

```
GET /api/typhoon/list?YY=2026&disp=1&help=2
HTTP 500
{"status":"error","code":"auth_key_unset","message":"KMA_AUTH_KEY 시크릿이 설정되지 않았다."}
```

### 4. 픽스처 수집 스크립트

`scripts/fetch-fixtures.mjs` (`pnpm fixtures`). 아직 실행하지 못했다.

- 응답을 `Buffer`로 받아 인코딩 변환 없이 그대로 쓴다. 판정 1번이 여기에 달려 있다.
- 발표번호를 먼저 1회 조회해 확정한 뒤, 이후 수집은 `seq`를 명시해서 돈다.
  인자 생략은 비결정적이라 픽스처로 남기면 재현이 안 된다.
- 3 엔드포인트 × `disp` 2종 × `help` 3종 = 18건.
- 판정 3번용으로 2건을 더 받는다. 존재하지 않는 태풍번호(`typ=99`) 조회와,
  태풍이 있을 수 없는 과거 시각(`tm=190001010000`) 조회다.
- 저장 직전에 응답 본문에 인증키가 에코됐는지 검사한다. 걸리면 저장을 중단한다.
- `manifest.json`에 HTTP 상태, `Content-Type`, 바이트 수, SHA-256을 남긴다.
  요청 파라미터는 기록하되 `authKey`는 제외한다.

### 5. 파일 이동

기존 수원 기상 콘솔 페이지를 `legacy/console.html`로 옮겼다. 루트 `index.html`은
Vite 엔트리로 새로 썼다.

`SKILL.md`가 저장소 루트에 있었다. `CLAUDE.md`가 가리키는 `.claude/skills/typhoon-map/`으로
옮겼다. 내용은 바꾸지 않았다. `CLAUDE.md`의 스킬 목록은 세 개를 나열했지만 실제로는
병합된 단일 파일 하나였다. 파일 스스로 한 파일로 유지한다고 밝히므로 병합본을 그대로 두고
`CLAUDE.md` 쪽 목록만 실제와 맞췄다.

## 사전 확인 사항 (판정 아님)

잘못된 키로 호출했을 때 게이트웨이가 돌려준 응답의 바이트다.

```
7b0a 2020 2272 6573 756c 7422 203a 207b   {.  "result" : {
...  "message" : "  ec9c a0ed 9aa8 ed95 9c ...
```

`ec9c a0` = `유`, `ed9a a8` = `효`. UTF-8 3바이트 시퀀스다.

**이것은 판정 1번의 근거가 아니다.** 인증 실패 시 API 게이트웨이가 만드는 JSON 오류
응답이지, `typ01` 데이터 엔드포인트가 내보내는 본문이 아니다. 두 경로의 인코딩이
같다는 보장이 없다. 판정 1번은 실제 픽스처로 다시 한다.

## 판정 결과

여섯 항목 모두 **판정 불가**다. 근거로 쓸 픽스처가 아직 없다.
추측으로 채우지 않는다. `PROGRESS.md`의 🔶는 하나도 ✅로 바꾸지 않았다.

| # | 항목 | 상태 |
|---|---|---|
| 1 | 응답 인코딩 (UTF-8 / EUC-KR) | 판정 불가 — 픽스처 필요 |
| 2 | 결측 표기 (빈칸 / `-9` / `-999` / `-`) | 판정 불가 — 픽스처 필요 |
| 3 | 진행 중 태풍 부재 시 응답 형태 | 판정 불가 — 픽스처 필요 |
| 4 | `ER25R` 필드명 실재 여부 | 판정 불가 — `help=1/2` 헤더 필요 |
| 5 | `RAD15`/`RAD25` ↔ 강풍/폭풍반경 대응 | 판정 불가 — `help=1/2` 헤더 필요 |
| 6 | 발표 시각 KST / UTC | 판정 불가 — 실제 `TYP_TM` 값 필요 |

## 검증 게이트

```
lint       ✅
typecheck  ✅
test:unit  ✅  9 passed / 3 skipped (픽스처 미수집분)
build      ✅  6.6s  (VITE_BASE=/weatherdash/ 검증 포함)
commit     ✅  fef17c5, 0e5ab0c  (파일 개별 add, git add -A 미사용)
push       ✅  origin/main
remote CI  ✅  success
```

`build`에서 청크 1.08 MB 경고가 난다. MapLibre 본체 크기다. 코드 스플리팅은
요청 범위 밖이라 손대지 않았다.

## 추가로 해결한 문제

### 픽스처 바이트가 조용히 깨질 뻔했다

이 저장소는 `core.autocrlf=true` 인데 `.gitattributes` 가 없었다. 이 상태로
`fixtures/raw/*.txt` 를 커밋하면 git이 텍스트로 판단해 커밋 시 CRLF→LF,
체크아웃 시 LF→CRLF 로 바꾼다. 원문 바이트를 그대로 남기라는 P0 요구가
파일을 쓰는 순간이 아니라 **커밋하는 순간** 깨진다.

인코딩 판정과 결측 표기 판정이 전부 이 바이트 위에서 이뤄지므로, 눈치채지 못한 채
잘못된 판정을 내리고 그 위에 P1 파서를 올리게 된다. 전형적인 조용한 실패다.

`.gitattributes` 로 `fixtures/raw/** -text -diff` 를 걸어 변환을 금지했고,
`git check-attr` 로 `text: unset` 을 확인했다. 여기에 더해
`tests/fixtures.test.ts` 가 매니페스트의 sha256·바이트 수와 실제 파일을 대조한다.
수집 전에는 skip 하고, 수집 후에 활성화된다.

### GitHub Pages 복구

루트 `index.html` 을 Vite 엔트리로 교체하면서 기존 Pages 배포가 깨졌다.
Pages 가 저장소 루트를 그대로 서빙하는 설정이었는데, 새 엔트리는 저장소에 없는
`/src/main.ts` 를 부른다.

`.github/workflows/ci.yml` 을 추가해 빌드 산출물을 배포하도록 바꿨다.
같은 워크플로가 `lint → typecheck → test:unit → build` 게이트를 원격에서 돌린다.
CLAUDE.md 게이트의 마지막 항목인 "remote CI" 가 이걸로 채워진다.
Pages 하위 경로(`/weatherdash/`)용 에셋 경로는 `VITE_BASE` 로 주입한다.

확인 결과:

```
Actions run   completed / success
https://sky1522.github.io/weatherdash/                    HTTP 200
https://sky1522.github.io/weatherdash/assets/index-*.js   HTTP 200
```

## 짚어둘 것

**Node 20에서 최신 wrangler가 돌지 않는다.** wrangler 4.100 이상이 Node 22를 요구한다.
설치된 런타임이 20.19.6이라 Node 20 지원 마지막 계열인 `~4.86.0`으로 고정했다.
Node 22로 올리면 핀을 풀 수 있다.

**PMTiles 베이스맵이 Protomaps 공개 데모 타일이다.** 운영 트래픽을 여기에 얹으면 안 된다.
자체 호스팅 전환은 별도 작업으로 잡아야 한다.

## 다음

키가 들어오면 아래는 한 번에 끝난다. 다른 대기 항목은 없다.

1. `.dev.vars` 에 `KMA_AUTH_KEY` 입력
2. `pnpm fixtures` — 20건 수집
3. 픽스처 바이트로 6개 항목 판정, `PROGRESS.md` 갱신 (해소된 것만 ✅)
4. 게이트 재통과, 커밋, 푸시
