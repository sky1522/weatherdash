import maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { basemapStyle } from './basemap-style';

/** 북서태평양. typ01이 다루는 태풍 발생·이동 영역이 한 화면에 들어오는 초기 뷰. */
export const NORTHWEST_PACIFIC = {
  center: [138, 22] as [number, number],
  zoom: 3,
};
// 🚨 maxBounds 는 두지 않는다. 날짜변경선을 넘는 경로를 담으려면 동쪽 경계가 180도를
//    넘어야 하는데, 그 값이 카메라 제약과 어떻게 상호작용하는지 확인되지 않았다.
//    경로 렌더가 붙는 P2 에서 실제 경로로 확인한 뒤 다시 판단한다.

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
    attributionControl: { compact: true },
  });

  map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right');
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');

  return map;
}
