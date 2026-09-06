import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import { createMap } from './map';

/**
 * P0 진입점. 베이스맵만 띄운다.
 * 태풍 레이어·데이터 조회는 P1 이후 범위이므로 여기서 호출하지 않는다.
 */

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
const status = document.getElementById('status');

function setStatus(text: string, state: 'ok' | 'error' = 'ok'): void {
  if (!status) return;
  status.textContent = text;
  status.dataset['state'] = state;
}

if (!container) {
  throw new Error('#map 컨테이너를 찾을 수 없다.');
}

const map = createMap(container, PMTILES_URL);

/**
 * 렌더 결과를 화면에 그대로 보고한다.
 * 🚨 타일이 정상으로 와도 스타일 색 대비가 무너지면 "지도가 안 나온다"로 보인다.
 *    데이터가 왔는지와 보이는지를 구분하지 못하면 엉뚱한 곳을 고치게 된다.
 */
map.on('idle', () => {
  const counted = ['earth', 'water', 'coastline', 'place-labels']
    .filter((id) => map.getLayer(id))
    .map((id) => `${id} ${map.queryRenderedFeatures({ layers: [id] }).length}`)
    .join(' · ');
  const c = map.getCenter();
  setStatus(
    `P0 — 베이스맵만 표시. 태풍 레이어는 P2에서 추가한다.
` +
      `z${map.getZoom().toFixed(1)} ${c.lng.toFixed(1)}E ${c.lat.toFixed(1)}N · ${counted}`,
  );
});

// 🚨 타일 로드 실패를 조용히 넘기지 않는다. 빈 지도와 장애를 구분해서 보여준다.
map.on('error', (event) => {
  const reason = event.error instanceof Error ? event.error.message : '알 수 없는 오류';
  // 🚨 타일 로드 실패를 조용히 넘기지 않는다. 빈 지도와 장애를 구분해서 보여준다.
  //    가장 흔한 원인은 타일 중계 Worker 가 떠 있지 않은 경우다.
  setStatus(
    `베이스맵 로드 실패: ${reason} · 타일 출처 ${PMTILES_URL} · pnpm dev:worker 가 떠 있는지 확인`,
    'error',
  );
});
