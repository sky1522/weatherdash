/** 기상청 태풍 API의 도메인 모델. 응답 텍스트가 아니라 이 타입만 화면에 노출한다. */

/** 16방위 기호. 🚨 `DIR`은 숫자가 아니다. */
export type Compass16 =
  | 'N' | 'NNE' | 'NE' | 'ENE'
  | 'E' | 'ESE' | 'SE' | 'SSE'
  | 'S' | 'SSW' | 'SW' | 'WSW'
  | 'W' | 'WNW' | 'NW' | 'NNW';

/** 0=분석(관측), 1=예측. 🚨 이걸 무시하고 시각순 정렬하면 조용히 섞인다. */
export type Kind = 'analysis' | 'forecast';

/**
 * 트랙의 한 점. 값은 전부 원본 발표값이다.
 * 결측은 `null`이다. 0이나 빈 문자열로 채우지 않는다.
 */
export interface TrackPoint {
  kind: Kind;
  /** 연도 */
  yy: number;
  /** 태풍번호 */
  typ: number;
  /** 발표번호. 🚨 다른 seq의 예측을 합치면 경로가 꼬인다. */
  seq: number;
  /** 예측시각 − 분석시각 (시간). 분석행은 0. */
  tmd: number;
  /** 분석시각. UTC. `YYYYMMDDHHmm` */
  typTm: string;
  /** 예측시각. UTC. `YYYYMMDDHHmm` */
  ftTm: string;
  lat: number;
  lon: number;
  /** 진행방향 */
  dir: Compass16 | null;
  /** 이동속도 km/h */
  sp: number | null;
  /** 중심기압 hPa */
  ps: number | null;
  /** 최대풍속 m/s */
  ws: number | null;
  /** 강풍반경 (15 m/s) km. 🚨 태풍이 약해지면 결측된다. */
  rad15: number | null;
  /** 폭풍반경 (25 m/s) km */
  rad25: number | null;
  /** 70% 확률반경 km. 분석행은 0이다. */
  rad: number | null;
  /** 강풍 예외방향 */
  ed15: Compass16 | null;
  /** 강풍 예외반경 km */
  er15: number | null;
  /** 위치 설명 */
  loc: string;
  /** 폭풍 예외방향 */
  ed25: Compass16 | null;
  /** 폭풍 예외반경 km. 응답의 필드명은 `ER25R`. */
  er25: number | null;
}

/**
 * 한 발표(`seq`)가 낸 예측 묶음.
 *
 * 🚨 서로 다른 발표의 예측을 한 배열에 합치면 경로가 꼬인다.
 * 🚨 `typ_now` 는 예측행의 `SEQ` 를 `0` 으로 준다. `typ_data` 는 실제 발표번호를 준다.
 *    그래서 발표 구분은 `seq` 단독이 아니라 `(seq, baseTime)` 으로 한다.
 */
export interface ForecastSet {
  /** 발표번호. `typ_now` 응답에서는 0(미지정)일 수 있다. */
  seq: number;
  /** 이 예측의 기준 분석시각. UTC. */
  baseTime: string;
  /** 리드타임순 예측점. */
  points: TrackPoint[];
}

/**
 * 태풍 하나의 전체 시계열.
 *
 * 🚨 `SEQ` 는 분석행마다 다르다. 발표 한 번이 분석점 하나를 남기므로,
 *    분석 궤적은 여러 발표의 분석점을 분석시각순으로 이은 것이다.
 *    `(YY, TYP, SEQ)` 로 묶으면 궤적이 점 하나짜리 그룹들로 쪼개진다.
 */
export interface TyphoonSeries {
  yy: number;
  /** 태풍번호 */
  typ: number;
  /** 모든 발표의 분석점. 분석시각순. */
  analysis: TrackPoint[];
  /** 발표별 예측 묶음. 기준 분석시각순. */
  forecasts: ForecastSet[];
}

/** 진행 여부. 1=진행중, 2=종료 */
export type NowFlag = 1 | 2;
/** 한반도 영향. 1=상륙, 2=직접영향, 3=간접영향, 4=없음 */
export type EffFlag = 1 | 2 | 3 | 4;

export interface TyphoonListEntry {
  yy: number;
  /** 태풍번호 */
  typ: number;
  now: NowFlag;
  eff: EffFlag;
  /** 발생시각. UTC. */
  tmSt: string;
  /**
   * 소멸시각. UTC. 진행 중이면 `null`.
   * 🚨 진행 중 태풍은 `210012310000` 같은 자리표시 값이 온다. 날짜로 파싱하면 2100년이 된다.
   */
  tmEd: string | null;
  name: string;
  nameEn: string;
  rem: string;
}

/**
 * 🚨 "태풍 없음"과 "조회 실패"를 반드시 다른 상태로 표현한다.
 * 실패를 빈 배열로 삼키면 API 장애가 "태풍 없음"으로 표시되고 아무도 눈치채지 못한다.
 */
export type Result<T> =
  | { status: 'ok'; data: T }
  | { status: 'none' }
  | { status: 'error'; reason: string };
