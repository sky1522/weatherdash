import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import { createMap } from './map';
import { currentUtcStamp, fetchTyphoonData, fetchTyphoonList, fetchTyphoonNow } from './api';
import { addTyphoonLayers, attachPopups, boundsOf, setTyphoonData } from './typhoon/layers';
import { buildTyphoonSources } from './typhoon/geojson';
import { renderPanel, type PanelState } from './panel';
import { latestAnalysis } from '../lib/parse';
import type { TyphoonListEntry, TyphoonSeries } from '../lib/types';

/**
 * 기본값은 저장소에 함께 두는 북서태평양 추출본이다. 같은 출처에서 서빙되므로
 * CORS 문제가 없고, 로컬과 배포가 같은 방식으로 동작한다.
 *
 * BASE_URL 을 앞에 붙여야 한다. GitHub Pages 는 /weatherdash/ 하위에 서빙된다.
 * 더 넓은 영역이나 높은 줌이 필요하면 VITE_PMTILES_URL 로 다른 소스를 지정한다.
 * Worker 의 /api/basemap 은 원본 행성 타일을 중계하는 우회로다.
 */
const PMTILES_URL = new URL(
  import.meta.env.VITE_PMTILES_URL ?? `${import.meta.env.BASE_URL}basemap-nwpacific.pmtiles`,
  window.location.href,
).href;

const container = document.getElementById('map');
const panel = document.getElementById('panel');
const status = document.getElementById('status');

if (!container || !panel) {
  throw new Error('#map 또는 #panel 컨테이너를 찾을 수 없다.');
}

function setStatus(text: string, state: 'ok' | 'error' = 'ok'): void {
  if (!status) return;
  status.textContent = text;
  status.dataset['state'] = state;
}

const map = createMap(container, PMTILES_URL);

map.on('load', () => {
  setStatus('베이스맵 준비 완료. 태풍 자료를 부르는 중…');
  addTyphoonLayers(map);
  attachPopups(map);
  void loadTyphoon();
});

// 🚨 타일 로드 실패를 조용히 넘기지 않는다. 빈 지도와 장애를 구분해서 보여준다.
map.on('error', (event) => {
  const reason = event.error instanceof Error ? event.error.message : '알 수 없는 오류';
  setStatus(`베이스맵 로드 실패: ${reason} · 타일 출처 ${PMTILES_URL}`, 'error');
});

function show(state: PanelState): void {
  renderPanel(panel!, state);
}

/**
 * 조회 흐름.
 *
 * 1. 목록으로 진행 중 태풍을 확정한다. 진행 여부는 `NOW=1`.
 * 2. 기준시각 조회로 최신 발표번호를 알아낸다. `typ_now`는 `seq` 없이 부를 수 있다.
 * 3. `YY`, `typ`, `seq`를 전부 명시해 상세를 다시 부른다.
 *
 * 🚨 3단계를 생략하고 2단계 결과를 그대로 쓰지 않는다. 인자를 생략한 조회는 시점에 따라
 *    응답이 달라져 재현이 안 되고, `typ_now`는 예측행의 `SEQ`를 0으로 준다.
 */
async function loadTyphoon(): Promise<void> {
  show({ kind: 'loading' });

  const year = new Date().getUTCFullYear();

  const list = await fetchTyphoonList(year);
  if (list.status === 'error') {
    setStatus(`태풍 목록 조회 실패: ${list.reason}`, 'error');
    show({ kind: 'error', reason: list.reason });
    return;
  }

  const ongoing: TyphoonListEntry | null =
    list.status === 'ok' ? (list.data.find((e) => e.now === 1) ?? null) : null;

  const now = await fetchTyphoonNow(currentUtcStamp());
  if (now.status === 'error') {
    setStatus(`태풍 상세 조회 실패: ${now.reason}`, 'error');
    show({ kind: 'error', reason: now.reason });
    return;
  }
  if (now.status === 'none' || now.data.length === 0) {
    setStatus('진행 중인 태풍이 없다.');
    show({ kind: 'none', year });
    return;
  }

  // 최신 발표번호는 마지막 분석점이 가지고 있다.
  const provisional = now.data[0]!;
  const seq = latestAnalysis(provisional)?.seq ?? null;

  let series: TyphoonSeries = provisional;
  if (seq !== null) {
    const detail = await fetchTyphoonData(provisional.yy, provisional.typ, seq);
    if (detail.status === 'error') {
      setStatus(`태풍 상세 조회 실패: ${detail.reason}`, 'error');
      show({ kind: 'error', reason: detail.reason });
      return;
    }
    if (detail.status === 'ok' && detail.data.length > 0) series = detail.data[0]!;
  }

  const sources = buildTyphoonSources(series);
  setTyphoonData(map, sources);
  show({ kind: 'ok', entry: ongoing, series });

  const bounds = boundsOf(sources);
  if (bounds) map.fitBounds(bounds, { padding: 80, maxZoom: 6, duration: 600 });

  const forecastCount = series.forecasts.at(-1)?.points.length ?? 0;
  setStatus(
    `분석 ${series.analysis.length}개 · 예측 ${forecastCount}개 · 발표번호 ${seq ?? '-'}\n` +
      '실선은 분석, 점선은 예보다. 점을 누르면 그 시각의 발표값이 나온다.',
  );
}
