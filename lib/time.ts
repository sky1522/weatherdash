/**
 * 시각 변환 단일 지점.
 *
 * 🚨 기상청 응답의 시각은 전부 UTC다. `TYP_TM`, `FT_TM`, `tm` 파라미터 모두.
 *    화면 표기는 KST다. 이 파일 밖에서 `+9`를 직접 더하지 않는다.
 *    변환 지점이 흩어지면 이중 변환이 생기고, 9시간 어긋난 화면은 정상으로 보인다.
 */

const KST_OFFSET_MINUTES = 9 * 60;

/** 진행 중 태풍의 소멸시각 자리표시. 이 이상이면 미정으로 본다. */
const OPEN_ENDED_FROM = '209901010000';

/** `YYYYMMDDHHmm` (UTC) → Date. 형식이 어긋나면 `null`. */
export function parseKmaTime(value: string): Date | null {
  const s = value.trim();
  if (!/^\d{12}$/.test(s)) return null;
  const year = Number(s.slice(0, 4));
  const month = Number(s.slice(4, 6));
  const day = Number(s.slice(6, 8));
  const hour = Number(s.slice(8, 10));
  const minute = Number(s.slice(10, 12));
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const ms = Date.UTC(year, month - 1, day, hour, minute);
  const d = new Date(ms);
  // 2월 31일 같은 값은 Date.UTC 가 다음 달로 굴려버린다. 되돌려 확인한다.
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d;
}

/** 소멸시각이 자리표시 값인지. 진행 중 태풍은 2100년 같은 값이 온다. */
export function isOpenEnded(value: string): boolean {
  return value.trim() >= OPEN_ENDED_FROM;
}

/** UTC 시각을 KST 기준 날짜 필드로. 이 함수만 오프셋을 더한다. */
function toKstParts(date: Date): {
  year: number; month: number; day: number; hour: number; minute: number;
} {
  const shifted = new Date(date.getTime() + KST_OFFSET_MINUTES * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** `09/06 09:00` — 지도 라벨과 팝업의 기본 표기. */
export function formatKstShort(date: Date): string {
  const p = toKstParts(date);
  return `${pad(p.month)}/${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}`;
}

/** `2026-09-06 09:00 KST` — 상세 표기. */
export function formatKstFull(date: Date): string {
  const p = toKstParts(date);
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)} KST`;
}

/** `2026-09-06 00:00 UTC` — 원본이 UTC임을 함께 보일 때 쓴다. */
export function formatUtc(date: Date): string {
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`
  );
}

/**
 * 분석시각으로부터 추정한 발표시각.
 * ✅ 실측: 분석시각은 UTC 00/06/12/18 정시이고, 발표는 그 약 1시간 뒤 KST 04/10/16/22시다.
 *    응답에 발표시각 필드가 없어 이 근사를 쓴다. 신선도 배지 계산용이다.
 */
export function estimateIssuedAt(analysisTime: Date): Date {
  return new Date(analysisTime.getTime() + 60 * 60_000);
}

/** 리드타임 표기. `+24h`. 분석행은 `현재`. */
export function formatLeadTime(hours: number): string {
  return hours === 0 ? '현재' : `+${hours}h`;
}
