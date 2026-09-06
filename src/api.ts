import type { Result, TyphoonListEntry, TyphoonSeries } from '../lib/types';

/**
 * Worker 프록시 클라이언트.
 *
 * 🚨 인증키는 프론트에 없다. 모든 조회는 Worker를 거친다.
 * 🚨 실패를 빈 배열로 삼키지 않는다. `none`(태풍 없음)과 `error`(조회 실패)를 구분해서
 *    돌려준다. 이 구분이 무너지면 API 장애가 화면에 "태풍 없음"으로 표시된다.
 */

async function request<T>(path: string, params: Record<string, string>): Promise<Result<T>> {
  const url = new URL(path, window.location.href);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  let response: Response;
  try {
    response = await fetch(url, { headers: { accept: 'application/json' } });
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    return { status: 'error', reason: `Worker에 연결하지 못했다: ${reason}` };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { status: 'error', reason: `응답이 JSON이 아니다 (HTTP ${response.status})` };
  }

  if (typeof body !== 'object' || body === null || !('status' in body)) {
    return { status: 'error', reason: `응답 형식을 알 수 없다 (HTTP ${response.status})` };
  }

  const result = body as { status: string; data?: unknown; reason?: string };
  if (result.status === 'ok') return { status: 'ok', data: result.data as T };
  if (result.status === 'none') return { status: 'none' };
  return { status: 'error', reason: result.reason ?? `HTTP ${response.status}` };
}

export function fetchTyphoonList(year: number): Promise<Result<TyphoonListEntry[]>> {
  return request('/api/typhoon/list', { YY: String(year) });
}

/**
 * 기준시각 조회. `tm`은 UTC `YYYYMMDDHHmm`.
 * 🔶 "과거 12시간 내 발표" 기준이 발표시각인지 분석시각인지는 미확정이다.
 */
export function fetchTyphoonNow(tm: string): Promise<Result<TyphoonSeries[]>> {
  return request('/api/typhoon/now', { tm, mode: '1' });
}

/**
 * 상세 조회.
 * 🚨 `YY`, `typ`, `seq`를 모두 명시한다. 생략하면 응답이 시점에 따라 달라져 재현이 안 된다.
 */
export function fetchTyphoonData(
  year: number,
  typ: number,
  seq: number,
): Promise<Result<TyphoonSeries[]>> {
  return request('/api/typhoon/data', {
    YY: String(year),
    typ: String(typ),
    seq: String(seq),
    mode: '1',
  });
}

/** 현재 UTC 시각을 `YYYYMMDDHH00` 으로. `typ_now`의 `tm` 파라미터 형식이다. */
export function currentUtcStamp(now: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `${pad(now.getUTCHours())}00`
  );
}
