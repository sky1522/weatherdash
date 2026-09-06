import maplibregl from 'maplibre-gl';
import type { TyphoonSources } from './geojson';
import { EMPTY_SOURCES } from './geojson';

/**
 * 태풍 레이어 구성과 갱신.
 *
 * 🚨 레이어는 초기 1회만 만든다. 이후 갱신은 `getSource().setData()` 만 호출한다.
 *    시각이나 발표번호가 바뀔 때마다 removeLayer/addLayer 를 반복하면 깜빡임과
 *    메모리 누수가 생긴다.
 *
 * 🚨 분석과 예측은 최소 두 가지 수단으로 구분한다. 선의 실선/점선과 점의 채움/외곽선.
 *    구분이 없으면 사용자가 예측을 관측으로 읽는다.
 */

const SOURCE = {
  past: 'typhoon-track-past',
  forecast: 'typhoon-track-forecast',
  analysisPoints: 'typhoon-points',
  forecastPoints: 'typhoon-forecast-points',
  current: 'typhoon-current',
} as const;

export const LAYER = {
  past: 'typhoon-track-past-line',
  forecast: 'typhoon-track-forecast-line',
  analysisPoints: 'typhoon-points-circle',
  forecastPoints: 'typhoon-forecast-points-circle',
  current: 'typhoon-current-symbol',
  forecastLabels: 'typhoon-forecast-labels',
} as const;

/** 색은 데이터에만 쓴다. 강도는 색이 아니라 심볼 크기로 구분한다. */
const COLOR = {
  track: '#e8e8ec',
  current: '#ffffff',
  halo: '#070b10',
  label: '#c8d6e2',
} as const;

const EMPTY_FC = { type: 'FeatureCollection' as const, features: [] };

function addGeoJsonSource(map: maplibregl.Map, id: string): void {
  if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: EMPTY_FC });
}

/** 레이어를 한 번만 만든다. 이미 있으면 아무것도 하지 않는다. */
export function addTyphoonLayers(map: maplibregl.Map): void {
  for (const id of Object.values(SOURCE)) addGeoJsonSource(map, id);

  if (map.getLayer(LAYER.past)) return;

  // 아래에서 위로. 선 → 점 → 라벨.
  map.addLayer({
    id: LAYER.past,
    type: 'line',
    source: SOURCE.past,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': COLOR.track, 'line-width': 2 },
  });

  map.addLayer({
    id: LAYER.forecast,
    type: 'line',
    source: SOURCE.forecast,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    // 예측은 점선. 분석과 시각적으로 분리한다.
    paint: { 'line-color': COLOR.track, 'line-width': 2, 'line-dasharray': [2, 2] },
  });

  map.addLayer({
    id: LAYER.analysisPoints,
    type: 'circle',
    source: SOURCE.analysisPoints,
    paint: {
      // 강도별 심볼 크기. 색이 아니라 크기로 구분한다.
      'circle-radius': ['get', 'radius'],
      'circle-color': COLOR.track,
      'circle-stroke-color': COLOR.halo,
      'circle-stroke-width': 1,
    },
  });

  map.addLayer({
    id: LAYER.forecastPoints,
    type: 'circle',
    source: SOURCE.forecastPoints,
    paint: {
      'circle-radius': ['get', 'radius'],
      // 예측점은 외곽선만. 채우지 않는다.
      'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-color': COLOR.track,
      'circle-stroke-width': 1.5,
    },
  });

  map.addLayer({
    id: LAYER.current,
    type: 'circle',
    source: SOURCE.current,
    paint: {
      'circle-radius': ['+', ['get', 'radius'], 3],
      'circle-color': COLOR.current,
      'circle-stroke-color': COLOR.halo,
      'circle-stroke-width': 2,
    },
  });

  map.addLayer({
    id: LAYER.forecastLabels,
    type: 'symbol',
    source: SOURCE.forecastPoints,
    layout: {
      // 리드타임을 라벨로 남긴다. 예측을 관측으로 읽지 않게 하는 세 번째 수단이다.
      'text-field': ['get', 'lead'],
      'text-font': ['Noto Sans Regular'],
      'text-size': 11,
      'text-offset': [0, -1.4],
      'text-allow-overlap': true,
    },
    paint: {
      'text-color': COLOR.label,
      'text-halo-color': COLOR.halo,
      'text-halo-width': 1.4,
    },
  });
}

/** 🚨 갱신은 setData 만. 레이어를 다시 만들지 않는다. */
export function setTyphoonData(map: maplibregl.Map, sources: TyphoonSources): void {
  const set = (id: string, data: GeoJSON.GeoJSON): void => {
    const source = map.getSource(id);
    if (source instanceof maplibregl.GeoJSONSource) source.setData(data);
  };

  set(SOURCE.past, sources.past ?? EMPTY_FC);
  set(SOURCE.forecast, sources.forecast ?? EMPTY_FC);
  set(SOURCE.analysisPoints, sources.analysisPoints);
  set(SOURCE.forecastPoints, sources.forecastPoints);
  set(SOURCE.current, sources.current);
}

export function clearTyphoonData(map: maplibregl.Map): void {
  setTyphoonData(map, EMPTY_SOURCES);
}

/** 모든 태풍 지오메트리를 담는 경계. 지도를 그 범위로 맞출 때 쓴다. */
export function boundsOf(sources: TyphoonSources): maplibregl.LngLatBounds | null {
  const coords: [number, number][] = [];
  for (const line of [sources.past, sources.forecast]) {
    if (line) for (const c of line.geometry.coordinates) coords.push([c[0]!, c[1]!]);
  }
  if (coords.length === 0) return null;

  const bounds = new maplibregl.LngLatBounds(coords[0]!, coords[0]!);
  for (const c of coords) bounds.extend(c);
  return bounds;
}

/** 클릭하면 그 시각의 발표값을 보여준다. 보간값은 쓰지 않는다. */
export function attachPopups(map: maplibregl.Map): void {
  const layers = [LAYER.analysisPoints, LAYER.forecastPoints, LAYER.current];

  for (const layer of layers) {
    map.on('click', layer, (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      const p = feature.properties as Record<string, string>;

      const rows: [string, string][] = [
        ['시각', `${p['timeFull']} (${p['timeUtc']})`],
        ['구분', p['kind'] === 'forecast' ? `예측 ${p['lead']}` : '분석'],
        ['중심위치', p['position'] ?? '-'],
        ['중심기압', p['pressure'] ?? '-'],
        ['최대풍속', p['wind'] ?? '-'],
        ['강풍반경', p['rad15'] ?? '-'],
        ['폭풍반경', p['rad25'] ?? '-'],
        ['강도', p['strength'] ?? '-'],
        ['진행', p['heading'] ?? '-'],
      ];

      const html =
        `<div class="popup"><h3>${escapeHtml(p['loc'] ?? '')}</h3><dl>` +
        rows
          .map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v ?? '-')}</dd>`)
          .join('') +
        `</dl></div>`;

      new maplibregl.Popup({ closeButton: true, maxWidth: '320px' })
        .setLngLat(event.lngLat)
        .setHTML(html)
        .addTo(map);
    });

    map.on('mouseenter', layer, () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', layer, () => {
      map.getCanvas().style.cursor = '';
    });
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
