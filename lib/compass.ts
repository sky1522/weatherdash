import type { Compass16 } from './types';

/** 🚨 `DIR`, `ED15`, `ED25`는 숫자가 아니라 16방위 기호다. 이 표를 통해서만 각도로 바꾼다. */
export const COMPASS_16 = {
  N: 0, NNE: 22.5, NE: 45, ENE: 67.5,
  E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
  S: 180, SSW: 202.5, SW: 225, WSW: 247.5,
  W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
} as const satisfies Record<Compass16, number>;

const KOREAN: Record<Compass16, string> = {
  N: '북', NNE: '북북동', NE: '북동', ENE: '동북동',
  E: '동', ESE: '동남동', SE: '남동', SSE: '남남동',
  S: '남', SSW: '남남서', SW: '남서', WSW: '서남서',
  W: '서', WNW: '서북서', NW: '북서', NNW: '북북서',
};

export function isCompass16(value: string): value is Compass16 {
  return Object.prototype.hasOwnProperty.call(COMPASS_16, value);
}

/** 방위 기호를 각도로. 북이 0도, 시계방향. */
export function compassToDegrees(dir: Compass16): number {
  return COMPASS_16[dir];
}

/** 화면 표기용 한글 방위. */
export function compassToKorean(dir: Compass16): string {
  return KOREAN[dir];
}
