import maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { basemapStyle } from './basemap-style';

/** 북서태평양. typ01이 다루는 태풍 발생·이동 영역이 한 화면에 들어오는 초기 뷰. */
export const NORTHWEST_PACIFIC = {
  center: [138, 22] as [number, number],
  zoom: 3,
  /** 🚨 날짜변경선을 넘는 경로를 다루므로 동쪽 경계를 180도 너머까지 열어 둔다. */
  maxBounds: [
    [90, -5],
    [200, 55],
  ] as [[number, number], [number, number]],
};

let protocolRegistered = false;

/** pmtiles:// 프로토콜은 프로세스당 한 번만 등록한다. */
function registerPmtilesProtocol(): void {
  if (protocolRegistered) return;
  const protocol = new Protocol();
  maplibregl.addProtocol('pmtiles', protocol.tile);
  protocolRegistered = true;
}

export function createMap(container: HTMLElement, pmtilesUrl: string): maplibregl.Map {
  registerPmtilesProtocol();

  const map = new maplibregl.Map({
    container,
    style: basemapStyle(pmtilesUrl),
    center: NORTHWEST_PACIFIC.center,
    zoom: NORTHWEST_PACIFIC.zoom,
    maxBounds: NORTHWEST_PACIFIC.maxBounds,
    attributionControl: { compact: true },
  });

  map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right');
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');

  return map;
}
