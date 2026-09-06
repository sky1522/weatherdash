/**
 * 태풍 강도 구분.
 *
 * 🚨 강도는 색이 아니라 심볼 크기·형태로 구분한다. 색만으로 나누면 색각 이상
 *    사용자가 읽지 못하고 흑백 인쇄에서도 사라진다.
 *
 * 기준은 기상청 최대풍속(m/s) 구분이다.
 */

export type Strength = 'td' | 'normal' | 'strong' | 'very-strong' | 'super';

const LABELS: Record<Strength, string> = {
  td: '열대저압부',
  normal: '중',
  strong: '강',
  'very-strong': '매우 강',
  super: '초강력',
};

/** 심볼 반지름(px). 강도가 셀수록 크다. */
const RADII: Record<Strength, number> = {
  td: 3,
  normal: 5,
  strong: 6.5,
  'very-strong': 8,
  super: 9.5,
};

/** 최대풍속이 결측이면 열대저압부로 보지 않고 `null`을 돌려준다. 추측하지 않는다. */
export function classifyStrength(windSpeed: number | null): Strength | null {
  if (windSpeed === null) return null;
  if (windSpeed < 17) return 'td';
  if (windSpeed < 25) return 'normal';
  if (windSpeed < 33) return 'strong';
  if (windSpeed < 44) return 'very-strong';
  return 'super';
}

export function strengthLabel(strength: Strength | null): string {
  return strength === null ? '-' : LABELS[strength];
}

export function strengthRadius(strength: Strength | null): number {
  return strength === null ? 4 : RADII[strength];
}
