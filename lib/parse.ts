/**
 * 기상청 태풍 응답 파서.
 *
 * 대상은 `disp=1, help=2` 응답뿐이다.
 * 🚨 `disp=0` 고정폭 응답 파서는 만들지 않는다. 컬럼 폭이 명세에 없다.
 *
 * 🚨 필드는 이름이 아니라 **위치**로 참조한다. 구분자 응답에는 필드명이 실려 오지 않고,
 *    `help=1` 응답 안에서도 항목 설명은 `ER25R`, 컬럼 헤더는 `ER25`로 표기가 엇갈린다.
 */

import type {
  Compass16, EffFlag, ForecastSet, NowFlag, TrackPoint, TyphoonListEntry, TyphoonSeries,
} from './types';
import { isCompass16 } from './compass';
import { isOpenEnded } from './time';

/** ✅ 실측 결측 토큰. 수치는 `-999`, 방위는 `-`. 빈칸과 `-9`는 나타나지 않았다. */
const MISSING_NUMBER = '-999';
const MISSING_TOKEN = '-';

/** 각 행 끝에 붙는 종료 표시. */
const ROW_TERMINATOR = '=';

export class TyphoonParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TyphoonParseError';
  }
}

/**
 * 데이터행만 남긴다. `#`로 시작하는 주석과 빈 줄을 버린다.
 * `#START7777` / `#7777END` 도 여기서 걸러진다.
 */
function dataLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

/** 콤마로 나누고 각 칸을 트림한다. 마지막 `=` 칸은 버린다. */
function fields(line: string): string[] {
  const parts = line.split(',').map((p) => p.trim());
  while (parts.length > 0 && parts[parts.length - 1] === ROW_TERMINATOR) parts.pop();
  return parts;
}

/** 🚨 결측을 0으로 채우지 않는다. `-999`는 반경 −999 km가 되어 조용히 렌더된다. */
function optionalNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const v = raw.trim();
  if (v === '' || v === MISSING_NUMBER || v === MISSING_TOKEN) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function requiredNumber(raw: string | undefined, field: string): number {
  const n = optionalNumber(raw);
  if (n === null) throw new TyphoonParseError(`${field}: 필수 수치가 비어 있다 (${raw ?? '없음'})`);
  return n;
}

/** 🚨 방위는 16방위 기호다. 표에 없는 값은 결측으로 본다. */
function optionalCompass(raw: string | undefined): Compass16 | null {
  if (raw === undefined) return null;
  const v = raw.trim();
  if (v === '' || v === MISSING_TOKEN || v === MISSING_NUMBER) return null;
  return isCompass16(v) ? v : null;
}

function requiredTime(raw: string | undefined, field: string): string {
  const v = raw?.trim() ?? '';
  if (!/^\d{12}$/.test(v)) throw new TyphoonParseError(`${field}: 시각 형식이 아니다 (${v})`);
  return v;
}

// ── 트랙 (typ_data, typ_now) ────────────────────────────────────────────────

/**
 * 필드 위치. `help=1` 응답의 항목 번호에서 1을 뺀 값이다.
 * 순서를 바꾸면 조용히 다른 값을 읽는다.
 */
const T = {
  FT: 0, YY: 1, TYP: 2, SEQ: 3, TMD: 4, TYP_TM: 5, FT_TM: 6,
  LAT: 7, LON: 8, DIR: 9, SP: 10, PS: 11, WS: 12,
  RAD15: 13, RAD25: 14, RAD: 15, ED15: 16, ER15: 17, LOC: 18,
  ED25: 19, ER25R: 20,
} as const;

const TRACK_MIN_FIELDS = T.ER25R + 1;

function parseTrackPoint(line: string): TrackPoint {
  const f = fields(line);
  if (f.length < TRACK_MIN_FIELDS) {
    throw new TyphoonParseError(`트랙 행의 칸 수가 부족하다: ${f.length} < ${TRACK_MIN_FIELDS}`);
  }

  const ft = f[T.FT]?.trim();
  if (ft !== '0' && ft !== '1') {
    throw new TyphoonParseError(`FT는 0 또는 1이어야 한다 (${ft ?? '없음'})`);
  }

  return {
    kind: ft === '0' ? 'analysis' : 'forecast',
    yy: requiredNumber(f[T.YY], 'YY'),
    typ: requiredNumber(f[T.TYP], 'TYP'),
    seq: requiredNumber(f[T.SEQ], 'SEQ'),
    tmd: optionalNumber(f[T.TMD]) ?? 0,
    typTm: requiredTime(f[T.TYP_TM], 'TYP_TM'),
    ftTm: requiredTime(f[T.FT_TM], 'FT_TM'),
    lat: requiredNumber(f[T.LAT], 'LAT'),
    lon: requiredNumber(f[T.LON], 'LON'),
    dir: optionalCompass(f[T.DIR]),
    sp: optionalNumber(f[T.SP]),
    ps: optionalNumber(f[T.PS]),
    ws: optionalNumber(f[T.WS]),
    rad15: optionalNumber(f[T.RAD15]),
    rad25: optionalNumber(f[T.RAD25]),
    rad: optionalNumber(f[T.RAD]),
    ed15: optionalCompass(f[T.ED15]),
    er15: optionalNumber(f[T.ER15]),
    loc: f[T.LOC]?.trim() ?? '',
    ed25: optionalCompass(f[T.ED25]),
    er25: optionalNumber(f[T.ER25R]),
  };
}

