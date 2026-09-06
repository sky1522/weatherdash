/** 지오메트리 보조. GeoJSON은 EPSG:4326. */

export type Position = [number, number];

/**
 * 경도 연속화.
 *
 * 🚨 북서태평양 태풍은 날짜변경선을 넘는다. 좌표가 `179.8 → -179.5`로 바뀌면
 *    LineString이 지도를 가로질러 그어진다. 화면상 명백히 이상하지만, 데이터는
 *    멀쩡해 보이므로 원인을 찾기 어렵다.
 *
 * 이전 점 대비 경도 차가 180을 넘으면 ±360을 더해 이어 붙인다.
 * 결과 경도는 [-180, 180]을 벗어날 수 있다. MapLibre는 이를 그대로 받아 연속으로 그린다.
 */
export function unwrapLongitudes(coords: readonly Position[]): Position[] {
  if (coords.length === 0) return [];

  const out: Position[] = [];
  let offset = 0;
  let previousRaw: number | null = null;

  for (const [lon, lat] of coords) {
    if (previousRaw !== null) {
      const delta = lon - previousRaw;
      if (delta > 180) offset -= 360;
      else if (delta < -180) offset += 360;
    }
    previousRaw = lon;
    out.push([lon + offset, lat]);
  }

  return out;
}
