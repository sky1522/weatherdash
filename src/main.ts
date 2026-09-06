import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import { createMap } from './map';

/**
 * P0 진입점. 베이스맵만 띄운다.
 * 태풍 레이어·데이터 조회는 P1 이후 범위이므로 여기서 호출하지 않는다.
 */

/**
 * 기본값은 Worker 의 타일 중계 경로다.
 * Protomaps 데모 버킷이 CORS 헤더를 주지 않아 브라우저가 직접 읽지 못한다.
 * 자체 호스팅 PMTiles 로 바꿀 때는 VITE_PMTILES_URL 에 절대 URL 을 넣는다.
 */
const PMTILES_URL = new URL(
  import.meta.env.VITE_PMTILES_URL ?? '/api/basemap',
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

map.on('load', () => {
  setStatus('P0 — 베이스맵만 표시. 태풍 레이어는 P2에서 추가한다.');
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
