/**
 * 기상청 API 허브 프록시 (P0 골격).
 *
 * 이 단계에서는 정규화를 하지 않는다. 업스트림 응답 바이트를 그대로 통과시킨다.
 * 정규화(JSON 변환)는 P1 파서 단계에서 붙인다.
 *
 * 🚨 인증키는 이 파일 밖으로 나가지 않는다. 응답 본문, 응답 헤더, 에러 메시지 어디에도
 *    실리지 않으며, 이 워커는 어떤 경우에도 요청 URL 전체를 로그하지 않는다.
 */

import { redact } from './secret';

const UPSTREAM_ORIGIN = 'https://apihub.kma.go.kr';

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
 */
const ALLOWED_PARAMS: Record<Route, readonly string[]> = {
  '/api/typhoon/list': ['YY', 'disp', 'help', 'mode'],
  '/api/typhoon/data': ['YY', 'typ', 'seq', 'mode', 'disp', 'help'],
  '/api/typhoon/now': ['tm', 'mode', 'disp', 'help'],
};

export interface Env {
  KMA_AUTH_KEY: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return errorResponse(405, 'method_not_allowed', 'GET만 지원한다.');
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
    upstream.searchParams.set('authKey', env.KMA_AUTH_KEY);

    let response: Response;
    try {
      response = await fetch(upstream, {
        method: request.method,
        headers: { accept: '*/*' },
      });
    } catch (cause) {
      // 🚨 fetch 예외 메시지에는 요청 URL(=authKey 포함)이 실릴 수 있다. 반드시 redact.
      const detail = redact(cause instanceof Error ? cause.message : String(cause), env.KMA_AUTH_KEY);
      return errorResponse(502, 'upstream_unreachable', detail);
    }

    // 바이트 그대로 통과. 인코딩 변환을 하지 않는다.
    // 🔶 업스트림 Content-Type의 charset이 실제 본문 인코딩과 일치하는지 미확정이므로
    //    P0에서는 헤더를 손대지 않고 원문 그대로 넘긴 뒤 픽스처로 판정한다.
    const headers = new Headers();
    const contentType = response.headers.get('content-type');
    if (contentType) headers.set('content-type', contentType);
    headers.set('cache-control', 'no-store');
    headers.set('x-upstream-status', String(response.status));

    return new Response(response.body, { status: response.status, headers });
  },
};

function errorResponse(status: number, code: string, message: string): Response {
  // 여기 들어오는 message는 호출부에서 이미 redact된 값이지만, 이중으로 한 번 더 거른다.
  const body = JSON.stringify({ status: 'error', code, message: redact(message) });
  return new Response(body, {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
