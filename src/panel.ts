import type { TyphoonListEntry, TyphoonSeries } from '../lib/types';
import { latestAnalysis, latestForecast } from '../lib/parse';
import { classifyStrength, strengthLabel } from '../lib/strength';
import { compassToKorean } from '../lib/compass';
import { formatKstFull, formatUtc, parseKmaTime, estimateIssuedAt } from '../lib/time';

/**
 * 텍스트 정보 패널.
 *
 * 🚨 지도 위에만 있는 정보는 전달되지 않는다. 지도가 보여주는 값은 반드시 여기에도 있어야
 *    한다. 색각 이상, 스크린리더, 축소 화면 어느 쪽도 지도만으로는 읽지 못한다.
 *
 * 🚨 표시값은 원본 발표값만 쓴다. 결측은 하이픈으로 둔다. 숨기거나 0으로 채우지 않는다.
 */

export type PanelState =
  | { kind: 'loading' }
  | { kind: 'ok'; entry: TyphoonListEntry | null; series: TyphoonSeries }
  | { kind: 'none'; year: number }
  | { kind: 'error'; reason: string };

export function renderPanel(root: HTMLElement, state: PanelState): void {
  root.dataset['state'] = state.kind;

  if (state.kind === 'loading') {
    root.innerHTML = `<p class="panel-note">불러오는 중…</p>`;
    return;
  }

  if (state.kind === 'none') {
    // 정상 응답이고 진행 중 태풍이 없다. 조회 실패와 다른 상태다.
    root.innerHTML =
      `<h2>진행 중인 태풍 없음</h2>` +
      `<p class="panel-note">${state.year}년 기준. 기상청 typ01은 진행 중인 태풍만 제공한다.</p>`;
    return;
  }

  if (state.kind === 'error') {
    // 🚨 조회 실패를 "태풍 없음"으로 표시하지 않는다.
    root.innerHTML =
      `<h2 class="panel-error">조회 실패</h2>` +
      `<p class="panel-note">${escapeHtml(state.reason)}</p>`;
    return;
  }

  const { entry, series } = state;
  const current = latestAnalysis(series);
  if (!current) {
    root.innerHTML = `<h2>분석 자료 없음</h2>`;
    return;
  }

  const analysisTime = parseKmaTime(current.typTm);
  const forecast = latestForecast(series);
  const title = entry
    ? `제${entry.typ}호 태풍 ${entry.name} (${entry.nameEn})`
    : `${series.yy}년 제${series.typ}호 태풍`;

  const rows: [string, string][] = [
    ['중심위치', `${current.lat.toFixed(1)}°N ${current.lon.toFixed(1)}°E`],
    ['중심기압', current.ps === null ? '-' : `${current.ps} hPa`],
    ['최대풍속', current.ws === null ? '-' : `${current.ws} m/s`],
    ['강풍반경', radiusText(current.rad15, current.ed15, current.er15)],
    ['폭풍반경', radiusText(current.rad25, current.ed25, current.er25)],
    ['강도', strengthLabel(classifyStrength(current.ws))],
    [
      '진행방향',
      current.dir === null ? '-' : compassToKorean(current.dir),
    ],
    ['이동속도', current.sp === null ? '-' : `${current.sp} km/h`],
  ];

  const issued = analysisTime ? estimateIssuedAt(analysisTime) : null;

  root.innerHTML =
    `<h2>${escapeHtml(title)}</h2>` +
    `<p class="panel-loc">${escapeHtml(current.loc)}</p>` +
    `<dl class="panel-rows">` +
    rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join('') +
    `</dl>` +
    `<p class="panel-note">` +
    `분석 ${analysisTime ? escapeHtml(formatKstFull(analysisTime)) : '-'}` +
    ` · 발표번호 ${current.seq}` +
    (issued ? ` · 발표 추정 ${escapeHtml(formatKstFull(issued))}` : '') +
    `<br>원본 시각은 UTC다. ${analysisTime ? escapeHtml(formatUtc(analysisTime)) : '-'}` +
    (forecast
      ? `<br>예측 ${forecast.points.length}개 (최대 +${forecast.points.at(-1)?.tmd ?? 0}h). 점선은 예보다.`
      : '<br>예측 자료 없음') +
    `</p>`;
}

function radiusText(
  radius: number | null,
  exceptionDir: Parameters<typeof compassToKorean>[0] | null,
  exceptionRadius: number | null,
): string {
  // 🚨 결측을 0으로 채우지 않는다. 화면에는 하이픈으로 남긴다.
  if (radius === null) return '-';
  if (exceptionDir === null || exceptionRadius === null) return `${radius} km`;
  return `${radius} km [${compassToKorean(exceptionDir)} 약 ${exceptionRadius} km]`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
