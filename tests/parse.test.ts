import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  parseTyphoonData, parseTyphoonList, hasDataRows, latestForecast, latestAnalysis,
} from '../lib/parse';
import { parseKmaTime, formatKstShort, formatKstFull, isOpenEnded } from '../lib/time';
import { unwrapLongitudes } from '../lib/geo';
import { classifyStrength } from '../lib/strength';
import { compassToDegrees } from '../lib/compass';

const RAW = path.resolve(import.meta.dirname, '..', 'fixtures', 'raw');

/** 응답은 EUC-KR이다. 픽스처는 바이트 그대로 저장돼 있으므로 여기서 디코딩한다. */
function fixture(name: string): string {
  return new TextDecoder('euc-kr').decode(readFileSync(path.join(RAW, name)));
}

describe('parseTyphoonData — 크로반 2026년 24호', () => {
  const series = parseTyphoonData(fixture('typ_data_disp1_help2.txt'));

  it('태풍 단위로 하나의 시계열이 된다', () => {
    expect(series).toHaveLength(1);
    expect(series[0]).toMatchObject({ yy: 2026, typ: 24 });
  });

  it('SEQ는 분석행마다 다르다. 그걸로 묶으면 궤적이 쪼개진다', () => {
    const s = series[0]!;
    const seqs = s.analysis.map((p) => p.seq);
    // 발표 21회가 각각 분석점 하나씩을 남겼다.
    expect(seqs).toEqual(Array.from({ length: 21 }, (_, i) => i + 1));
    // 그래도 궤적은 하나로 이어져 있어야 한다.
    expect(s.analysis).toHaveLength(21);
  });

  it('FT로 분석과 예측이 분리된다', () => {
    const s = series[0]!;
    expect(s.analysis.every((p) => p.kind === 'analysis')).toBe(true);
    expect(s.forecasts).toHaveLength(1);
    expect(s.forecasts[0]!.points.every((p) => p.kind === 'forecast')).toBe(true);
  });

  it('분석은 시각순, 예측은 리드타임순으로 정렬된다', () => {
    const s = series[0]!;
    const times = s.analysis.map((p) => p.typTm);
    expect([...times].sort()).toEqual(times);
    expect(latestForecast(s)!.points.map((p) => p.tmd)).toEqual([12, 24, 36]);
  });

  it('예측 묶음은 발표번호와 기준 분석시각을 가진다', () => {
    const set = latestForecast(series[0]!)!;
    expect(set.seq).toBe(21);
    expect(set.baseTime).toBe('202609060000');
    expect(set.points).toHaveLength(3);
  });

  it('마지막 분석행이 레퍼런스 캡처와 일치한다', () => {
    const last = latestAnalysis(series[0]!)!;
    expect(last).toMatchObject({
      seq: 21,
      typTm: '202609060000',
      lat: 25.9,
      lon: 129.3,
      dir: 'NE',
      sp: 14,
      ps: 992,
      ws: 21,
      rad15: 250,
      ed15: 'SW',
      er15: 120,
    });
    // 폭풍반경은 결측이다. 화면의 하이픈 표기에 대응한다.
    expect(last.rad25).toBeNull();
    expect(last.ed25).toBeNull();
    expect(last.er25).toBeNull();
  });

  it('결측을 0으로 채우지 않는다', () => {
    const all = series.flatMap((s) => [...s.analysis, ...s.forecasts.flatMap((f) => f.points)]);
    // -999 가 숫자로 새어 나오면 반경 -999 km 원이 그려진다.
    for (const p of all) {
      for (const v of [p.rad15, p.rad25, p.rad, p.er15, p.er25, p.ws, p.ps, p.sp]) {
        expect(v === null || v >= 0).toBe(true);
      }
    }
    expect(all.every((p) => p.rad25 === null)).toBe(true);
  });

  it('강풍반경도 결측된다 — 약화한 36시간 예측', () => {
    const far = latestForecast(series[0]!)!.points.find((p) => p.tmd === 36)!;
    expect(far.ws).toBe(15);
    expect(far.rad15).toBeNull();
    expect(far.ed15).toBeNull();
    expect(far.er15).toBeNull();
    // 확률반경은 살아 있다.
    expect(far.rad).toBe(110);
  });

  it('확률반경은 분석행에서 0이고 예측행에서만 값이 있다', () => {
    const s = series[0]!;
    expect(s.analysis.every((p) => p.rad === 0)).toBe(true);
    expect(latestForecast(s)!.points.map((p) => p.rad)).toEqual([40, 80, 110]);
  });

  it('DIR은 16방위 기호이고 표를 통해 각도로 바뀐다', () => {
    const dirs = new Set(series[0]!.analysis.map((p) => p.dir));
    expect(dirs.has('NE')).toBe(true);
    for (const d of dirs) if (d) expect(compassToDegrees(d)).toBeGreaterThanOrEqual(0);
    expect(compassToDegrees('SW')).toBe(225);
  });
});

describe('parseTyphoonData — typ_now', () => {
  const now = parseTyphoonData(fixture('typ_now_disp1_help2.txt'));

  it('동일한 구조로 파싱된다', () => {
    expect(now).toHaveLength(1);
    expect(now[0]!.analysis).toHaveLength(21);
    expect(now[0]!.forecasts).toHaveLength(1);
  });

  it('typ_now 는 예측행의 SEQ를 0으로 준다', () => {
    // typ_data 는 실제 발표번호(21)를 주는데 typ_now 는 0이다.
    // SEQ 단독으로 발표를 구분하면 여기서 어긋난다.
    const set = latestForecast(now[0]!)!;
    expect(set.seq).toBe(0);
    expect(set.baseTime).toBe('202609060000');
  });

  it('SEQ가 달라도 예측 내용은 typ_data 와 같다', () => {
    const a = latestForecast(parseTyphoonData(fixture('typ_data_disp1_help2.txt'))[0]!)!;
    const b = latestForecast(now[0]!)!;
    expect(b.points.map((p) => [p.tmd, p.lat, p.lon, p.ps, p.ws])).toEqual(
      a.points.map((p) => [p.tmd, p.lat, p.lon, p.ps, p.ws]),
    );
  });
});

