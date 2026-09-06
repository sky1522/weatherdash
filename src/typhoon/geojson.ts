import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import type { TrackPoint, TyphoonSeries } from '../../lib/types';
import { latestAnalysis, latestForecast } from '../../lib/parse';
import { unwrapLongitudes, type Position } from '../../lib/geo';
import { classifyStrength, strengthLabel, strengthRadius } from '../../lib/strength';
import { compassToKorean, compassToDegrees } from '../../lib/compass';
import { formatKstShort, formatKstFull, formatUtc, formatLeadTime, parseKmaTime } from '../../lib/time';

/**
 * 도메인 객체 → GeoJSON.
 *
 * 🚨 여기서 만드는 좌표는 원본 발표값 그대로다. 보간하지 않는다.
 *    팝업과 패널은 이 소스만 참조한다. 보간값은 관측값도 예보값도 아니다.
 */

export interface TyphoonSources {
  past: Feature<LineString> | null;
  forecast: Feature<LineString> | null;
  analysisPoints: FeatureCollection<Point>;
  forecastPoints: FeatureCollection<Point>;
  current: FeatureCollection<Point>;
}

export const EMPTY_SOURCES: TyphoonSources = {
  past: null,
  forecast: null,
  analysisPoints: emptyCollection(),
  forecastPoints: emptyCollection(),
  current: emptyCollection(),
};

function emptyCollection(): FeatureCollection<Point> {
  return { type: 'FeatureCollection', features: [] };
}

function lineFeature(coords: Position[]): Feature<LineString> | null {
  // 점이 하나뿐이면 선이 되지 않는다. 빈 LineString을 만들면 MapLibre가 경고를 낸다.
  if (coords.length < 2) return null;
  return { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} };
}

/** 팝업과 정보 패널이 읽는 속성. 결측은 하이픈으로 표기한다. 0으로 채우지 않는다. */
function pointProperties(point: TrackPoint): Record<string, string | number | null> {
  const strength = classifyStrength(point.ws);
  const time = parseKmaTime(point.ftTm);

  return {
    kind: point.kind,
    seq: point.seq,
    lead: formatLeadTime(point.tmd),
    tmd: point.tmd,
    timeShort: time ? formatKstShort(time) : '-',
    timeFull: time ? formatKstFull(time) : '-',
    timeUtc: time ? formatUtc(time) : '-',
    position: `${point.lat.toFixed(1)}°N ${point.lon.toFixed(1)}°E`,
    pressure: point.ps === null ? '-' : `${point.ps} hPa`,
    wind: point.ws === null ? '-' : `${point.ws} m/s`,
    strength: strengthLabel(strength),
    radius: strengthRadius(strength),
    heading:
      point.dir === null
        ? '-'
        : `${compassToKorean(point.dir)} ${point.sp === null ? '' : `${point.sp} km/h`}`.trim(),
    headingDeg: point.dir === null ? null : compassToDegrees(point.dir),
    // 🚨 결측 반경을 0으로 채우지 않는다. 하이픈으로 표기하고 P3에서 레이어를 생략한다.
    rad15: formatRadius(point.rad15, point.ed15, point.er15),
    rad25: formatRadius(point.rad25, point.ed25, point.er25),
    loc: point.loc,
  };
}

function formatRadius(
  radius: number | null,
  exceptionDir: Parameters<typeof compassToKorean>[0] | null,
  exceptionRadius: number | null,
): string {
  if (radius === null) return '-';
  if (exceptionDir === null || exceptionRadius === null) return `${radius} km`;
  return `${radius} km [${compassToKorean(exceptionDir)} 약 ${exceptionRadius} km]`;
}

function pointFeature(point: TrackPoint, coord: Position): Feature<Point> {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: coord },
    properties: pointProperties(point),
  };
}

/**
 * 분석 경로와 최신 발표의 예측 경로를 만든다.
 *
 * 🚨 예측선은 마지막 분석점에서 분기시킨다. 그렇지 않으면 현재 위치와 예측 사이가 끊겨
 *    보인다. 다만 그 이음점은 선에만 쓰고, 점 소스에는 넣지 않는다. 중복 표시가 된다.
 *
 * 🚨 경도는 분석과 예측을 이어 붙인 뒤 한 번에 unwrap 한다. 따로 처리하면 이음매에서
 *    날짜변경선 보정이 어긋난다.
 */
export function buildTyphoonSources(series: TyphoonSeries): TyphoonSources {
  const analysis = series.analysis;
  const forecastSet = latestForecast(series);
  const forecast = forecastSet?.points ?? [];

  const raw: Position[] = [
    ...analysis.map((p): Position => [p.lon, p.lat]),
    ...forecast.map((p): Position => [p.lon, p.lat]),
  ];
  const unwrapped = unwrapLongitudes(raw);
  const analysisCoords = unwrapped.slice(0, analysis.length);
  const forecastCoords = unwrapped.slice(analysis.length);

  const last = latestAnalysis(series);
  const lastCoord = analysisCoords.at(-1);

  return {
    past: lineFeature(analysisCoords),
    // 예측선은 마지막 분석점에서 시작한다.
    forecast: lineFeature(lastCoord ? [lastCoord, ...forecastCoords] : forecastCoords),
    analysisPoints: {
      type: 'FeatureCollection',
      features: analysis.map((p, i) => pointFeature(p, analysisCoords[i]!)),
    },
    forecastPoints: {
      type: 'FeatureCollection',
      features: forecast.map((p, i) => pointFeature(p, forecastCoords[i]!)),
    },
    current: {
      type: 'FeatureCollection',
      features: last && lastCoord ? [pointFeature(last, lastCoord)] : [],
    },
  };
}