/** 데이터행을 그대로 트랙점 배열로. 그룹핑 전 원본 순서를 유지한다. */
export function parseTrackPoints(text: string): TrackPoint[] {
  return dataLines(text).map(parseTrackPoint);
}

/**
 * `typ_data` / `typ_now` 응답을 태풍 단위 시계열로 정리한다.
 *
 * 🚨 `SEQ` 로 전체를 묶지 않는다. 분석행은 발표마다 하나씩 나오므로 `SEQ` 가 매번 다르고,
 *    그걸로 그룹핑하면 궤적이 점 하나짜리 그룹 21개로 쪼개진다.
 *    분석은 태풍 단위로 모아 시각순으로 잇고, 예측만 발표 단위로 나눈다.
 *
 * 🚨 예측 묶음의 키는 `(SEQ, TYP_TM)` 이다. `typ_now` 가 `SEQ=0` 을 주기 때문에
 *    `SEQ` 만으로는 서로 다른 발표의 예측이 한 묶음에 섞일 수 있다.
 */
export function parseTyphoonData(text: string): TyphoonSeries[] {
  const series = new Map<string, TyphoonSeries>();
  const forecastGroups = new Map<string, Map<string, ForecastSet>>();

  for (const point of parseTrackPoints(text)) {
    const key = `${point.yy}/${point.typ}`;

    let entry = series.get(key);
    if (!entry) {
      entry = { yy: point.yy, typ: point.typ, analysis: [], forecasts: [] };
      series.set(key, entry);
      forecastGroups.set(key, new Map());
    }

    if (point.kind === 'analysis') {
      entry.analysis.push(point);
      continue;
    }

    const groups = forecastGroups.get(key)!;
    const groupKey = `${point.seq}/${point.typTm}`;
    let set = groups.get(groupKey);
    if (!set) {
      set = { seq: point.seq, baseTime: point.typTm, points: [] };
      groups.set(groupKey, set);
    }
    set.points.push(point);
  }

  for (const [key, entry] of series) {
    entry.analysis.sort((a, b) => a.typTm.localeCompare(b.typTm));
    const groups = [...forecastGroups.get(key)!.values()];
    for (const set of groups) set.points.sort((a, b) => a.tmd - b.tmd);
    groups.sort((a, b) => a.baseTime.localeCompare(b.baseTime) || a.seq - b.seq);
    entry.forecasts = groups;
  }

  return [...series.values()].sort((a, b) => a.yy - b.yy || a.typ - b.typ);
}

/** 가장 최근 발표의 예측. 없으면 `null`. 🚨 여러 발표를 합치지 않는다. */
export function latestForecast(series: TyphoonSeries): ForecastSet | null {
  return series.forecasts.at(-1) ?? null;
}

/** 가장 최근 분석점. 지도의 현재 위치 마커가 참조한다. */
export function latestAnalysis(series: TyphoonSeries): TrackPoint | null {
  return series.analysis.at(-1) ?? null;
}

// ── 목록 (typ_lst) ──────────────────────────────────────────────────────────

const L = {
  YY: 0, SEQ: 1, NOW: 2, EFF: 3, TM_ST: 4, TM_ED: 5,
  TYP_NAME: 6, TYP_EN: 7, REM: 8,
} as const;

const LIST_MIN_FIELDS = L.TYP_EN + 1;

function parseListEntry(line: string): TyphoonListEntry {
  const f = fields(line);
  if (f.length < LIST_MIN_FIELDS) {
    throw new TyphoonParseError(`목록 행의 칸 수가 부족하다: ${f.length} < ${LIST_MIN_FIELDS}`);
  }

  const now = requiredNumber(f[L.NOW], 'NOW');
  const eff = requiredNumber(f[L.EFF], 'EFF');
  const tmEdRaw = requiredTime(f[L.TM_ED], 'TM_ED');

  return {
    yy: requiredNumber(f[L.YY], 'YY'),
    typ: requiredNumber(f[L.SEQ], 'SEQ'),
    now: (now === 1 ? 1 : 2) satisfies NowFlag,
    eff: (eff >= 1 && eff <= 4 ? eff : 4) as EffFlag,
    tmSt: requiredTime(f[L.TM_ST], 'TM_ST'),
    // 🚨 진행 중 태풍은 소멸시각에 자리표시 값이 온다. 그대로 파싱하면 2100년이 된다.
    tmEd: isOpenEnded(tmEdRaw) ? null : tmEdRaw,
    name: f[L.TYP_NAME]?.trim() ?? '',
    nameEn: f[L.TYP_EN]?.trim() ?? '',
    // REM 에는 콤마가 들어갈 수 있다. 남은 칸을 다시 붙인다.
    rem: f.slice(L.REM).join(',').trim(),
  };
}

export function parseTyphoonList(text: string): TyphoonListEntry[] {
  return dataLines(text).map(parseListEntry);
}

/** 데이터행이 하나도 없으면 "태풍 없음"이다. ✅ 부재 시에도 HTTP 200이 온다. */
export function hasDataRows(text: string): boolean {
  return dataLines(text).length > 0;
}
