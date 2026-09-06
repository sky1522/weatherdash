/**
 * 인증키 유출 방지 헬퍼.
 *
 * 🚨 `authKey`는 쿼리스트링으로 전달되는 구조라, 업스트림 URL이나 fetch 예외 메시지에
 * 그대로 실려 나가기 쉽다. 응답·로그·에러 메시지로 나가는 모든 문자열은 반드시
 * 이 모듈을 거친다. (CLAUDE.md "하지 말 것" 1항)
 */

export const REDACTED = '[REDACTED]';

/** 로그·에러에 남겨도 되는 최소 식별자. 앞 4글자만 노출하고 나머지는 길이만 알린다. */
export function fingerprint(secret: string | undefined): string {
  if (!secret) return '<unset>';
  if (secret.length <= 4) return `<len:${secret.length}>`;
  return `${secret.slice(0, 4)}…<len:${secret.length}>`;
}

/**
 * 문자열에서 시크릿의 모든 표현형을 지운다.
 * 원문, URL 인코딩본, 그리고 `authKey=...` 쿼리 파라미터 자체를 함께 처리한다.
 */
export function redact(text: string, ...secrets: (string | undefined)[]): string {
  let out = text;

  for (const secret of secrets) {
    if (!secret) continue;
    for (const form of variants(secret)) {
      out = out.split(form).join(REDACTED);
    }
  }

  // 시크릿 값을 모르더라도 authKey 파라미터 형태는 무조건 지운다.
  out = out.replace(/([?&]authKey=)[^&\s"'<>]*/gi, `$1${REDACTED}`);

  return out;
}

function variants(secret: string): string[] {
  const forms = new Set<string>([secret]);
  try {
    forms.add(encodeURIComponent(secret));
  } catch {
    // 인코딩 불가 문자열이면 원문만 쓴다.
  }
  try {
    forms.add(decodeURIComponent(secret));
  } catch {
    // 디코딩 불가면 무시.
  }
  // 긴 표현형부터 지워야 짧은 형태가 먼저 잘려 잔여물이 남지 않는다.
  return [...forms].filter((f) => f.length > 0).sort((a, b) => b.length - a.length);
}
