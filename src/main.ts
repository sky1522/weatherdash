import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import { createMap } from './map';

/**
 * P0 진입점. 베이스맵만 띄운다.
 * 태풍 레이어·데이터 조회는 P1 이후 범위이므로 여기서 호출하지 않는다.
 */

const PMTILES_URL =
  import.meta.env.VITE_PMTILES_URL ?? 'https://demo-bucket.protomaps.com/v4.pmtiles';

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
  setStatus(`베이스맵 로드 실패: ${reason}`, 'error');
});
