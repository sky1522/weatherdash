import type { StyleSpecification } from 'maplibre-gl';

/**
 * PMTiles 단일 파일 베이스맵의 최소 무채색 스타일.
 *
 * P0 범위는 "북서태평양 영역이 뜨는 것"까지다. 태풍 레이어는 여기에 넣지 않는다.
 * 레이어 id `place-labels`는 P2에서 태풍 면 레이어를 `beforeId`로 끼워 넣을 기준점이다.
 * (SKILL.md 3부 — 베이스맵 라벨 아래에 면 레이어를 삽입한다)
 */
export function basemapStyle(pmtilesUrl: string): StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
    sources: {
      basemap: {
        type: 'vector',
        url: `pmtiles://${pmtilesUrl}`,
        attribution:
          '<a href="https://protomaps.com">Protomaps</a> · <a href="https://openstreetmap.org">OpenStreetMap</a>',
      },
    },
    layers: [
      // 바다. 배경색과 같은 값을 쓰면 화면 전체가 한 덩어리로 보인다.
      // 초기 뷰는 대부분이 바다라 여기서 대비가 무너지면 지도가 안 보인다.
      { id: 'background', type: 'background', paint: { 'background-color': '#0a1119' } },
      {
        id: 'earth',
        type: 'fill',
        source: 'basemap',
        'source-layer': 'earth',
        paint: { 'fill-color': '#243444' },
      },
      {
        id: 'landuse',
        type: 'fill',
        source: 'basemap',
        'source-layer': 'landuse',
        minzoom: 4,
        paint: { 'fill-color': '#2b3d4e' },
      },
      {
        id: 'water',
        type: 'fill',
        source: 'basemap',
        'source-layer': 'water',
        paint: { 'fill-color': '#0a1119' },
      },
      // 해안선. 면 대비만으로는 저줌에서 윤곽이 흐려진다.
      {
        id: 'coastline',
        type: 'line',
        source: 'basemap',
        'source-layer': 'earth',
        paint: { 'line-color': '#3d5670', 'line-width': 0.8 },
      },
      {
        id: 'roads',
        type: 'line',
        source: 'basemap',
        'source-layer': 'roads',
        minzoom: 6,
        paint: { 'line-color': '#33455a', 'line-width': 0.6 },
      },
      {
        id: 'boundaries',
        type: 'line',
        source: 'basemap',
        'source-layer': 'boundaries',
        paint: { 'line-color': '#5a7590', 'line-width': 0.8, 'line-dasharray': [2, 2] },
      },
      {
        id: 'place-labels',
        type: 'symbol',
        source: 'basemap',
        'source-layer': 'places',
        layout: {
          'text-field': ['coalesce', ['get', 'name:ko'], ['get', 'name']],
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
        },
        paint: {
          'text-color': '#93a8bc',
          'text-halo-color': '#0a1119',
          'text-halo-width': 1.4,
        },
      },
    ],
  };
}