describe('parseTyphoonList', () => {
  const list = parseTyphoonList(fixture('typ_lst_disp1_help2.txt'));

  it('2026년 태풍 24개를 읽는다', () => {
    expect(list).toHaveLength(24);
    expect(list[0]).toMatchObject({ yy: 2026, typ: 1, nameEn: 'NOKAEN' });
  });

  it('EUC-KR 한글명이 깨지지 않는다', () => {
    const krovanh = list.find((e) => e.typ === 24)!;
    expect(krovanh.name).toBe('크로반');
    expect(krovanh.nameEn).toBe('KROVANH');
    expect(krovanh.rem).toContain('캄보디아');
  });

  it('진행 중 태풍은 NOW=1이고 소멸시각이 null이다', () => {
    const krovanh = list.find((e) => e.typ === 24)!;
    expect(krovanh.now).toBe(1);
    // 자리표시 값 210012310000 을 그대로 파싱하면 2100년이 된다.
    expect(krovanh.tmEd).toBeNull();
    expect(krovanh.tmSt).toBe('202609010000');
  });

  it('종료된 태풍은 소멸시각을 가진다', () => {
    const ended = list.filter((e) => e.now === 2);
    expect(ended).toHaveLength(23);
    expect(ended.every((e) => e.tmEd !== null)).toBe(true);
  });

  it('REM에 콤마가 있어도 잘리지 않는다', () => {
    expect(list.every((e) => e.rem.length > 0)).toBe(true);
  });
});

describe('부재 응답', () => {
  it('데이터행이 없으면 없음이다. 오류가 아니다', () => {
    expect(hasDataRows(fixture('typ_data_absent_disp1_help2.txt'))).toBe(false);
    expect(hasDataRows(fixture('typ_now_absent_disp1_help2.txt'))).toBe(false);
    expect(parseTyphoonData(fixture('typ_data_absent_disp1_help2.txt'))).toEqual([]);
  });

  it('정상 응답은 데이터행을 가진다', () => {
    expect(hasDataRows(fixture('typ_data_disp1_help2.txt'))).toBe(true);
  });
});

describe('help 값이 달라도 주석만 걸러내면 같은 결과가 된다', () => {
  it('help=0/1/2 의 트랙 내용이 같다', () => {
    const h2 = parseTyphoonData(fixture('typ_data_disp1_help2.txt'));
    const h1 = parseTyphoonData(fixture('typ_data_disp1_help1.txt'));
    const h0 = parseTyphoonData(fixture('typ_data_disp1_help0.txt'));
    expect(h1).toEqual(h2);
    expect(h0).toEqual(h2);
  });
});

describe('lib/time — 변환 단일 지점', () => {
  it('UTC로 파싱한다', () => {
    const d = parseKmaTime('202609060000')!;
    expect(d.toISOString()).toBe('2026-09-06T00:00:00.000Z');
  });

  it('KST 표기는 UTC + 9시간이다. 09 KST = 00 UTC', () => {
    const d = parseKmaTime('202609060000')!;
    expect(formatKstShort(d)).toBe('09/06 09:00');
    expect(formatKstFull(d)).toBe('2026-09-06 09:00 KST');
  });

  it('날짜를 넘길 때도 맞다. 18 UTC = 다음날 03 KST', () => {
    const d = parseKmaTime('202609051800')!;
    expect(formatKstShort(d)).toBe('09/06 03:00');
  });

  it('형식이 어긋나면 null', () => {
    expect(parseKmaTime('2026090600')).toBeNull();
    expect(parseKmaTime('202602310000')).toBeNull();
    expect(parseKmaTime('')).toBeNull();
  });

  it('진행 중 태풍의 자리표시 소멸시각을 가려낸다', () => {
    expect(isOpenEnded('210012310000')).toBe(true);
    expect(isOpenEnded('202609010000')).toBe(false);
  });
});

describe('lib/geo — 날짜변경선', () => {
  it('경도가 연속으로 이어진다', () => {
    const out = unwrapLongitudes([
      [178, 20],
      [179.8, 21],
      [-179.5, 22],
      [-178, 23],
    ]);
    expect(out.map((p) => p[0])).toEqual([178, 179.8, 180.5, 182]);
  });

  it('넘지 않는 경로는 그대로 둔다', () => {
    const input: [number, number][] = [
      [129, 25],
      [131, 26],
      [132, 28],
    ];
    expect(unwrapLongitudes(input)).toEqual(input);
  });

  it('빈 배열을 견딘다', () => {
    expect(unwrapLongitudes([])).toEqual([]);
  });
});

describe('lib/strength', () => {
  it('최대풍속으로 강도를 나눈다', () => {
    expect(classifyStrength(15)).toBe('td');
    expect(classifyStrength(21)).toBe('normal');
    expect(classifyStrength(30)).toBe('strong');
    expect(classifyStrength(40)).toBe('very-strong');
    expect(classifyStrength(50)).toBe('super');
  });

  it('결측을 열대저압부로 추측하지 않는다', () => {
    expect(classifyStrength(null)).toBeNull();
  });
});
