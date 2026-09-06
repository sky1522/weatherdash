/**
 * 기상청 API 허브 프록시.
 *
 * 업스트림의 EUC-KR 텍스트를 디코딩하고 정규화한 JSON만 프론트로 내보낸다.
 * 프론트는 응답 텍스트 형식을 알지 못한다.
 *
 * 🚨 인증키는 이 파일 밖으로 나가지 않는다. 응답 본문, 응답 헤더, 에러 메시지 어디에도
 *    실리지 않으며, 이 워커는 어떤 경우에도 요청 URL 전체를 로그하지 않는다.
 */

import { redact } from './secret';
import { hasDataRows, parseTyphoonData, parseTyphoonList, TyphoonParseError } from '../lib/parse';

const UPSTREAM_ORIGIN = 'https://apihub.kma.go.kr';

/** ✅ 응답은 EUC-KR이다. 헤더의 charset과 실제 바이트가 일치함을 픽스처로 확인했다. */
const UPSTREAM_CHARSET = 'euc-kr';

/**
 * PMTiles 베이스맵 중계 경로.
 *
 * 기본 베이스맵은 저장소에 함께 두는 지역 추출본이라 이 경로가 필요 없다.
 * 원본 행성 타일을 높은 줌까지 보고 싶을 때만 쓰는 개발용 우회로다.
 * Protomaps 데모 버킷이 Access-Control-Allow-Origin 을 주지 않아 브라우저가 직접 못 읽는다.
 */
const BASEMAP_ROUTE = '/api/basemap';
const DEFAULT_PMTILES_UPSTREAM = 'https://demo-bucket.protomaps.com/v4.pmtiles';

/** 라우트 → 업스트림 경로. 이 표에 없는 경로는 프록시하지 않는다. */
const ROUTES = {
  '/api/typhoon/list': '/api/typ01/url/typ_lst.php',
  '/api/typhoon/data': '/api/typ01/url/typ_data.php',
  '/api/typhoon/now': '/api/typ01/url/typ_now.php',
} as const;

type Route = keyof typeof ROUTES;

/**
 * 라우트별 허용 파라미터.
 * 🚨 화이트리스트로 막지 않으면 클라이언트가 `authKey`를 직접 실어 보내
 *    서버 시크릿을 덮어쓰거나, 업스트림에 임의 파라미터를 주입할 수 있다.
 *
 * `disp` 와 `help` 는 받지 않는다. 아래에서 고정한다.
 */
const ALLOWED_PARAMS: Record<Route, readonly string[]> = {
  '/api/typhoon/list': ['YY'],
  '/api/typhoon/data': ['YY', 'typ', 'seq', 'mode'],
  '/api/typhoon/now': ['tm', 'mode'],
};

/**
 * 🚨 응답 형식을 고정한다.
 * `disp=0` 은 고정폭 포트란 포맷이고 컬럼 폭이 명세에 없다. 파서를 만들지 않았다.
 * `help=0/1` 은 주석 라인이 섞인다. 파서가 걸러내지만 굳이 받아올 이유가 없다.
 */
const FIXED_PARAMS = { disp: '1', help: '2' } as const;

export interface Env {
  KMA_AUTH_KEY: string;
  /** 베이스맵 PMTiles 원본 URL. 미설정 시 Protomaps 공개 데모를 쓴다. */
  PMTILES_UPSTREAM?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return errorResponse(405, 'method_not_allowed', 'GET만 지원한다.');
    }

    if (url.pathname === BASEMAP_ROUTE) {
      return proxyBasemap(request, env.PMTILES_UPSTREAM ?? DEFAULT_PMTILES_UPSTREAM);
    }

    const route = url.pathname as Route;
    const upstreamPath = ROUTES[route];
    if (!upstreamPath) {
      return errorResponse(404, 'unknown_route', `프록시하지 않는 경로: ${url.pathname}`);
    }

    if (!env.KMA_AUTH_KEY) {
      // 🚨 키 미설정을 "태풍 없음"으로 흘려보내지 않는다. 설정 오류로 명시한다.
      return errorResponse(500, 'auth_key_unset', 'KMA_AUTH_KEY 시크릿이 설정되지 않았다.');
    }

    const upstream = new URL(upstreamPath, UPSTREAM_ORIGIN);
    for (const name of ALLOWED_PARAMS[route]) {
      const value = url.searchParams.get(name);
      if (value !== null) upstream.searchParams.set(name, value);
    }
    for (const [name, value] of Object.entries(FIXED_PARAMS)) {
      upstream.searchParams.set(name, value);
    }
    upstream.searchParams.set('authKey', env.KMA_AUTH_KEY);

    let response: Response;
    try {
      response = await fetch(upstream, { method: 'GET', headers: { accept: '*/*' } });
    } catch (cause) {
      // 🚨 fetch 예외 메시지에는 요청 URL(=authKey 포함)이 실릴 수 있다. 반드시 redact.
      const detail = redact(cause instanceof Error ? cause.message : String(cause), env.KMA_AUTH_KEY);
      return errorResponse(502, 'upstream_unreachable', detail);
    }

    if (!response.ok) {
      return errorResponse(502, 'upstream_status', `업스트림이 ${response.status}를 반환했다.`);
    }

    const bytes = await response.arrayBuffer();
    const text = new TextDecoder(UPSTREAM_CHARSET).decode(bytes);

    // 🚨 부재 시에도 업스트림은 HTTP 200을 준다. 상태코드로는 구분할 수 없다.
    //    데이터행이 없으면 "없음"이지 실패가 아니다. 반대로 실패를 빈 배열로 삼키지도 않는다.
    if (!hasDataRows(text)) {
      return jsonResponse(200, { status: 'none' });
    }

    try {
      const data = route === '/api/typhoon/list' ? parseTyphoonList(text) : parseTyphoonData(text);
      return jsonResponse(200, { status: 'ok', data });
    } catch (cause) {
      const reason = cause instanceof TyphoonParseError ? cause.message : '응답을 해석하지 못했다.';
      return errorResponse(502, 'parse_failed', redact(reason, env.KMA_AUTH_KEY));
    }
  },
};

/**
 * PMTiles 원본으로 Range 요청을 중계한다.
 * 파일 하나가 100 GB 단위라 전체를 읽지 않는다. 브라우저가 요구한 구간만 넘어간다.
 */
async function proxyBasemap(request: Request, upstream: string): Promise<Response> {
  const forwarded = new Headers({ accept: '*/*' });
  const range = request.headers.get('range');
  if (range) forwarded.set('range', range);

  let response: Response;
  try {
    response = await fetch(upstream, { method: request.method, headers: forwarded });
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return errorResponse(502, 'basemap_unreachable', redact(detail));
  }

  const headers = new Headers();
  // Range 응답 조립에 필요한 헤더만 보존한다.
  for (const name of ['content-type', 'content-length', 'content-range', 'etag', 'accept-ranges']) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set('access-control-allow-origin', '*');
  headers.set('access-control-expose-headers', 'content-range, content-length, etag, accept-ranges');
  // 정적 타일이다. 캐시해도 된다.
  headers.set('cache-control', 'public, max-age=86400');

  return new Response(response.body, { status: response.status, headers });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function errorResponse(status: number, code: string, message: string): Response {
  // 여기 들어오는 message는 호출부에서 이미 redact된 값이지만, 이중으로 한 번 더 거른다.
  return jsonResponse(status, { status: 'error', code, reason: redact(message) });
}
