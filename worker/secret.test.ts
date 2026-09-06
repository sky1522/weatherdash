import { describe, it, expect } from 'vitest';
import { redact, fingerprint, REDACTED } from './secret';

const KEY = 'AbCd1234-secret-authkey_XYZ';

describe('redact', () => {
  it('원문 시크릿을 지운다', () => {
    expect(redact(`key=${KEY} tail`, KEY)).toBe(`key=${REDACTED} tail`);
  });

  it('URL 인코딩된 시크릿도 지운다', () => {
    const encoded = encodeURIComponent('a+b/c=');
    expect(redact(`v=${encoded}`, 'a+b/c=')).not.toContain(encoded);
  });

  it('fetch 예외 메시지에 실린 업스트림 URL에서 키를 지운다', () => {
    const message = `request to https://apihub.kma.go.kr/api/typ01/url/typ_data.php?YY=2026&authKey=${KEY} failed`;
    const out = redact(message, KEY);
    expect(out).not.toContain(KEY);
    expect(out).toContain('typ_data.php');
  });

  it('시크릿 값을 몰라도 authKey 파라미터는 지운다', () => {
    const out = redact('https://x/y?a=1&authKey=whatever-value&b=2');
    expect(out).not.toContain('whatever-value');
    expect(out).toContain('b=2');
  });

  it('여러 번 등장해도 전부 지운다', () => {
    const out = redact(`${KEY} / ${KEY}`, KEY);
    expect(out).toBe(`${REDACTED} / ${REDACTED}`);
  });

  it('시크릿이 없으면 원문을 보존한다', () => {
    expect(redact('아무 문제 없는 메시지', undefined)).toBe('아무 문제 없는 메시지');
  });
});

describe('fingerprint', () => {
  it('전체 키를 노출하지 않는다', () => {
    const fp = fingerprint(KEY);
    expect(fp).not.toContain(KEY);
    expect(fp.startsWith('AbCd')).toBe(true);
  });

  it('미설정을 구분해서 표시한다', () => {
    expect(fingerprint(undefined)).toBe('<unset>');
  });
});
