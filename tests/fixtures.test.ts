import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

/**
 * 픽스처 무결성 검사.
 *
 * 🚨 픽스처는 API 원문 바이트 그대로여야 한다. git 의 줄바꿈 정규화나 편집기의
 *    인코딩 자동 변환이 끼어들면 wire 바이트와 달라지고, 그 위에서 내린
 *    인코딩·결측 판정이 전부 무효가 된다. 화면상으로는 아무 문제가 없어 보인다.
 *    manifest.json 에 기록해 둔 sha256 으로 그 변조를 잡는다.
 */

const RAW_DIR = path.resolve(import.meta.dirname, '..', 'fixtures', 'raw');
const MANIFEST = path.join(RAW_DIR, 'manifest.json');

interface ManifestEntry {
  file: string;
  bytes: number;
  sha256: string;
  httpStatus: number;
  params: Record<string, string>;
}

interface Manifest {
  files: ManifestEntry[];
}

const collected = existsSync(MANIFEST);

describe.skipIf(!collected)('fixtures/raw 무결성', () => {
  const manifest = collected ? (JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest) : null;

  it('매니페스트에 인증키가 기록되어 있지 않다', () => {
    // 파라미터 기록에 authKey 키 자체가 없어야 한다.
    for (const entry of manifest!.files) {
      const keys = Object.keys(entry.params).map((k) => k.toLowerCase());
      expect(keys).not.toContain('authkey');
    }
    // 쿼리스트링 형태로 새어 들어간 흔적도 없어야 한다.
    expect(readFileSync(MANIFEST, 'utf8')).not.toMatch(/authKey\s*[=:]\s*\S/i);
  });

  it('disp × help 조합이 빠짐없이 수집되어 있다', () => {
    const names = new Set(manifest!.files.map((f) => f.file));
    for (const endpoint of ['typ_lst', 'typ_data', 'typ_now']) {
      for (const disp of ['0', '1']) {
        for (const help of ['0', '1', '2']) {
          expect(names).toContain(`${endpoint}_disp${disp}_help${help}.txt`);
        }
      }
    }
  });

  it('부재 응답 판정용 픽스처가 있다', () => {
    const names = new Set(manifest!.files.map((f) => f.file));
    expect(names).toContain('typ_data_absent_disp1_help2.txt');
    expect(names).toContain('typ_now_absent_disp1_help2.txt');
  });

  it.each(collected ? manifest!.files.map((f) => [f.file, f] as const) : [])(
    '%s 바이트가 수집 시점과 동일하다',
    (_name, entry) => {
      const bytes = readFileSync(path.join(RAW_DIR, entry.file));
      expect(bytes.length).toBe(entry.bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.sha256);
    },
  );
});

describe.skipIf(collected)('fixtures/raw 미수집', () => {
  it('수집 전에는 판정을 진행하지 않는다', () => {
    expect(collected).toBe(false);
  });
});
